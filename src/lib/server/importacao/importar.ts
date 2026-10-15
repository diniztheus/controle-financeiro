/**
 * Importa os dados do app atual (Artifact v3) para o banco local, numa transação única:
 * ou entra tudo, ou nada.
 *
 * - Só importa num banco sem contas, compras, cartões nem bitcoin (categorias padrão podem
 *   existir: são casadas pelo nome). Assim rodar duas vezes nunca duplica nada.
 * - Ids novos (ULID); datas de criação do app atual preservadas.
 * - Categorias na ordem e com as cores que o app atual mostrava; categorias que só aparecem em
 *   gastos antigos (removidas da lista no app) entram arquivadas.
 * - Compras no cartão geram as parcelas por competência e são ligadas às faturas certas
 *   (dominio/fatura); faturas marcadas como pagas no app entram pagas.
 * - O relatório compara os totais calculados com as regras do app atual (reimplementadas aqui,
 *   de forma independente) com o que ficou gravado no banco.
 */
import { sql } from 'drizzle-orm';
import { chaveCategoria, corPorPosicao } from '../../dominio/categorias.ts';
import { ehTipoConta } from '../../dominio/contas.ts';
import { ehDia, hoje, type Dia, type Mes } from '../../dominio/datas.ts';
import { MAX_PARCELAS, somar, type Centavos } from '../../dominio/dinheiro.ts';
import { dataFechamento, dataVencimento, mesDaFatura } from '../../dominio/fatura.ts';
import { normalizarNome } from '../../dominio/nomes.ts';
import { gerarParcelas } from '../../dominio/parcelas.ts';
import type { Banco } from '../db/conexao.ts';
import {
  btcMovimentos,
  btcPrecos,
  cartoes,
  categorias,
  compras,
  contas,
  faturas,
  limitesMensais,
  parcelas,
  saldosHistorico,
} from '../db/esquema.ts';
import { camposIgnorados, type CartaoApp, type ColecoesApp, type GastoApp } from './formato.ts';

/** As mesmas do app atual, usadas quando o arquivo não traz a lista de categorias. */
const CATEGORIAS_APP = [
  'Alimentação',
  'Mercado',
  'Transporte',
  'Moradia',
  'Contas da casa',
  'Saúde',
  'Lazer',
  'Educação',
  'Compras',
  'Assinaturas',
  'Outros',
];

export interface Diferenca {
  item: string;
  noApp: Centavos;
  noBanco: Centavos;
}

export interface Relatorio {
  simulado: boolean;
  importados: {
    contas: number;
    categorias: number;
    categoriasArquivadas: number;
    /** Categorias que já existiam no site e não estavam na lista do app (ficam arquivadas). */
    categoriasDoSiteArquivadas: number;
    cartoes: number;
    /** Cartões que não existiam mais no app, mas tinham compras (entram na lixeira). */
    cartoesRemovidos: number;
    gastos: number;
    gastosNoCartao: number;
    parcelas: number;
    faturas: number;
    faturasPagas: number;
    movimentosBitcoin: number;
    precosBitcoin: number;
    limite: Centavos | null;
  };
  /** Ajustes feitos para caber nas regras do banco (nome repetido, conta inexistente…). */
  avisos: string[];
  /** Totais conferidos (app atual × banco). */
  conferencia: {
    saldoContas: { noApp: Centavos; noBanco: Centavos };
    meses: number;
    faturas: number;
    sats: { noApp: number; noBanco: number };
    diferencas: Diferenca[];
  };
}

// Sem "parameter properties": os scripts rodam no Node com remoção simples de tipos.
export class ErroImportacao extends Error {
  readonly problemas: string[];
  constructor(problemas: string[]) {
    super(`A importação foi cancelada (nada foi gravado):\n- ${problemas.join('\n- ')}`);
    this.problemas = problemas;
    this.name = 'ErroImportacao';
  }
}

class Simulacao extends Error {}

// ------------------------------------------------- regras do app atual (para a conferência)

const pad2 = (n: number) => String(n).padStart(2, '0');

function diasNoMesApp(ym: string): number {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function shiftMesApp(ym: string, d: number): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}`;
}
function nParcelasApp(g: GastoApp): number {
  return g.meio === 'cartao' ? Math.max(1, Math.min(48, Number(g.parcelas) || 1)) : 1;
}
function valorParcelaApp(v: number, n: number, i: number): number {
  const base = Math.floor(v / n);
  return i === 0 ? v - base * (n - 1) : base;
}
function faturaDeApp(c: { fechamento: number; vencimento: number }, iso: string, i: number) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const f = c.fechamento || 1;
  const v = c.vencimento || 10;
  let ym = `${y}-${pad2(m)}`;
  if (d >= Math.min(f, diasNoMesApp(ym))) ym = shiftMesApp(ym, 1);
  if (v <= f) ym = shiftMesApp(ym, 1);
  return shiftMesApp(ym, i);
}

// ------------------------------------------------- auxiliares

function diaCurto(v: string | null | undefined): Dia | null {
  if (!v) return null;
  if (ehDia(v)) return v;
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? null : hoje(t);
}

function isoOu(v: string | undefined, padrao: string): string {
  return v && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : padrao;
}

/**
 * Dia de fechamento/vencimento como o app usava: vazio ou 0 vira o padrão (`|| 1`, `|| 10`);
 * acima de 31 vale como o fim do mês (o app limitava ao tamanho do mês), então vira 31.
 */
function diaCartao(v: unknown, padrao: number, avisar: (msg: string) => void): number {
  const n = Math.trunc(Number(v));
  if (Number.isFinite(n) && n >= 1 && n <= 31) return n;
  if (Number.isFinite(n) && n > 31) {
    avisar(`dia ${String(v)} virou 31 (fim do mês, como o app tratava)`);
    return 31;
  }
  if (v !== undefined && v !== null && v !== '' && v !== 0)
    avisar(`dia "${String(v)}" virou ${padrao}`);
  return padrao;
}

/** "2026-09-05" ou "2026-09-05T12:00:00Z" → "2026-09-05"; outra coisa → null. */
function dataDoApp(v: string): { dia: Dia; ajustada: boolean } | null {
  const curta = v.slice(0, 10);
  if (!ehDia(curta)) return null;
  if (curta === v) return { dia: curta, ajustada: false };
  return /^\d{4}-\d{2}-\d{2}T/.test(v) ? { dia: curta, ajustada: true } : null;
}

function contarLinhas(banco: Banco, tabela: string): number {
  return (banco.sqlite.prepare(`SELECT count(*) AS n FROM "${tabela}"`).get() as { n: number }).n;
}

/** O banco ainda não tem dados do usuário (além de categorias e preferências)? */
export function bancoSemDados(banco: Banco): boolean {
  return ['contas', 'compras', 'cartoes', 'btc_movimentos'].every(
    (t) => contarLinhas(banco, t) === 0,
  );
}

// ------------------------------------------------- importação

export function importarDoApp(
  banco: Banco,
  dados: ColecoesApp,
  opcoes: {
    simular?: boolean;
    agora?: Date;
    aceitarDiferencas?: boolean;
    /** Só para testes: altera a conferência antes da decisão de gravar. */
    aoConferir?: (c: Relatorio['conferencia']) => void;
  } = {},
): Relatorio {
  if (!bancoSemDados(banco)) {
    throw new ErroImportacao([
      'O banco já tem contas, gastos, cartões ou bitcoin. A importação só roda num banco novo, ' +
        'para nunca duplicar dados. Use outra pasta de dados (DADOS_DIR no .env).',
    ]);
  }
  const agoraIso = (opcoes.agora ?? new Date()).toISOString();
  let relatorio: Relatorio | null = null;
  try {
    banco.sqlite
      .transaction(() => {
        const r = gravar(banco, dados, agoraIso, !!opcoes.simular);
        opcoes.aoConferir?.(r.conferencia);
        relatorio = r;
        if (opcoes.simular) throw new Simulacao();
        // Totais que não batem cancelam tudo: nada fica gravado pela metade.
        if (r.conferencia.diferencas.length && !opcoes.aceitarDiferencas) {
          throw new ErroImportacao([
            ...r.conferencia.diferencas.map(
              (d) => `${d.item}: app ${d.noApp} × banco ${d.noBanco} (centavos/sats)`,
            ),
            'Os totais não bateram com as regras do app atual. Rode com --simular para ver o ' +
              'relatório; se as diferenças forem esperadas, use --aceitar-diferencas.',
          ]);
        }
      })
      .immediate();
  } catch (e) {
    if (!(e instanceof Simulacao)) throw e;
  }
  return relatorio!;
}

function gravar(banco: Banco, dados: ColecoesApp, agoraIso: string, simulado: boolean): Relatorio {
  const { db } = banco;
  const problemas: string[] = [];
  const avisos: string[] = camposIgnorados(dados);

  // ---- categorias: lista do app (na ordem) + as que só aparecem em gastos (arquivadas)
  const cfgCat = dados.config.find((c) => c.id === 'categorias');
  const lista = (cfgCat?.lista?.length ? cfgCat.lista : CATEGORIAS_APP)
    .map(normalizarNome)
    .filter((n, i, a) => n && a.findIndex((x) => chaveCategoria(x) === chaveCategoria(n)) === i);
  const extras = dados.gastos
    .map((g) => normalizarNome(g.categoria || 'Outros'))
    .filter(
      (n, i, a) =>
        !lista.some((l) => chaveCategoria(l) === chaveCategoria(n)) &&
        a.findIndex((x) => chaveCategoria(x) === chaveCategoria(n)) === i,
    );
  const existentes = new Map(
    db
      .select()
      .from(categorias)
      .all()
      .map((c) => [chaveCategoria(c.nome), c]),
  );
  const idCategoria = new Map<string, string>();
  let categoriasNovas = 0;
  [...lista, ...extras].forEach((nome, ordem) => {
    const arquivada = ordem >= lista.length;
    const chave = chaveCategoria(nome);
    const atual = existentes.get(chave);
    // Cor como o app atual mostrava: pela posição na lista.
    const valores = { nome, cor: corPorPosicao(ordem), ordem, arquivada, atualizadoEm: agoraIso };
    if (atual) {
      db.update(categorias)
        .set(valores)
        .where(sql`${categorias.id} = ${atual.id}`)
        .run();
      idCategoria.set(chave, atual.id);
    } else {
      const c = db.insert(categorias).values(valores).returning().get();
      idCategoria.set(chave, c.id);
      categoriasNovas++;
    }
  });
  // Categorias que o site já tinha (as padrão) e o app não usava: ficam arquivadas, no fim,
  // com cores seguintes, para a lista ficar igual à do app.
  const casadas = new Set(idCategoria.values());
  let doSiteArquivadas = 0;
  for (const c of existentes.values()) {
    if (casadas.has(c.id)) continue;
    const ordem = lista.length + extras.length + doSiteArquivadas;
    db.update(categorias)
      .set({ arquivada: true, ordem, cor: corPorPosicao(ordem), atualizadoEm: agoraIso })
      .where(sql`${categorias.id} = ${c.id}`)
      .run();
    doSiteArquivadas++;
  }
  if (doSiteArquivadas) {
    avisos.push(
      `${doSiteArquivadas} categoria(s) padrão do site que o app não tinha ficaram arquivadas.`,
    );
  }

  // ---- contas (+ primeiro registro do histórico)
  const idConta = new Map<string, string>();
  const nomesConta = new Set<string>();
  const contasOrdenadas = [...dados.contas].sort((a, b) =>
    (a.criadoEm ?? '').localeCompare(b.criadoEm ?? ''),
  );
  contasOrdenadas.forEach((c, ordem) => {
    let nome = normalizarNome(c.nome) || 'Conta sem nome';
    for (let n = 2; nomesConta.has(chaveCategoria(nome)); n++) {
      nome = `${normalizarNome(c.nome)} (${n})`;
    }
    if (!normalizarNome(c.nome)) avisos.push(`Conta sem nome: entrou como "${nome}".`);
    else if (nome !== normalizarNome(c.nome))
      avisos.push(`Conta "${c.nome}" repetida: entrou como "${nome}".`);
    nomesConta.add(chaveCategoria(nome));
    const tipo = ehTipoConta(c.tipo) ? c.tipo : 'outro';
    if (c.tipo && !ehTipoConta(c.tipo))
      avisos.push(`Conta "${nome}": tipo "${c.tipo}" virou "outro".`);
    const criado = isoOu(c.criadoEm, agoraIso);
    const atualizado = isoOu(c.atualizadoEm, criado);
    const nova = db
      .insert(contas)
      .values({
        nome,
        tipo,
        saldoCentavos: c.saldo ?? 0,
        ordem,
        criadoEm: criado,
        atualizadoEm: atualizado,
      })
      .returning()
      .get();
    db.insert(saldosHistorico)
      .values({ contaId: nova.id, saldoCentavos: c.saldo ?? 0, registradoEm: atualizado })
      .run();
    idConta.set(c.id, nova.id);
  });

  // ---- cartões
  const cartaoNovo = new Map<
    string,
    { id: string; diaFechamento: number; diaVencimento: number }
  >();
  const cartaoApp = new Map<string, CartaoApp>();
  for (const k of [...dados.cartoes].sort((a, b) =>
    (a.criadoEm ?? '').localeCompare(b.criadoEm ?? ''),
  )) {
    const avisar = (msg: string) => avisos.push(`Cartão "${k.nome}": ${msg}.`);
    const diaFechamento = diaCartao(k.fechamento, 1, (m) => avisar(`fechamento, ${m}`));
    const diaVencimento = diaCartao(k.vencimento, 10, (m) => avisar(`vencimento, ${m}`));
    if ((k.limite ?? 0) < 0) problemas.push(`Cartão "${k.nome}": limite negativo.`);
    const criado = isoOu(k.criadoEm, agoraIso);
    const novo = db
      .insert(cartoes)
      .values({
        nome: normalizarNome(k.nome) || 'Cartão sem nome',
        limiteCentavos: Math.max(0, k.limite ?? 0),
        diaFechamento,
        diaVencimento,
        criadoEm: criado,
        atualizadoEm: criado,
      })
      .returning()
      .get();
    cartaoNovo.set(k.id, { id: novo.id, diaFechamento, diaVencimento });
    cartaoApp.set(k.id, k);
  }

  // Compras de um cartão que não existe mais no app: o app usava o ciclo padrão (1 e 10).
  // Entra um cartão na lixeira com esse ciclo, para nada se perder.
  let cartoesRemovidos = 0;
  function cartaoRemovido(appId: string): string {
    if (cartaoNovo.has(appId)) return appId;
    const novo = db
      .insert(cartoes)
      .values({
        nome: `Cartão removido no app (${appId.slice(0, 8)})`,
        diaFechamento: 1,
        diaVencimento: 10,
        ativo: false,
        criadoEm: agoraIso,
        atualizadoEm: agoraIso,
        removidoEm: agoraIso,
      })
      .returning()
      .get();
    cartaoNovo.set(appId, { id: novo.id, diaFechamento: 1, diaVencimento: 10 });
    cartoesRemovidos++;
    avisos.push(
      `Compras de um cartão que não existe mais no app entraram num cartão na lixeira (${novo.nome}).`,
    );
    return appId;
  }

  // ---- faturas (criadas sob demanda, uma por cartão e mês de vencimento)
  const idFatura = new Map<string, string>();
  function fatura(cartaoAppId: string, mes: Mes): string {
    const chave = `${cartaoAppId}__${mes}`;
    const ja = idFatura.get(chave);
    if (ja) return ja;
    const k = cartaoNovo.get(cartaoAppId)!;
    const f = db
      .insert(faturas)
      .values({
        cartaoId: k.id,
        mesVencimento: mes,
        dataFechamento: dataFechamento(k, mes),
        dataVencimento: dataVencimento(k, mes),
      })
      .returning()
      .get();
    idFatura.set(chave, f.id);
    return f.id;
  }

  // ---- gastos → compras + parcelas
  let nParcelas = 0;
  let noCartao = 0;
  const gastosOrdenados = [...dados.gastos].sort((a, b) =>
    (a.criadoEm ?? '').localeCompare(b.criadoEm ?? ''),
  );
  for (const g of gastosOrdenados) {
    const rotulo = `Gasto "${g.descricao || g.categoria || g.id}" de ${g.data}`;
    const data = dataDoApp(g.data);
    if (!data) {
      problemas.push(`${rotulo}: data inválida.`);
      continue;
    }
    if (data.ajustada) avisos.push(`${rotulo}: data com hora; ficou ${data.dia}.`);
    const dia = data.dia;
    if (g.valor <= 0) {
      problemas.push(`${rotulo}: valor precisa ser maior que zero (${g.valor}).`);
      continue;
    }
    const meio = g.meio === 'cartao' ? 'cartao' : 'conta';
    const n = nParcelasApp(g);
    if (!Number.isInteger(n)) {
      problemas.push(`${rotulo}: número de parcelas "${String(g.parcelas)}" não é inteiro.`);
      continue;
    }
    if (meio === 'cartao' && g.parcelas != null && Number(g.parcelas) !== n) {
      avisos.push(`${rotulo}: parcelas "${String(g.parcelas)}" viraram ${n}, como no app.`);
    }
    // O formulário do app só oferecia de 1 a 24 parcelas.
    if (n > MAX_PARCELAS) {
      problemas.push(`${rotulo}: ${n} parcelas (o site aceita até ${MAX_PARCELAS}).`);
      continue;
    }
    let contaId: string | null = null;
    let cartaoAppId: string | null = null;
    if (meio === 'conta' && g.contaId) {
      contaId = idConta.get(g.contaId) ?? null;
      if (!contaId) avisos.push(`${rotulo}: a conta não existe mais no app; entrou sem conta.`);
    }
    if (meio === 'cartao') cartaoAppId = cartaoRemovido(g.cartaoId || '(sem cartão)');
    const criado = isoOu(g.criadoEm, agoraIso);
    const compra = db
      .insert(compras)
      .values({
        descricao: normalizarNome(g.descricao ?? '') || null,
        categoriaId: idCategoria.get(chaveCategoria(normalizarNome(g.categoria || 'Outros')))!,
        dataCompra: dia,
        valorTotalCentavos: g.valor,
        meio,
        contaId,
        cartaoId: cartaoAppId ? cartaoNovo.get(cartaoAppId)!.id : null,
        numParcelas: n,
        criadoEm: criado,
        atualizadoEm: criado,
      })
      .returning()
      .get();
    const k = cartaoAppId ? cartaoNovo.get(cartaoAppId)! : null;
    for (const p of gerarParcelas(dia, g.valor, n)) {
      db.insert(parcelas)
        .values({
          compraId: compra.id,
          numero: p.numero,
          valorCentavos: p.valorCentavos,
          mesCompetencia: p.mesCompetencia,
          faturaId: k ? fatura(cartaoAppId!, mesDaFatura(k, dia, p.numero - 1)) : null,
        })
        .run();
      nParcelas++;
    }
    if (meio === 'cartao') noCartao++;
  }

  // ---- faturas pagas
  let pagas = 0;
  for (const f of dados.faturas) {
    // Id do app: "<cartaoId>__AAAA-MM" (o id do cartão pode ter "__").
    const corte = f.id.lastIndexOf('__');
    const cartaoAppId = f.cartaoId ?? (corte > 0 ? f.id.slice(0, corte) : '');
    const mes = f.mes ?? (corte > 0 ? f.id.slice(corte + 2) : '');
    const pagaEm = f.paga === false ? null : diaCurto(f.pagaEm);
    if (!pagaEm) {
      avisos.push(`Fatura "${f.id}" sem data de pagamento: entrou como não paga.`);
      continue;
    }
    if (!cartaoNovo.has(cartaoAppId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      avisos.push(`Fatura paga "${f.id}" ignorada: cartão ou mês inexistente.`);
      continue;
    }
    const id = fatura(cartaoAppId, mes);
    const total = (
      banco.sqlite
        .prepare('SELECT coalesce(sum(valor_centavos), 0) AS t FROM parcelas WHERE fatura_id = ?')
        .get(id) as { t: number }
    ).t;
    db.update(faturas)
      .set({ pagaEm, valorPagoCentavos: total })
      .where(sql`${faturas.id} = ${id}`)
      .run();
    pagas++;
  }

  // ---- bitcoin
  for (const m of dados.bitcoin) {
    const data = dataDoApp(m.data);
    if (!data) {
      problemas.push(`Movimento de bitcoin ${m.id}: data inválida (${m.data}).`);
      continue;
    }
    if (data.ajustada)
      avisos.push(`Movimento de bitcoin ${m.id}: data com hora; ficou ${data.dia}.`);
    if (m.sats === 0) {
      avisos.push(`Movimento de bitcoin de ${m.data} com 0 sats ignorado.`);
      continue;
    }
    if ((m.valor ?? 0) < 0) {
      avisos.push(`Movimento de bitcoin de ${data.dia}: valor negativo guardado como positivo.`);
    }
    const criado = isoOu(m.criadoEm, agoraIso);
    db.insert(btcMovimentos)
      .values({
        sats: m.sats,
        valorCentavos: Math.abs(m.valor ?? 0),
        data: data.dia,
        nota: normalizarNome(m.nota ?? '') || null,
        criadoEm: criado,
        atualizadoEm: criado,
      })
      .run();
  }
  let nPrecos = 0;
  const vistosPreco = new Set<string>();
  for (const p of dados.btcPrecos) {
    if (!ehDia(p.id) || p.valor <= 0) {
      avisos.push(`Preço do bitcoin "${p.id}" ignorado (data ou valor inválido).`);
      continue;
    }
    db.insert(btcPrecos)
      .values({ data: p.id, precoCentavos: p.valor, origem: 'manual' })
      .onConflictDoUpdate({ target: btcPrecos.data, set: { precoCentavos: p.valor } })
      .run();
    if (vistosPreco.has(p.id)) avisos.push(`Preço do bitcoin de ${p.id} repetido: ficou o último.`);
    else nPrecos++;
    vistosPreco.add(p.id);
  }

  // ---- limite
  const lim = dados.config.find((c) => c.id === 'limite')?.valor ?? 0;
  if (lim > 0) {
    const antes = db
      .select()
      .from(limitesMensais)
      .where(sql`${limitesMensais.mes} = 'padrao'`)
      .get();
    if (antes && antes.valorCentavos !== lim) {
      avisos.push('O limite do mês definido no site foi substituído pelo do app.');
    }
    db.insert(limitesMensais)
      .values({ mes: 'padrao', valorCentavos: lim })
      .onConflictDoUpdate({ target: limitesMensais.mes, set: { valorCentavos: lim } })
      .run();
  }
  // Outras preferências do app que o site não usa: só avisa.
  for (const c of dados.config) {
    if (c.id !== 'categorias' && c.id !== 'limite') {
      avisos.push(`Preferência "${c.id}" do app não tem equivalente no site e foi ignorada.`);
    }
  }

  if (problemas.length) throw new ErroImportacao(problemas);

  return {
    simulado,
    importados: {
      contas: idConta.size,
      categorias: categoriasNovas,
      categoriasArquivadas: extras.length,
      categoriasDoSiteArquivadas: doSiteArquivadas,
      cartoes: cartaoNovo.size - cartoesRemovidos,
      cartoesRemovidos,
      gastos: gastosOrdenados.length,
      gastosNoCartao: noCartao,
      parcelas: nParcelas,
      faturas: idFatura.size,
      faturasPagas: pagas,
      movimentosBitcoin: contarLinhas(banco, 'btc_movimentos'),
      precosBitcoin: nPrecos,
      limite: lim > 0 ? lim : null,
    },
    avisos,
    conferencia: conferir(
      banco,
      dados,
      cartaoApp,
      new Map([...cartaoNovo].map(([appId, k]) => [appId, k.id])),
    ),
  };
}

/** Totais pelas regras do app atual × o que está no banco. */
function conferir(
  banco: Banco,
  dados: ColecoesApp,
  cartaoApp: Map<string, CartaoApp>,
  /** id do cartão no app → id no banco */
  idCartao: Map<string, string>,
): Relatorio['conferencia'] {
  const s = banco.sqlite;
  const diferencas: Diferenca[] = [];

  const saldoApp = somar(dados.contas.map((c) => c.saldo ?? 0));
  const saldoBanco = (
    s.prepare('SELECT coalesce(sum(saldo_centavos), 0) AS t FROM contas').get() as {
      t: number;
    }
  ).t;
  if (saldoApp !== saldoBanco)
    diferencas.push({ item: 'Saldo das contas', noApp: saldoApp, noBanco: saldoBanco });

  // Gastos por mês (competência), como o painel do app atual soma.
  const porMesApp = new Map<string, number>();
  for (const g of dados.gastos) {
    const data = dataDoApp(g.data);
    if (!data) continue;
    const n = nParcelasApp(g);
    for (let i = 0; i < n; i++) {
      const mes = shiftMesApp(data.dia.slice(0, 7), i);
      porMesApp.set(mes, (porMesApp.get(mes) ?? 0) + valorParcelaApp(g.valor, n, i));
    }
  }
  const porMesBanco = new Map(
    (
      s
        .prepare(
          'SELECT mes_competencia AS m, sum(valor_centavos) AS t FROM parcelas GROUP BY mes_competencia',
        )
        .all() as { m: string; t: number }[]
    ).map((r) => [r.m, r.t]),
  );
  for (const mes of new Set([...porMesApp.keys(), ...porMesBanco.keys()])) {
    const a = porMesApp.get(mes) ?? 0;
    const b = porMesBanco.get(mes) ?? 0;
    if (a !== b) diferencas.push({ item: `Gastos de ${mes}`, noApp: a, noBanco: b });
  }

  // Faturas: total por cartão (pelo id, não pelo nome) e mês de vencimento. Como no app, só
  // cartões que ainda existem têm faturas.
  const nomeCartao = new Map([...cartaoApp].map(([appId, k]) => [idCartao.get(appId)!, k.nome]));
  const porFaturaApp = new Map<string, number>();
  for (const g of dados.gastos) {
    const data = dataDoApp(g.data);
    if (g.meio !== 'cartao' || !g.cartaoId || !data) continue;
    const k = cartaoApp.get(g.cartaoId);
    if (!k) continue;
    const ciclo = {
      // Mesmo arredondamento da gravação (dias inteiros; acima de 31 vale 31).
      fechamento: Math.min(31, Math.trunc(Number(k.fechamento)) || 1),
      vencimento: Math.min(31, Math.trunc(Number(k.vencimento)) || 10),
    };
    const n = nParcelasApp(g);
    for (let i = 0; i < n; i++) {
      const chave = `${idCartao.get(g.cartaoId)} ${faturaDeApp(ciclo, data.dia, i)}`;
      porFaturaApp.set(chave, (porFaturaApp.get(chave) ?? 0) + valorParcelaApp(g.valor, n, i));
    }
  }
  const porFaturaBanco = new Map(
    (
      s
        .prepare(
          `SELECT k.id || ' ' || f.mes_vencimento AS c, coalesce(sum(p.valor_centavos), 0) AS t
             FROM faturas f JOIN cartoes k ON k.id = f.cartao_id AND k.removido_em IS NULL
             LEFT JOIN parcelas p ON p.fatura_id = f.id
            GROUP BY f.id`,
        )
        .all() as { c: string; t: number }[]
    )
      .filter((r) => r.t > 0)
      .map((r) => [r.c, r.t]),
  );
  for (const chave of new Set([...porFaturaApp.keys(), ...porFaturaBanco.keys()])) {
    const a = porFaturaApp.get(chave) ?? 0;
    const b = porFaturaBanco.get(chave) ?? 0;
    const [id, mes] = chave.split(' ');
    if (a !== b) {
      diferencas.push({ item: `Fatura ${nomeCartao.get(id!) ?? id} ${mes}`, noApp: a, noBanco: b });
    }
  }

  const satsApp = dados.bitcoin.filter((m) => dataDoApp(m.data)).reduce((t, m) => t + m.sats, 0);
  const satsBanco = (
    s.prepare('SELECT coalesce(sum(sats), 0) AS t FROM btc_movimentos').get() as {
      t: number;
    }
  ).t;
  if (satsApp !== satsBanco) diferencas.push({ item: 'Sats', noApp: satsApp, noBanco: satsBanco });
  // Mesmos movimentos que a importação grava (pula 0 sats e data inválida).
  const valorBtcApp = dados.bitcoin
    .filter((m) => m.sats !== 0 && dataDoApp(m.data))
    .reduce((t, m) => t + Math.abs(m.valor ?? 0), 0);
  const valorBtcBanco = (
    s.prepare('SELECT coalesce(sum(valor_centavos), 0) AS t FROM btc_movimentos').get() as {
      t: number;
    }
  ).t;
  if (valorBtcApp !== valorBtcBanco) {
    diferencas.push({ item: 'Valores do bitcoin', noApp: valorBtcApp, noBanco: valorBtcBanco });
  }

  return {
    saldoContas: { noApp: saldoApp, noBanco: saldoBanco },
    meses: porMesApp.size,
    faturas: porFaturaApp.size,
    sats: { noApp: satsApp, noBanco: satsBanco },
    diferencas,
  };
}

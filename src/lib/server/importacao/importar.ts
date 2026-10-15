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
import type { CartaoApp, ColecoesApp, GastoApp } from './formato.ts';

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
    cartoes: number;
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

function diaCartao(v: unknown, padrao: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : padrao;
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
  opcoes: { simular?: boolean; agora?: Date } = {},
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
        relatorio = gravar(banco, dados, agoraIso, !!opcoes.simular);
        if (opcoes.simular) throw new Simulacao();
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
  const avisos: string[] = [];

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
    const valores = { nome, cor: corPorPosicao(ordem), ordem, arquivada };
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
  // Categorias padrão do site que o app não tinha ficam no fim, sem mexer.

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
    if (nome !== normalizarNome(c.nome))
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
    const diaFechamento = diaCartao(k.fechamento, 1);
    const diaVencimento = diaCartao(k.vencimento, 10);
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
    if (!ehDia(g.data)) {
      problemas.push(`${rotulo}: data inválida.`);
      continue;
    }
    if (g.valor <= 0) {
      problemas.push(`${rotulo}: valor precisa ser maior que zero (${g.valor}).`);
      continue;
    }
    const meio = g.meio === 'cartao' ? 'cartao' : 'conta';
    const n = nParcelasApp(g);
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
    if (meio === 'cartao') {
      cartaoAppId = g.cartaoId && cartaoNovo.has(g.cartaoId) ? g.cartaoId : null;
      if (!cartaoAppId) {
        problemas.push(`${rotulo}: o cartão da compra não existe no arquivo.`);
        continue;
      }
    }
    const criado = isoOu(g.criadoEm, agoraIso);
    const compra = db
      .insert(compras)
      .values({
        descricao: normalizarNome(g.descricao ?? '') || null,
        categoriaId: idCategoria.get(chaveCategoria(normalizarNome(g.categoria || 'Outros')))!,
        dataCompra: g.data,
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
    for (const p of gerarParcelas(g.data, g.valor, n)) {
      db.insert(parcelas)
        .values({
          compraId: compra.id,
          numero: p.numero,
          valorCentavos: p.valorCentavos,
          mesCompetencia: p.mesCompetencia,
          faturaId: k ? fatura(cartaoAppId!, mesDaFatura(k, g.data, p.numero - 1)) : null,
        })
        .run();
      nParcelas++;
    }
    if (meio === 'cartao') noCartao++;
  }

  // ---- faturas pagas
  let pagas = 0;
  for (const f of dados.faturas) {
    const [idCartaoApp, mesId] = f.id.split('__');
    const cartaoAppId = f.cartaoId ?? idCartaoApp ?? '';
    const mes = f.mes ?? mesId ?? '';
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
      .set({ pagaEm: diaCurto(f.pagaEm) ?? hoje(new Date(agoraIso)), valorPagoCentavos: total })
      .where(sql`${faturas.id} = ${id}`)
      .run();
    pagas++;
  }

  // ---- bitcoin
  for (const m of dados.bitcoin) {
    if (!ehDia(m.data)) {
      problemas.push(`Movimento de bitcoin ${m.id}: data inválida (${m.data}).`);
      continue;
    }
    if (m.sats === 0) {
      avisos.push(`Movimento de bitcoin de ${m.data} com 0 sats ignorado.`);
      continue;
    }
    const criado = isoOu(m.criadoEm, agoraIso);
    db.insert(btcMovimentos)
      .values({
        sats: m.sats,
        valorCentavos: Math.max(0, m.valor ?? 0),
        data: m.data,
        nota: normalizarNome(m.nota ?? '') || null,
        criadoEm: criado,
        atualizadoEm: criado,
      })
      .run();
  }
  let nPrecos = 0;
  for (const p of dados.btcPrecos) {
    if (!ehDia(p.id) || p.valor <= 0) {
      avisos.push(`Preço do bitcoin "${p.id}" ignorado (data ou valor inválido).`);
      continue;
    }
    db.insert(btcPrecos).values({ data: p.id, precoCentavos: p.valor, origem: 'manual' }).run();
    nPrecos++;
  }

  // ---- limite
  const lim = dados.config.find((c) => c.id === 'limite')?.valor ?? 0;
  if (lim > 0) db.insert(limitesMensais).values({ mes: 'padrao', valorCentavos: lim }).run();

  if (problemas.length) throw new ErroImportacao(problemas);

  return {
    simulado,
    importados: {
      contas: idConta.size,
      categorias: categoriasNovas,
      categoriasArquivadas: extras.length,
      cartoes: cartaoNovo.size,
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
    conferencia: conferir(banco, dados, cartaoApp),
  };
}

/** Totais pelas regras do app atual × o que está no banco. */
function conferir(
  banco: Banco,
  dados: ColecoesApp,
  cartaoApp: Map<string, CartaoApp>,
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
    if (!ehDia(g.data)) continue;
    const n = nParcelasApp(g);
    for (let i = 0; i < n; i++) {
      const mes = shiftMesApp(g.data.slice(0, 7), i);
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

  // Faturas: total por cartão e mês de vencimento.
  const porFaturaApp = new Map<string, number>();
  for (const g of dados.gastos) {
    if (g.meio !== 'cartao' || !g.cartaoId || !ehDia(g.data)) continue;
    const k = cartaoApp.get(g.cartaoId);
    if (!k) continue;
    const ciclo = { fechamento: Number(k.fechamento) || 1, vencimento: Number(k.vencimento) || 10 };
    const n = nParcelasApp(g);
    for (let i = 0; i < n; i++) {
      const chave = `${k.nome} ${faturaDeApp(ciclo, g.data, i)}`;
      porFaturaApp.set(chave, (porFaturaApp.get(chave) ?? 0) + valorParcelaApp(g.valor, n, i));
    }
  }
  const porFaturaBanco = new Map(
    (
      s
        .prepare(
          `SELECT k.nome || ' ' || f.mes_vencimento AS c, coalesce(sum(p.valor_centavos), 0) AS t
             FROM faturas f JOIN cartoes k ON k.id = f.cartao_id
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
    if (a !== b) diferencas.push({ item: `Fatura ${chave}`, noApp: a, noBanco: b });
  }

  const satsApp = dados.bitcoin.reduce((t, m) => t + m.sats, 0);
  const satsBanco = (
    s.prepare('SELECT coalesce(sum(sats), 0) AS t FROM btc_movimentos').get() as {
      t: number;
    }
  ).t;
  if (satsApp !== satsBanco) diferencas.push({ item: 'Sats', noApp: satsApp, noBanco: satsBanco });

  return {
    saldoContas: { noApp: saldoApp, noBanco: saldoBanco },
    meses: porMesApp.size,
    faturas: porFaturaApp.size,
    sats: { noApp: satsApp, noBanco: satsBanco },
    diferencas,
  };
}

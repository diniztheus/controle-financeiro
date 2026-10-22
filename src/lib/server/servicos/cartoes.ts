/**
 * Cartões de crédito: cadastro, faturas e dívida.
 *
 * Regras da casa (ver docs/PLANO-SITE-LOCAL.md):
 * - a fatura é identificada pelo mês do vencimento; a linha de `faturas` nasce ao lançar a
 *   primeira parcela daquele mês (ou ao pagar). Mês sem parcelas aparece vazio, sem linha;
 * - pagar fatura NÃO altera o saldo das contas;
 * - a dívida dos cartões é a soma das parcelas (inclusive futuras) de compras e cartões fora
 *   da lixeira cujas faturas não estão pagas; ela NÃO entra no patrimônio (só contas e bitcoin);
 * - mudar fechamento/vencimento vale só para compras novas: as parcelas já ligadas continuam
 *   nas faturas que tinham;
 * - arquivar esconde o cartão dos formulários novos e mantém o histórico; remover manda para a
 *   lixeira (sai de todas as somas e listas) e não apaga nada.
 *
 * Escritas que mexem em mais de uma tabela rodam numa transação IMMEDIATE.
 */
import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import {
  ehDia,
  ehMes,
  hoje as hojeDe,
  somarMeses,
  type Dia,
  type Mes,
} from '../../dominio/datas.ts';
import {
  limiteDisponivel,
  situacaoFatura,
  totalDaFatura,
  type ItemFatura,
  type SituacaoFatura,
} from '../../dominio/cartoes.ts';
import { ehCentavos, somar, type Centavos } from '../../dominio/dinheiro.ts';
import {
  dataFechamento,
  dataVencimento,
  mesDaFatura,
  type CicloCartao,
} from '../../dominio/fatura.ts';
import { chaveNome, normalizarNome } from '../../dominio/nomes.ts';
import type { Banco, BancoDrizzle } from '../db/conexao.ts';
import { cartoes, categorias, compras, faturas, parcelas } from '../db/esquema.ts';
import { agoraIso, ErroDeNegocio, naoEncontrado } from './erros.ts';

export type Cartao = typeof cartoes.$inferSelect;

export interface DadosCartao {
  nome: string;
  limiteCentavos: Centavos;
  diaFechamento: number;
  diaVencimento: number;
}

export interface CartaoNaLista extends Cartao {
  /** Soma das parcelas em faturas não pagas (inclusive futuras). */
  aPagarCentavos: Centavos;
  /** Limite menos o que está a pagar; `null` sem limite definido. */
  disponivelCentavos: Centavos | null;
  /** Fatura não paga mais antiga que tem compras; `null` se não há nenhuma. */
  proximaFatura: { mes: Mes; vencimento: Dia; totalCentavos: Centavos } | null;
  /**
   * A fatura a pagar agora: a não paga mais antiga até a do ciclo de hoje (fechada ou vencida
   * contam), senão a do ciclo de hoje. Só as parcelas daquele mês, não a dívida inteira.
   */
  faturaAtual: ResumoFatura;
  /** A fatura do mês seguinte à atual (parcelas futuras já lançadas). */
  faturaSeguinte: ResumoFatura;
}

export interface ResumoFatura {
  mes: Mes;
  vencimento: Dia;
  totalCentavos: Centavos;
  paga: boolean;
}

export interface FaturaDetalhada {
  cartao: Cartao;
  mes: Mes;
  /** Linha de `faturas`; `null` enquanto nenhuma parcela caiu neste mês. */
  fatura: typeof faturas.$inferSelect | null;
  dataFechamento: Dia;
  dataVencimento: Dia;
  /** Parcelas da fatura, mais recente primeiro. */
  itens: ItemFatura[];
  totalCentavos: Centavos;
  situacao: SituacaoFatura;
  pagaEm: Dia | null;
  valorPagoCentavos: Centavos | null;
  anterior: Mes;
  proximo: Mes;
}

export interface FaturaNaLista {
  mes: Mes;
  vencimento: Dia;
  totalCentavos: Centavos;
  situacao: SituacaoFatura;
}

type Leitor = Pick<BancoDrizzle, 'select'>;
type Tx = Parameters<Parameters<BancoDrizzle['transaction']>[0]>[0];

const IMEDIATA = { behavior: 'immediate' } as const;

/** Mês como o usuário lê: "10/2026". */
function rotuloMes(mes: Mes): string {
  return `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
}

function msgFaturaPaga(mes: Mes): string {
  return `Desfaça o pagamento da fatura de ${rotuloMes(mes)} primeiro.`;
}

function exigirMesValido(mes: string): void {
  if (!ehMes(mes)) throw naoEncontrado('Esta fatura não existe');
}

function validarDados(d: DadosCartao): DadosCartao {
  const nome = normalizarNome(d.nome);
  if (nome === '') throw new ErroDeNegocio('O nome é obrigatório.', 'nome');
  if (nome.length > 60) throw new ErroDeNegocio('O nome pode ter até 60 caracteres.', 'nome');
  if (!ehCentavos(d.limiteCentavos) || d.limiteCentavos < 0) {
    throw new ErroDeNegocio('O limite não pode ser negativo.', 'limite');
  }
  for (const [campo, rotulo, valor] of [
    ['diaFechamento', 'fechamento', d.diaFechamento],
    ['diaVencimento', 'vencimento', d.diaVencimento],
  ] as const) {
    if (!Number.isInteger(valor) || valor < 1 || valor > 31) {
      throw new ErroDeNegocio(`O dia de ${rotulo} vai de 1 a 31.`, campo);
    }
  }
  return {
    nome,
    limiteCentavos: d.limiteCentavos,
    diaFechamento: d.diaFechamento,
    diaVencimento: d.diaVencimento,
  };
}

/** Cartões fora da lixeira (arquivados incluídos), na ordem de cadastro. */
function naoRemovidos(db: Leitor): Cartao[] {
  return db
    .select()
    .from(cartoes)
    .where(isNull(cartoes.removidoEm))
    .orderBy(asc(cartoes.criadoEm), asc(cartoes.id))
    .all();
}

function exigirNomeLivre(db: Leitor, nome: string, excetoId?: string): void {
  const chave = chaveNome(nome);
  const igual = naoRemovidos(db).find((c) => c.id !== excetoId && chaveNome(c.nome) === chave);
  if (igual) throw new ErroDeNegocio(`Já existe o cartão "${igual.nome}".`, 'nome');
}

/** Cartão fora da lixeira; lança "não existe mais" para o resto. */
function exigirNaoRemovido(db: Leitor, id: string): Cartao {
  const c = db.select().from(cartoes).where(eq(cartoes.id, id)).get();
  if (!c || c.removidoEm) throw naoEncontrado('Este cartão não existe mais');
  return c;
}

function cicloDo(c: Pick<Cartao, 'diaFechamento' | 'diaVencimento'>): CicloCartao {
  return { diaFechamento: c.diaFechamento, diaVencimento: c.diaVencimento };
}

/** Cadastra um cartão ativo. */
export function criarCartao(banco: Banco, d: DadosCartao, agora = new Date()): Cartao {
  const v = validarDados(d);
  return banco.db.transaction((tx) => {
    exigirNomeLivre(tx, v.nome);
    const quando = agoraIso(agora);
    return tx
      .insert(cartoes)
      .values({ ...v, ativo: true, criadoEm: quando, atualizadoEm: quando })
      .returning()
      .get();
  }, IMEDIATA);
}

/**
 * Edita nome, limite e dias. Mudar fechamento ou vencimento vale só para compras novas: as
 * parcelas já lançadas continuam nas faturas em que estavam.
 */
export function editarCartao(banco: Banco, id: string, d: DadosCartao, agora = new Date()): Cartao {
  const v = validarDados(d);
  return banco.db.transaction((tx) => {
    exigirNaoRemovido(tx, id);
    exigirNomeLivre(tx, v.nome, id);
    return tx
      .update(cartoes)
      .set({ ...v, atualizadoEm: agoraIso(agora) })
      .where(eq(cartoes.id, id))
      .returning()
      .get();
  }, IMEDIATA);
}

function definirAtivo(banco: Banco, id: string, ativo: boolean, agora: Date): void {
  banco.db.transaction((tx) => {
    exigirNaoRemovido(tx, id);
    tx.update(cartoes)
      .set({ ativo, atualizadoEm: agoraIso(agora) })
      .where(eq(cartoes.id, id))
      .run();
  }, IMEDIATA);
}

/** Some dos formulários novos; compras e faturas continuam. */
export function arquivarCartao(banco: Banco, id: string, agora = new Date()): void {
  definirAtivo(banco, id, false, agora);
}

export function desarquivarCartao(banco: Banco, id: string, agora = new Date()): void {
  definirAtivo(banco, id, true, agora);
}

/** Manda para a lixeira. Não apaga compras nem faturas; saem das somas e das listas. */
export function removerCartao(banco: Banco, id: string, agora = new Date()): void {
  banco.db.transaction((tx) => {
    exigirNaoRemovido(tx, id);
    tx.update(cartoes)
      .set({ removidoEm: agoraIso(agora) })
      .where(eq(cartoes.id, id))
      .run();
  }, IMEDIATA);
}

/** Tira da lixeira. Recusa se já existe outro cartão com o mesmo nome. */
export function restaurarCartao(banco: Banco, id: string): Cartao {
  return banco.db.transaction((tx) => {
    const c = tx.select().from(cartoes).where(eq(cartoes.id, id)).get();
    if (!c) throw naoEncontrado('Este cartão não existe mais');
    if (!c.removidoEm) return c;
    const igual = naoRemovidos(tx).find((o) => chaveNome(o.nome) === chaveNome(c.nome));
    if (igual) {
      throw new ErroDeNegocio(
        `Já existe outro cartão chamado "${igual.nome}". Renomeie-o antes de restaurar este.`,
      );
    }
    return tx
      .update(cartoes)
      .set({ removidoEm: null })
      .where(and(eq(cartoes.id, id), isNotNull(cartoes.removidoEm)))
      .returning()
      .get()!;
  }, IMEDIATA);
}

/** O que os formulários de gasto precisam de um cartão. */
export type CartaoDoFormulario = Pick<Cartao, 'id' | 'nome' | 'diaFechamento' | 'diaVencimento'>;

/**
 * Cartões ativos e fora da lixeira, na ordem de `listarCartoes`, só com o que o seletor do
 * gasto usa. Não calcula faturas nem dívida.
 */
export function cartoesParaFormulario(banco: Banco): CartaoDoFormulario[] {
  return banco.db
    .select({
      id: cartoes.id,
      nome: cartoes.nome,
      diaFechamento: cartoes.diaFechamento,
      diaVencimento: cartoes.diaVencimento,
    })
    .from(cartoes)
    .where(and(isNull(cartoes.removidoEm), eq(cartoes.ativo, true)))
    .orderBy(asc(cartoes.criadoEm), asc(cartoes.id))
    .all();
}

/** Cartão fora da lixeira, ou `undefined`. */
export function obterCartao(banco: Banco, id: string): Cartao | undefined {
  return banco.db
    .select()
    .from(cartoes)
    .where(and(eq(cartoes.id, id), isNull(cartoes.removidoEm)))
    .get();
}

export function cartoesNaLixeira(banco: Banco): Cartao[] {
  return banco.db
    .select()
    .from(cartoes)
    .where(isNotNull(cartoes.removidoEm))
    .orderBy(desc(cartoes.removidoEm), desc(cartoes.id))
    .all();
}

/** Parcelas ainda não pagas (fatura sem `pagaEm`), de um cartão ou de todos. */
function parcelasEmAberto(db: Leitor, cartaoId?: string): { valorCentavos: Centavos }[] {
  return db
    .select({ valorCentavos: parcelas.valorCentavos })
    .from(parcelas)
    .innerJoin(
      compras,
      and(
        eq(compras.id, parcelas.compraId),
        isNull(compras.removidoEm),
        isNotNull(compras.cartaoId),
      ),
    )
    .innerJoin(cartoes, and(eq(cartoes.id, compras.cartaoId), isNull(cartoes.removidoEm)))
    .innerJoin(faturas, and(eq(faturas.id, parcelas.faturaId), isNull(faturas.pagaEm)))
    .where(cartaoId ? eq(compras.cartaoId, cartaoId) : undefined)
    .all();
}

/** Quanto um cartão tem a pagar: parcelas (inclusive futuras) de faturas não pagas. */
export function aPagarDoCartao(banco: Banco, cartaoId: string): Centavos {
  return somar(parcelasEmAberto(banco.db, cartaoId).map((p) => p.valorCentavos));
}

/** Dívida de todos os cartões fora da lixeira (não entra no patrimônio). */
export function aPagarCartoes(banco: Banco): Centavos {
  return somar(parcelasEmAberto(banco.db).map((p) => p.valorCentavos));
}

/** Itens (parcelas) de uma linha de fatura, do mais recente para o mais antigo. */
function itensDaFatura(db: Leitor, faturaId: string): ItemFatura[] {
  return db
    .select({
      compraId: compras.id,
      data: compras.dataCompra,
      descricao: compras.descricao,
      categoriaNome: categorias.nome,
      categoriaCor: categorias.cor,
      valorCentavos: parcelas.valorCentavos,
      parcela: parcelas.numero,
      numParcelas: compras.numParcelas,
    })
    .from(parcelas)
    .innerJoin(compras, and(eq(compras.id, parcelas.compraId), isNull(compras.removidoEm)))
    .innerJoin(categorias, eq(categorias.id, compras.categoriaId))
    .where(eq(parcelas.faturaId, faturaId))
    .orderBy(
      desc(compras.dataCompra),
      desc(compras.criadoEm),
      desc(compras.id),
      asc(parcelas.numero),
    )
    .all()
    .map((i) => ({ ...i }));
}

interface FaturaComTotal {
  mes: Mes;
  dataFechamento: Dia;
  dataVencimento: Dia;
  pagaEm: Dia | null;
  totalCentavos: Centavos;
}

/** Faturas de um cartão que têm parcelas (fora da lixeira), do mês mais novo para o mais antigo. */
function faturasComTotal(db: Leitor, cartaoId: string): FaturaComTotal[] {
  const linhas = db
    .select({
      id: faturas.id,
      mes: faturas.mesVencimento,
      dataFechamento: faturas.dataFechamento,
      dataVencimento: faturas.dataVencimento,
      pagaEm: faturas.pagaEm,
      valorCentavos: parcelas.valorCentavos,
    })
    .from(faturas)
    .innerJoin(parcelas, eq(parcelas.faturaId, faturas.id))
    .innerJoin(compras, and(eq(compras.id, parcelas.compraId), isNull(compras.removidoEm)))
    .where(eq(faturas.cartaoId, cartaoId))
    .all();
  const porFatura = new Map<
    string,
    { f: Omit<FaturaComTotal, 'totalCentavos'>; valores: number[] }
  >();
  for (const l of linhas) {
    const atual = porFatura.get(l.id) ?? {
      f: {
        mes: l.mes,
        dataFechamento: l.dataFechamento,
        dataVencimento: l.dataVencimento,
        pagaEm: l.pagaEm,
      },
      valores: [],
    };
    atual.valores.push(l.valorCentavos);
    porFatura.set(l.id, atual);
  }
  return [...porFatura.values()]
    .map(({ f, valores }) => ({ ...f, totalCentavos: somar(valores) }))
    .sort((a, b) => (a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : 0));
}

/**
 * Cartões fora da lixeira com a dívida, o disponível e a próxima fatura não paga (a mais
 * antiga com compras). Arquivados só entram com `incluirArquivados`.
 */
export function listarCartoes(
  banco: Banco,
  opcoes: { incluirArquivados?: boolean; hoje?: Dia } = {},
): CartaoNaLista[] {
  const dia = opcoes.hoje ?? hojeDe();
  return naoRemovidos(banco.db)
    .filter((c) => opcoes.incluirArquivados || c.ativo)
    .map((c) => {
      const aPagarCentavos = aPagarDoCartao(banco, c.id);
      const todas = faturasComTotal(banco.db, c.id);
      const naoPagas = todas
        .filter((f) => f.pagaEm === null)
        .sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
      const primeira = naoPagas[0];

      const ciclo: CicloCartao = { diaFechamento: c.diaFechamento, diaVencimento: c.diaVencimento };
      const mesDoCiclo = mesDaFatura(ciclo, dia);
      const atrasada = naoPagas.find((f) => f.mes <= mesDoCiclo);
      const mesAtual = atrasada?.mes ?? mesDoCiclo;
      const porMes = new Map(todas.map((f) => [f.mes, f]));
      const resumo = (mes: Mes): ResumoFatura => {
        const f = porMes.get(mes);
        return {
          mes,
          vencimento: f?.dataVencimento ?? dataVencimento(ciclo, mes),
          totalCentavos: f?.totalCentavos ?? 0,
          paga: f ? f.pagaEm !== null : false,
        };
      };
      return {
        ...c,
        faturaAtual: resumo(mesAtual),
        faturaSeguinte: resumo(somarMeses(mesAtual, 1)),
        aPagarCentavos,
        disponivelCentavos: limiteDisponivel(c.limiteCentavos, aPagarCentavos),
        proximaFatura: primeira
          ? {
              mes: primeira.mes,
              vencimento: primeira.dataVencimento,
              totalCentavos: primeira.totalCentavos,
            }
          : null,
      };
    });
}

function exigirCartaoParaFatura(db: Leitor, cartaoId: string, mes: string): Cartao {
  exigirMesValido(mes);
  return exigirNaoRemovido(db, cartaoId);
}

/** Fatura de um mês: itens, datas (da linha, ou calculadas pelo ciclo do cartão), situação. */
export function obterFatura(
  banco: Banco,
  cartaoId: string,
  mes: Mes,
  hoje: Dia = hojeDe(),
): FaturaDetalhada {
  const cartao = exigirCartaoParaFatura(banco.db, cartaoId, mes);
  const linha =
    banco.db
      .select()
      .from(faturas)
      .where(and(eq(faturas.cartaoId, cartaoId), eq(faturas.mesVencimento, mes)))
      .get() ?? null;
  const ciclo = cicloDo(cartao);
  const fechamento = linha?.dataFechamento ?? dataFechamento(ciclo, mes);
  const vencimento = linha?.dataVencimento ?? dataVencimento(ciclo, mes);
  const pagaEm = linha?.pagaEm ?? null;
  const itens = linha ? itensDaFatura(banco.db, linha.id) : [];
  return {
    cartao,
    mes,
    fatura: linha,
    dataFechamento: fechamento,
    dataVencimento: vencimento,
    itens,
    totalCentavos: totalDaFatura(itens),
    situacao: situacaoFatura(
      { dataFechamento: fechamento, dataVencimento: vencimento, pagaEm },
      hoje,
    ),
    pagaEm,
    valorPagoCentavos: linha?.valorPagoCentavos ?? null,
    anterior: somarMeses(mes, -1),
    proximo: somarMeses(mes, 1),
  };
}

/** Meses com parcelas no cartão, do mais novo para o mais antigo. */
export function listarFaturasDoCartao(
  banco: Banco,
  cartaoId: string,
  hoje: Dia = hojeDe(),
): FaturaNaLista[] {
  exigirNaoRemovido(banco.db, cartaoId);
  return faturasComTotal(banco.db, cartaoId).map((f) => ({
    mes: f.mes,
    vencimento: f.dataVencimento,
    totalCentavos: f.totalCentavos,
    situacao: situacaoFatura(
      { dataFechamento: f.dataFechamento, dataVencimento: f.dataVencimento, pagaEm: f.pagaEm },
      hoje,
    ),
  }));
}

/**
 * Marca a fatura como paga. Padrão: paga hoje pelo valor total atual. Não mexe no saldo das
 * contas (saldo é informado à mão). Recusa fatura sem compras ou já paga.
 */
export function pagarFatura(
  banco: Banco,
  cartaoId: string,
  mes: Mes,
  d: { pagaEm?: Dia; valorPagoCentavos?: Centavos } = {},
  agora = new Date(),
): void {
  banco.db.transaction((tx) => {
    exigirCartaoParaFatura(tx, cartaoId, mes);
    const linha = tx
      .select()
      .from(faturas)
      .where(and(eq(faturas.cartaoId, cartaoId), eq(faturas.mesVencimento, mes)))
      .get();
    if (linha?.pagaEm) throw new ErroDeNegocio(`A fatura de ${rotuloMes(mes)} já está paga.`);
    const itens = linha ? itensDaFatura(tx, linha.id) : [];
    if (!linha || itens.length === 0) {
      throw new ErroDeNegocio(`A fatura de ${rotuloMes(mes)} não tem compras para pagar.`);
    }
    const pagaEm = d.pagaEm ?? hojeDe(agora);
    if (!ehDia(pagaEm)) throw new ErroDeNegocio('Data do pagamento inválida.', 'pagaEm');
    if (pagaEm > hojeDe(agora)) {
      throw new ErroDeNegocio('A data do pagamento não pode ser no futuro.', 'pagaEm');
    }
    const valor = d.valorPagoCentavos ?? totalDaFatura(itens);
    if (!ehCentavos(valor) || valor < 0) {
      throw new ErroDeNegocio('O valor pago não pode ser negativo.', 'valor');
    }
    tx.update(faturas)
      .set({ pagaEm, valorPagoCentavos: valor, atualizadoEm: agoraIso(agora) })
      .where(eq(faturas.id, linha.id))
      .run();
  }, IMEDIATA);
}

/** Desfaz o pagamento: a fatura volta a contar na dívida. */
export function desfazerPagamentoFatura(
  banco: Banco,
  cartaoId: string,
  mes: Mes,
  agora = new Date(),
): void {
  banco.db.transaction((tx) => {
    exigirCartaoParaFatura(tx, cartaoId, mes);
    const linha = tx
      .select()
      .from(faturas)
      .where(and(eq(faturas.cartaoId, cartaoId), eq(faturas.mesVencimento, mes)))
      .get();
    if (!linha?.pagaEm) throw new ErroDeNegocio(`A fatura de ${rotuloMes(mes)} não está paga.`);
    tx.update(faturas)
      .set({ pagaEm: null, valorPagoCentavos: null, atualizadoEm: agoraIso(agora) })
      .where(eq(faturas.id, linha.id))
      .run();
  }, IMEDIATA);
}

/**
 * Linha da fatura do mês, criada agora se não existir (datas pelo ciclo do cartão). Recusa se
 * a fatura já está paga, porque uma parcela nova mudaria um total que já foi pago.
 */
export function obterOuCriarFatura(
  tx: Tx,
  cartao: Cartao,
  mes: Mes,
  quando: string,
): typeof faturas.$inferSelect {
  const existente = tx
    .select()
    .from(faturas)
    .where(and(eq(faturas.cartaoId, cartao.id), eq(faturas.mesVencimento, mes)))
    .get();
  if (existente) {
    if (existente.pagaEm) throw new ErroDeNegocio(msgFaturaPaga(mes));
    return existente;
  }
  const ciclo = cicloDo(cartao);
  return tx
    .insert(faturas)
    .values({
      cartaoId: cartao.id,
      mesVencimento: mes,
      dataFechamento: dataFechamento(ciclo, mes),
      dataVencimento: dataVencimento(ciclo, mes),
      criadoEm: quando,
      atualizadoEm: quando,
    })
    .returning()
    .get();
}

/** Mês da primeira fatura paga em que a compra tem parcela, ou `null`. */
export function faturaPagaDaCompra(db: Leitor, compraId: string): Mes | null {
  const r = db
    .select({ mes: faturas.mesVencimento })
    .from(parcelas)
    .innerJoin(faturas, and(eq(faturas.id, parcelas.faturaId), isNotNull(faturas.pagaEm)))
    .where(eq(parcelas.compraId, compraId))
    .orderBy(asc(faturas.mesVencimento))
    .limit(1)
    .get();
  return r?.mes ?? null;
}

/** Recusa editar ou remover compra com parcela em fatura já paga. */
export function exigirSemFaturaPaga(db: Leitor, compraId: string): void {
  const mes = faturaPagaDaCompra(db, compraId);
  if (mes) throw new ErroDeNegocio(`Esta compra está numa fatura já paga. ${msgFaturaPaga(mes)}`);
}

export { msgFaturaPaga, rotuloMes };

/** Nome do cartão (mesmo na lixeira), ou `null` se não existe. */
export function nomeDoCartao(banco: Banco, id: string): string | null {
  return (
    banco.db.select({ nome: cartoes.nome }).from(cartoes).where(eq(cartoes.id, id)).get()?.nome ??
    null
  );
}

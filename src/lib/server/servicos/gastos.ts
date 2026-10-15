/**
 * Gastos (compras) e os lançamentos de cada mês.
 *
 * Gasto à vista (meio = conta) é uma compra com uma parcela no mês da data. Compra no cartão
 * (meio = cartao) é dividida em 1 a 24 parcelas; cada parcela cai no mês de competência
 * (mês da compra + i) e na fatura do cartão (dominio/fatura), criada sob demanda.
 *
 * Regra da casa: gasto não mexe no saldo da conta. A conta é só informativa.
 * Toda escrita que toca compra e parcelas roda numa transação única.
 */
import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { diaNoMes, type Dia, type Mes } from '../../dominio/datas.ts';
import type { Centavos } from '../../dominio/dinheiro.ts';
import type { Lancamento } from '../../dominio/lancamentos.ts';
import { mesDaFatura } from '../../dominio/fatura.ts';
import { gerarParcelas } from '../../dominio/parcelas.ts';
import type { Banco, BancoDrizzle } from '../db/conexao.ts';
import { cartoes, categorias, compras, contas, parcelas } from '../db/esquema.ts';
import { exigirSemFaturaPaga, obterOuCriarFatura, type Cartao } from './cartoes.ts';
import { agoraIso, ErroDeNegocio, naoEncontrado } from './erros.ts';

export type { Lancamento };

export type Compra = typeof compras.$inferSelect;

export interface DadosGasto {
  valorCentavos: Centavos;
  descricao: string | null;
  categoriaId: string;
  data: Dia;
  /** Conta do gasto à vista (ignorada no cartão). */
  contaId: string | null;
  /** Padrão 'conta'. */
  meio?: 'conta' | 'cartao';
  /** Obrigatório no cartão. */
  cartaoId?: string | null;
  /** 1 a 24 no cartão; no gasto à vista é sempre 1. */
  numParcelas?: number;
}

/** Dados já conferidos: meio, cartão e parcelas com a forma que a tabela aceita. */
interface GastoNormalizado {
  valorCentavos: Centavos;
  descricao: string | null;
  categoriaId: string;
  data: Dia;
  contaId: string | null;
  meio: 'conta' | 'cartao';
  cartaoId: string | null;
  numParcelas: number;
}

const IMEDIATA = { behavior: 'immediate' } as const;

type Tx = Parameters<Parameters<BancoDrizzle['transaction']>[0]>[0];

function normalizar(d: DadosGasto): GastoNormalizado {
  const base = {
    valorCentavos: d.valorCentavos,
    descricao: d.descricao,
    categoriaId: d.categoriaId,
    data: d.data,
  };
  if ((d.meio ?? 'conta') === 'conta') {
    return { ...base, contaId: d.contaId, meio: 'conta', cartaoId: null, numParcelas: 1 };
  }
  if (!d.cartaoId) throw new ErroDeNegocio('Escolha o cartão.', 'cartaoId');
  const n = d.numParcelas ?? 1;
  if (!Number.isInteger(n) || n < 1 || n > 24) {
    throw new ErroDeNegocio('Use de 1 a 24 parcelas.', 'numParcelas');
  }
  if (d.valorCentavos < n) {
    throw new ErroDeNegocio(`O valor é pequeno demais para dividir em ${n} parcelas.`, 'parcelas');
  }
  return { ...base, contaId: null, meio: 'cartao', cartaoId: d.cartaoId, numParcelas: n };
}

function validarReferencias(
  db: BancoDrizzle | Tx,
  d: GastoNormalizado,
  atual: { categoriaId: string; contaId: string | null; cartaoId: string | null } | null,
): void {
  const categoriaAtual = atual?.categoriaId ?? null;
  const contaAtual = atual?.contaId ?? null;
  const cat = db.select().from(categorias).where(eq(categorias.id, d.categoriaId)).get();
  if (!cat) throw new ErroDeNegocio('Escolha uma categoria.', 'categoriaId');
  // Categoria arquivada só vale se o gasto já era dela (editar sem trocar).
  if (cat.arquivada && cat.id !== categoriaAtual) {
    throw new ErroDeNegocio(`A categoria "${cat.nome}" está arquivada.`, 'categoriaId');
  }
  if (d.meio === 'conta' && d.contaId) {
    const conta = db.select().from(contas).where(eq(contas.id, d.contaId)).get();
    if (!conta) throw new ErroDeNegocio('Essa conta não existe mais.', 'contaId');
    // Conta na lixeira só vale se o gasto já era dela (editar sem trocar).
    if (conta.removidoEm && conta.id !== contaAtual) {
      throw new ErroDeNegocio('Essa conta está na lixeira.', 'contaId');
    }
  }
  if (d.meio === 'cartao' && d.cartaoId) {
    const cartao = db.select().from(cartoes).where(eq(cartoes.id, d.cartaoId)).get();
    if (!cartao) throw new ErroDeNegocio('Esse cartão não existe mais.', 'cartaoId');
    if (cartao.removidoEm) {
      throw new ErroDeNegocio('Esse cartão está na lixeira.', 'cartaoId');
    }
    // Cartão arquivado só vale se a compra já era dele (editar sem trocar).
    if (!cartao.ativo && cartao.id !== atual?.cartaoId) {
      throw new ErroDeNegocio(`O cartão "${cartao.nome}" está arquivado.`, 'cartaoId');
    }
  }
}

/** Colunas da compra a partir dos dados conferidos. */
function colunasDaCompra(d: GastoNormalizado) {
  return {
    descricao: d.descricao,
    categoriaId: d.categoriaId,
    dataCompra: d.data,
    valorTotalCentavos: d.valorCentavos,
    meio: d.meio,
    contaId: d.contaId,
    cartaoId: d.cartaoId,
    numParcelas: d.numParcelas,
  };
}

/**
 * Grava as parcelas da compra (apaga as antigas). No cartão, cada parcela liga-se à fatura do
 * seu mês de vencimento; a fatura paga recusa a parcela nova.
 */
function gravarParcelas(tx: Tx, compraId: string, d: GastoNormalizado, quando: string): void {
  tx.delete(parcelas).where(eq(parcelas.compraId, compraId)).run();
  const cartao: Cartao | null =
    d.meio === 'cartao' && d.cartaoId
      ? (tx.select().from(cartoes).where(eq(cartoes.id, d.cartaoId)).get() ?? null)
      : null;
  for (const p of gerarParcelas(d.data, d.valorCentavos, d.numParcelas)) {
    const faturaId = cartao
      ? obterOuCriarFatura(tx, cartao, mesDaFatura(cartao, d.data, p.numero - 1), quando).id
      : null;
    tx.insert(parcelas)
      .values({
        compraId,
        numero: p.numero,
        valorCentavos: p.valorCentavos,
        mesCompetencia: p.mesCompetencia,
        faturaId,
      })
      .run();
  }
}

/** Lança um gasto (à vista ou no cartão, em parcelas). */
export function lancarGasto(banco: Banco, d: DadosGasto, agora = new Date()): Compra {
  return banco.db.transaction((tx) => {
    const n = normalizar(d);
    validarReferencias(tx, n, null);
    const quando = agoraIso(agora);
    const compra = tx
      .insert(compras)
      .values({ ...colunasDaCompra(n), criadoEm: quando, atualizadoEm: quando })
      .returning()
      .get();
    gravarParcelas(tx, compra.id, n, quando);
    return compra;
  }, IMEDIATA);
}

export function obterGasto(banco: Banco, id: string): Compra | undefined {
  return banco.db.select().from(compras).where(eq(compras.id, id)).get();
}

/**
 * Edita um gasto e refaz as parcelas (apaga e recria; a data ou o cartão podem ter mudado).
 * Recusa se alguma parcela está em fatura já paga.
 */
export function editarGasto(banco: Banco, id: string, d: DadosGasto, agora = new Date()): Compra {
  return banco.db.transaction((tx) => {
    const atual = tx.select().from(compras).where(eq(compras.id, id)).get();
    if (!atual || atual.removidoEm) throw naoEncontrado('Este gasto não existe mais');
    const n = normalizar(d);
    exigirSemFaturaPaga(tx, id);
    validarReferencias(tx, n, atual);
    const quando = agoraIso(agora);
    const compra = tx
      .update(compras)
      .set({ ...colunasDaCompra(n), atualizadoEm: quando })
      .where(eq(compras.id, id))
      .returning()
      .get();
    gravarParcelas(tx, id, n, quando);
    return compra;
  }, IMEDIATA);
}

/**
 * Manda para a lixeira (as parcelas ficam guardadas e voltam ao restaurar). Recusa se alguma
 * parcela está em fatura já paga.
 */
export function removerGasto(banco: Banco, id: string, agora = new Date()): Compra {
  return banco.db.transaction((tx) => {
    const atual = tx.select().from(compras).where(eq(compras.id, id)).get();
    if (!atual || atual.removidoEm) throw naoEncontrado('Este gasto não existe mais');
    exigirSemFaturaPaga(tx, id);
    return tx
      .update(compras)
      .set({ removidoEm: agoraIso(agora) })
      .where(eq(compras.id, id))
      .returning()
      .get();
  }, IMEDIATA);
}

/**
 * Tira da lixeira. Devolve a compra (também se ela já estava fora da lixeira). Recusa se o
 * cartão está na lixeira ou se alguma parcela está em fatura já paga.
 */
export function restaurarGasto(banco: Banco, id: string): Compra {
  return banco.db.transaction((tx) => {
    const atual = tx.select().from(compras).where(eq(compras.id, id)).get();
    if (!atual) throw naoEncontrado('Este gasto não existe mais');
    if (!atual.removidoEm) return atual;
    if (atual.cartaoId) {
      const cartao = tx.select().from(cartoes).where(eq(cartoes.id, atual.cartaoId)).get();
      if (!cartao || cartao.removidoEm) {
        throw new ErroDeNegocio(
          'Este cartão está na lixeira. Restaure o cartão antes de restaurar esta compra.',
          'cartaoId',
        );
      }
    }
    exigirSemFaturaPaga(tx, id);
    return tx
      .update(compras)
      .set({ removidoEm: null })
      .where(and(eq(compras.id, id), isNotNull(compras.removidoEm)))
      .returning()
      .get()!;
  }, IMEDIATA);
}

/**
 * Lançamentos do mês (uma linha por parcela de competência), do dia mais recente para o mais
 * antigo; no mesmo dia, o lançado por último primeiro (id ULID desempata). Compras na lixeira
 * ficam de fora.
 */
export function lancamentosDoMes(banco: Banco, mes: Mes): Lancamento[] {
  const linhas = banco.db
    .select({
      compraId: parcelas.compraId,
      numero: parcelas.numero,
      valorCentavos: parcelas.valorCentavos,
      dataCompra: compras.dataCompra,
      valorTotalCentavos: compras.valorTotalCentavos,
      numParcelas: compras.numParcelas,
      descricao: compras.descricao,
      categoriaId: compras.categoriaId,
      categoriaNome: categorias.nome,
      categoriaCor: categorias.cor,
      meio: compras.meio,
      contaNome: contas.nome,
      contaRemovidaEm: contas.removidoEm,
      cartaoNome: cartoes.nome,
      criadoEm: compras.criadoEm,
    })
    .from(parcelas)
    .innerJoin(compras, and(eq(compras.id, parcelas.compraId), isNull(compras.removidoEm)))
    .innerJoin(categorias, eq(categorias.id, compras.categoriaId))
    .leftJoin(contas, eq(contas.id, compras.contaId))
    .leftJoin(cartoes, eq(cartoes.id, compras.cartaoId))
    // Cartão na lixeira tira as compras dele de todas as listas e somas.
    .where(and(eq(parcelas.mesCompetencia, mes), isNull(cartoes.removidoEm)))
    .orderBy(
      desc(compras.dataCompra),
      desc(compras.criadoEm),
      desc(compras.id),
      asc(parcelas.numero),
    )
    .all();
  return (
    linhas
      .map((l) => ({
        compraId: l.compraId,
        data: diaNoMes(mes, Number(l.dataCompra.slice(8, 10))),
        dataCompra: l.dataCompra,
        valorCentavos: l.valorCentavos,
        valorTotalCentavos: l.valorTotalCentavos,
        parcela: l.numero,
        numParcelas: l.numParcelas,
        descricao: l.descricao,
        categoriaId: l.categoriaId,
        categoriaNome: l.categoriaNome,
        categoriaCor: l.categoriaCor,
        meio: l.meio,
        contaNome: l.contaNome,
        contaRemovida: l.contaRemovidaEm !== null,
        cartaoNome: l.cartaoNome,
        criadoEm: l.criadoEm,
      }))
      // O dia no mês pode empatar dias diferentes da compra (31 → 30); a ordem do SQL desempata.
      .sort((a, b) => (a.data === b.data ? 0 : a.data < b.data ? 1 : -1))
  );
}

/** Categoria do gasto lançado por último, se ainda estiver ativa. */
export function ultimaCategoriaUsada(banco: Banco): string | null {
  const r = banco.db
    .select({ id: compras.categoriaId, arquivada: categorias.arquivada })
    .from(compras)
    .innerJoin(categorias, eq(categorias.id, compras.categoriaId))
    .where(isNull(compras.removidoEm))
    .orderBy(desc(compras.criadoEm), desc(compras.id))
    .limit(1)
    .get();
  return r && !r.arquivada ? r.id : null;
}

export interface GastoNaLixeira {
  id: string;
  descricao: string | null;
  categoriaNome: string;
  categoriaCor: string | null;
  dataCompra: Dia;
  valorTotalCentavos: Centavos;
  meio: 'conta' | 'cartao';
  numParcelas: number;
  removidoEm: string;
}

export function gastosNaLixeira(banco: Banco): GastoNaLixeira[] {
  return banco.db
    .select({
      id: compras.id,
      descricao: compras.descricao,
      categoriaNome: categorias.nome,
      categoriaCor: categorias.cor,
      dataCompra: compras.dataCompra,
      valorTotalCentavos: compras.valorTotalCentavos,
      meio: compras.meio,
      numParcelas: compras.numParcelas,
      removidoEm: compras.removidoEm,
    })
    .from(compras)
    .innerJoin(categorias, eq(categorias.id, compras.categoriaId))
    .where(isNotNull(compras.removidoEm))
    .orderBy(desc(compras.removidoEm), desc(compras.id))
    .all()
    .map((g) => ({ ...g, removidoEm: g.removidoEm ?? '' }));
}

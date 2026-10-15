/**
 * Gastos (compras) e os lançamentos de cada mês.
 *
 * Nesta onda o site lança e edita gastos à vista (meio = conta), que viram uma compra com uma
 * parcela no mês da data. Compras no cartão (vindas do importador) já aparecem no mês, uma
 * parcela por mês de competência; lançá-las e editá-las pelo site chega com a tela de cartões.
 *
 * Regra da casa: gasto não mexe no saldo da conta. A conta é só informativa.
 * Toda escrita que toca compra e parcelas roda numa transação única.
 */
import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { diaNoMes, type Dia, type Mes } from '../../dominio/datas.ts';
import type { Centavos } from '../../dominio/dinheiro.ts';
import type { Lancamento } from '../../dominio/lancamentos.ts';
import { gerarParcelas } from '../../dominio/parcelas.ts';

export type { Lancamento };
import type { Banco, BancoDrizzle } from '../db/conexao.ts';
import { cartoes, categorias, compras, contas, parcelas } from '../db/esquema.ts';
import { agoraIso, ErroDeNegocio, naoEncontrado } from './erros.ts';

export type Compra = typeof compras.$inferSelect;

export interface DadosGasto {
  valorCentavos: Centavos;
  descricao: string | null;
  categoriaId: string;
  data: Dia;
  contaId: string | null;
}

const IMEDIATA = { behavior: 'immediate' } as const;

type Tx = Parameters<Parameters<BancoDrizzle['transaction']>[0]>[0];

function validarReferencias(
  db: BancoDrizzle | Tx,
  d: DadosGasto,
  atual: { categoriaId: string; contaId: string | null } | null,
): void {
  const categoriaAtual = atual?.categoriaId ?? null;
  const contaAtual = atual?.contaId ?? null;
  const cat = db.select().from(categorias).where(eq(categorias.id, d.categoriaId)).get();
  if (!cat) throw new ErroDeNegocio('Escolha uma categoria.', 'categoriaId');
  // Categoria arquivada só vale se o gasto já era dela (editar sem trocar).
  if (cat.arquivada && cat.id !== categoriaAtual) {
    throw new ErroDeNegocio(`A categoria "${cat.nome}" está arquivada.`, 'categoriaId');
  }
  if (d.contaId) {
    const conta = db.select().from(contas).where(eq(contas.id, d.contaId)).get();
    if (!conta) throw new ErroDeNegocio('Essa conta não existe mais.', 'contaId');
    // Conta na lixeira só vale se o gasto já era dela (editar sem trocar).
    if (conta.removidoEm && conta.id !== contaAtual) {
      throw new ErroDeNegocio('Essa conta está na lixeira.', 'contaId');
    }
  }
}

function gravarParcelas(tx: Tx, compraId: string, d: DadosGasto): void {
  tx.delete(parcelas).where(eq(parcelas.compraId, compraId)).run();
  for (const p of gerarParcelas(d.data, d.valorCentavos, 1)) {
    tx.insert(parcelas)
      .values({
        compraId,
        numero: p.numero,
        valorCentavos: p.valorCentavos,
        mesCompetencia: p.mesCompetencia,
      })
      .run();
  }
}

/** Lança um gasto à vista. */
export function lancarGasto(banco: Banco, d: DadosGasto, agora = new Date()): Compra {
  return banco.db.transaction((tx) => {
    validarReferencias(tx, d, null);
    const quando = agoraIso(agora);
    const compra = tx
      .insert(compras)
      .values({
        descricao: d.descricao,
        categoriaId: d.categoriaId,
        dataCompra: d.data,
        valorTotalCentavos: d.valorCentavos,
        meio: 'conta',
        contaId: d.contaId,
        numParcelas: 1,
        criadoEm: quando,
        atualizadoEm: quando,
      })
      .returning()
      .get();
    gravarParcelas(tx, compra.id, d);
    return compra;
  }, IMEDIATA);
}

export function obterGasto(banco: Banco, id: string): Compra | undefined {
  return banco.db.select().from(compras).where(eq(compras.id, id)).get();
}

/** Edita um gasto à vista e refaz a parcela (a data pode ter mudado de mês). */
export function editarGasto(banco: Banco, id: string, d: DadosGasto, agora = new Date()): Compra {
  return banco.db.transaction((tx) => {
    const atual = tx.select().from(compras).where(eq(compras.id, id)).get();
    if (!atual || atual.removidoEm) throw naoEncontrado('Este gasto não existe mais');
    if (atual.meio !== 'conta' || atual.numParcelas !== 1) {
      throw new ErroDeNegocio(
        'Compras no cartão e parceladas serão editadas na tela de cartões, que chega em breve.',
      );
    }
    validarReferencias(tx, d, atual);
    const compra = tx
      .update(compras)
      .set({
        descricao: d.descricao,
        categoriaId: d.categoriaId,
        dataCompra: d.data,
        valorTotalCentavos: d.valorCentavos,
        contaId: d.contaId,
        numParcelas: 1,
        atualizadoEm: agoraIso(agora),
      })
      .where(eq(compras.id, id))
      .returning()
      .get();
    gravarParcelas(tx, id, d);
    return compra;
  }, IMEDIATA);
}

/** Manda para a lixeira (as parcelas ficam guardadas e voltam ao restaurar). */
export function removerGasto(banco: Banco, id: string, agora = new Date()): Compra {
  return banco.db.transaction((tx) => {
    const atual = tx.select().from(compras).where(eq(compras.id, id)).get();
    if (!atual || atual.removidoEm) throw naoEncontrado('Este gasto não existe mais');
    return tx
      .update(compras)
      .set({ removidoEm: agoraIso(agora) })
      .where(eq(compras.id, id))
      .returning()
      .get();
  }, IMEDIATA);
}

/** Tira da lixeira. Devolve a compra (também se ela já estava fora da lixeira). */
export function restaurarGasto(banco: Banco, id: string): Compra {
  return banco.db.transaction((tx) => {
    const atual = tx.select().from(compras).where(eq(compras.id, id)).get();
    if (!atual) throw naoEncontrado('Este gasto não existe mais');
    if (!atual.removidoEm) return atual;
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
    .where(eq(parcelas.mesCompetencia, mes))
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

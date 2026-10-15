/**
 * Receitas (entradas de dinheiro) e os lançamentos de cada mês.
 *
 * Regra da casa, igual aos gastos: receita só registra. Não mexe no saldo das contas (o saldo
 * segue informado à mão). A conta que recebeu é só informativa.
 * Toda escrita roda numa transação única, com o banco travado para escrita (IMMEDIATE).
 */
import { and, desc, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import {
  primeiroDiaDoMes,
  ultimoDiaDoMes,
  ehDia,
  type Dia,
  type Mes,
} from '../../dominio/datas.ts';
import { ehCentavos, somar, type Centavos } from '../../dominio/dinheiro.ts';
import { ehCategoriaReceita, type ReceitaDoMes } from '../../dominio/receitas.ts';
import type { Banco, BancoDrizzle } from '../db/conexao.ts';
import { contas, receitas } from '../db/esquema.ts';
import { agoraIso, ErroDeNegocio, naoEncontrado } from './erros.ts';

export type Receita = typeof receitas.$inferSelect;

export interface DadosReceita {
  descricao?: string | null;
  categoria: string;
  data: string;
  valorCentavos: Centavos;
  contaId?: string | null;
  observacao?: string | null;
}

const IMEDIATA = { behavior: 'immediate' } as const;

type Tx = Parameters<Parameters<BancoDrizzle['transaction']>[0]>[0];

/** Texto livre: vazio ou só espaços vira null. */
function textoOuNulo(t: string | null | undefined): string | null {
  const s = (t ?? '').trim();
  return s === '' ? null : s;
}

/** Valida os dados de uma receita. `atual` é a receita sendo editada (se houver). */
function validar(
  db: BancoDrizzle | Tx,
  d: DadosReceita,
  atual: { contaId: string | null } | null,
): void {
  if (!ehCategoriaReceita(d.categoria)) {
    throw new ErroDeNegocio('Escolha uma categoria.', 'categoria');
  }
  if (!ehDia(d.data)) throw new ErroDeNegocio('Data inválida.', 'data');
  if (!ehCentavos(d.valorCentavos) || d.valorCentavos <= 0) {
    throw new ErroDeNegocio('O valor precisa ser maior que zero.', 'valor');
  }
  if (d.contaId) {
    const conta = db.select().from(contas).where(eq(contas.id, d.contaId)).get();
    if (!conta) throw new ErroDeNegocio('Essa conta não existe mais.', 'contaId');
    // Conta na lixeira só vale se a receita já era dela (editar sem trocar).
    if (conta.removidoEm && conta.id !== (atual?.contaId ?? null)) {
      throw new ErroDeNegocio('Essa conta está na lixeira.', 'contaId');
    }
  }
}

/** Lança uma receita. Não altera o saldo de nenhuma conta. */
export function lancarReceita(banco: Banco, d: DadosReceita, agora = new Date()): Receita {
  return banco.db.transaction((tx) => {
    validar(tx, d, null);
    const quando = agoraIso(agora);
    return tx
      .insert(receitas)
      .values({
        descricao: textoOuNulo(d.descricao),
        categoria: d.categoria,
        data: d.data,
        valorCentavos: d.valorCentavos,
        contaId: d.contaId ?? null,
        observacao: textoOuNulo(d.observacao),
        criadoEm: quando,
        atualizadoEm: quando,
      })
      .returning()
      .get();
  }, IMEDIATA);
}

export function obterReceita(banco: Banco, id: string): Receita | undefined {
  return banco.db.select().from(receitas).where(eq(receitas.id, id)).get();
}

/** Edita uma receita fora da lixeira. */
export function editarReceita(
  banco: Banco,
  id: string,
  d: DadosReceita,
  agora = new Date(),
): Receita {
  return banco.db.transaction((tx) => {
    const atual = tx.select().from(receitas).where(eq(receitas.id, id)).get();
    if (!atual || atual.removidoEm) throw naoEncontrado('Esta receita não existe mais');
    validar(tx, d, atual);
    return tx
      .update(receitas)
      .set({
        descricao: textoOuNulo(d.descricao),
        categoria: d.categoria,
        data: d.data,
        valorCentavos: d.valorCentavos,
        contaId: d.contaId ?? null,
        observacao: textoOuNulo(d.observacao),
        atualizadoEm: agoraIso(agora),
      })
      .where(eq(receitas.id, id))
      .returning()
      .get();
  }, IMEDIATA);
}

/** Manda para a lixeira. */
export function removerReceita(banco: Banco, id: string, agora = new Date()): Receita {
  return banco.db.transaction((tx) => {
    const atual = tx.select().from(receitas).where(eq(receitas.id, id)).get();
    if (!atual || atual.removidoEm) throw naoEncontrado('Esta receita não existe mais');
    return tx
      .update(receitas)
      .set({ removidoEm: agoraIso(agora) })
      .where(eq(receitas.id, id))
      .returning()
      .get();
  }, IMEDIATA);
}

/** Tira da lixeira. Devolve a receita (também se ela já estava fora da lixeira). */
export function restaurarReceita(banco: Banco, id: string): Receita {
  return banco.db.transaction((tx) => {
    const atual = tx.select().from(receitas).where(eq(receitas.id, id)).get();
    if (!atual) throw naoEncontrado('Esta receita não existe mais');
    if (!atual.removidoEm) return atual;
    return tx
      .update(receitas)
      .set({ removidoEm: null })
      .where(and(eq(receitas.id, id), isNotNull(receitas.removidoEm)))
      .returning()
      .get()!;
  }, IMEDIATA);
}

/** Receitas do mês fora da lixeira, da mais recente para a mais antiga. */
export function receitasDoMes(banco: Banco, mes: Mes): ReceitaDoMes[] {
  return banco.db
    .select({
      id: receitas.id,
      data: receitas.data,
      descricao: receitas.descricao,
      categoria: receitas.categoria,
      valorCentavos: receitas.valorCentavos,
      contaNome: contas.nome,
      contaRemovidaEm: contas.removidoEm,
      recorrenteId: receitas.recorrenteId,
      criadoEm: receitas.criadoEm,
    })
    .from(receitas)
    .leftJoin(contas, eq(contas.id, receitas.contaId))
    .where(
      and(
        isNull(receitas.removidoEm),
        gte(receitas.data, primeiroDiaDoMes(mes)),
        lte(receitas.data, ultimoDiaDoMes(mes)),
      ),
    )
    .orderBy(desc(receitas.data), desc(receitas.criadoEm), desc(receitas.id))
    .all()
    .map((r) => ({
      id: r.id,
      data: r.data,
      descricao: r.descricao,
      categoria: r.categoria,
      valorCentavos: r.valorCentavos,
      contaNome: r.contaNome,
      contaRemovida: r.contaRemovidaEm !== null,
      recorrente: r.recorrenteId !== null,
    }));
}

/** Total das receitas do mês (fora da lixeira). */
export function totalReceitasDoMes(banco: Banco, mes: Mes): number {
  return somar(receitasDoMes(banco, mes).map((r) => r.valorCentavos));
}

export interface ReceitaNaLixeira {
  id: string;
  data: Dia;
  descricao: string | null;
  categoria: string;
  valorCentavos: Centavos;
  removidoEm: string;
}

/** Receitas na lixeira, da mais recentemente removida para a mais antiga. */
export function receitasNaLixeira(banco: Banco): ReceitaNaLixeira[] {
  return banco.db
    .select({
      id: receitas.id,
      data: receitas.data,
      descricao: receitas.descricao,
      categoria: receitas.categoria,
      valorCentavos: receitas.valorCentavos,
      removidoEm: receitas.removidoEm,
    })
    .from(receitas)
    .where(isNotNull(receitas.removidoEm))
    .orderBy(desc(receitas.removidoEm), desc(receitas.id))
    .all()
    .map((r) => ({ ...r, removidoEm: r.removidoEm ?? '' }));
}

/** Categoria da receita lançada por último (fora da lixeira), se houver. */
export function ultimaCategoriaReceitaUsada(banco: Banco): string | null {
  const r = banco.db
    .select({ categoria: receitas.categoria })
    .from(receitas)
    .where(isNull(receitas.removidoEm))
    .orderBy(desc(receitas.criadoEm), desc(receitas.id))
    .limit(1)
    .get();
  return r && ehCategoriaReceita(r.categoria) ? r.categoria : null;
}

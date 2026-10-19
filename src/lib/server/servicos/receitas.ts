/**
 * Receitas (entradas de dinheiro) e os lançamentos de cada mês.
 *
 * Regra da casa, igual aos gastos: receita só registra. Não mexe no saldo das contas (o saldo
 * segue informado à mão). A conta que recebeu é só informativa.
 * Toda escrita roda numa transação única, com o banco travado para escrita (IMMEDIATE).
 */
import { and, asc, desc, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import {
  primeiroDiaDoMes,
  ultimoDiaDoMes,
  ehDia,
  hoje,
  mesDe,
  nomeMes,
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
  /**
   * Só ao lançar: false cria a receita como PREVISTA (ainda não recebida, fora dos totais até
   * você confirmar). Padrão: true (já recebida).
   */
  recebida?: boolean;
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

/**
 * Lança uma receita à mão: confirmada (já recebida) ou, com `recebida: false`, prevista. Não
 * altera o saldo de nenhuma conta.
 */
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
        confirmadaEm: d.recebida === false ? null : quando,
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

/**
 * Receita gerada por uma recorrente fica no mês da previsão: o gerador conta "uma por mês" pela
 * data, então mudar a data para outro mês faria o mês vizinho nunca ser lançado. Dentro do mês
 * pode ajustar à vontade (recebeu antes ou depois do dia combinado).
 */
function exigirMesmoMesDaPrevisao(atual: Receita, novaData: Dia): void {
  if (atual.recorrenteId !== null && mesDe(novaData) !== mesDe(atual.data)) {
    throw new ErroDeNegocio(
      `Esta receita é de uma recorrente e pertence a ${nomeMes(mesDe(atual.data))}: a data precisa ficar nesse mês.`,
      'data',
    );
  }
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
    exigirMesmoMesDaPrevisao(atual, d.data);
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

/**
 * Receitas do mês fora da lixeira, da mais recente para a mais antiga. Inclui as previstas
 * (`confirmada: false`); quem soma entradas deve olhar só as confirmadas.
 */
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
      confirmadaEm: receitas.confirmadaEm,
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
      confirmada: r.confirmadaEm !== null,
    }));
}

/** Total das receitas RECEBIDAS do mês (fora da lixeira). Previstas não entram. */
export function totalReceitasDoMes(banco: Banco, mes: Mes): number {
  return somar(
    receitasDoMes(banco, mes)
      .filter((r) => r.confirmada !== false)
      .map((r) => r.valorCentavos),
  );
}

/** Previstas do mês (fora da lixeira): quantas e quanto somam. Para o aviso da home. */
export function aReceberDoMes(
  banco: Banco,
  mes: Mes,
): { quantidade: number; totalCentavos: number } {
  const previstas = receitasDoMes(banco, mes).filter((r) => r.confirmada === false);
  return {
    quantidade: previstas.length,
    totalCentavos: somar(previstas.map((r) => r.valorCentavos)),
  };
}

/** Receita a receber: prevista (de recorrente ou lançada como "ainda não recebi"). */
export interface ReceitaAReceber {
  id: string;
  data: Dia;
  descricao: string | null;
  categoria: string;
  valorCentavos: Centavos;
  contaNome: string | null;
  /** Gerada por recorrente (a data confirmada precisa ficar no mesmo mês). */
  recorrente: boolean;
  /** Data prevista já chegou (data <= hoje). */
  atrasada: boolean;
}

/**
 * Previstas fora da lixeira, de qualquer mês, com data <= `ate`, da mais antiga para a mais nova.
 * Padrão de `ate`: hoje, ou seja, só as que já venceram. Passe uma data para ver as futuras também.
 */
export function receitasAReceber(banco: Banco, ate: Dia = hoje()): ReceitaAReceber[] {
  const h = hoje();
  return banco.db
    .select({
      id: receitas.id,
      data: receitas.data,
      descricao: receitas.descricao,
      categoria: receitas.categoria,
      valorCentavos: receitas.valorCentavos,
      contaNome: contas.nome,
      recorrenteId: receitas.recorrenteId,
    })
    .from(receitas)
    .leftJoin(contas, eq(contas.id, receitas.contaId))
    .where(and(isNull(receitas.removidoEm), isNull(receitas.confirmadaEm), lte(receitas.data, ate)))
    .orderBy(asc(receitas.data), asc(receitas.criadoEm), asc(receitas.id))
    .all()
    .map(({ recorrenteId, ...r }) => ({
      ...r,
      recorrente: recorrenteId !== null,
      atrasada: r.data <= h,
    }));
}

/** Busca uma receita fora da lixeira, ou erro. */
function exigirAtiva(tx: Tx, id: string): Receita {
  const atual = tx.select().from(receitas).where(eq(receitas.id, id)).get();
  if (!atual || atual.removidoEm) throw naoEncontrado('Esta receita não existe mais');
  return atual;
}

/**
 * "Recebi": confirma uma receita prevista. `valorCentavos` e `data` são opcionais (sem eles,
 * vale o que já está); quando vêm, trocam o valor e a data reais (a data pode cair em outro mês).
 * Grava `confirmadaEm` = agora. Só confirma receita prevista e fora da lixeira.
 */
export function confirmarRecebimento(
  banco: Banco,
  id: string,
  d: { valorCentavos?: Centavos; data?: Dia } = {},
  agora = new Date(),
): Receita {
  return banco.db.transaction((tx) => {
    const atual = exigirAtiva(tx, id);
    if (atual.confirmadaEm !== null) {
      throw new ErroDeNegocio('Esta receita já foi confirmada como recebida.');
    }
    if (d.valorCentavos !== undefined && (!ehCentavos(d.valorCentavos) || d.valorCentavos <= 0)) {
      throw new ErroDeNegocio('O valor precisa ser maior que zero.', 'valor');
    }
    if (d.data !== undefined && !ehDia(d.data)) {
      throw new ErroDeNegocio('Data inválida.', 'data');
    }
    const data = d.data ?? atual.data;
    exigirMesmoMesDaPrevisao(atual, data);
    // O índice único (recorrente, data) conta a lixeira: não há outra receita desse modelo nessa data.
    if (atual.recorrenteId !== null && data !== atual.data) {
      const ocupada = tx
        .select({ id: receitas.id })
        .from(receitas)
        .where(and(eq(receitas.recorrenteId, atual.recorrenteId), eq(receitas.data, data)))
        .get();
      if (ocupada) {
        throw new ErroDeNegocio(
          'Já existe uma receita deste modelo nessa data. Escolha outra data.',
          'data',
        );
      }
    }
    const quando = agoraIso(agora);
    return tx
      .update(receitas)
      .set({
        valorCentavos: d.valorCentavos ?? atual.valorCentavos,
        data,
        confirmadaEm: quando,
        atualizadoEm: quando,
      })
      .where(eq(receitas.id, id))
      .returning()
      .get();
  }, IMEDIATA);
}

/** Desfaz a confirmação (volta a prevista), para corrigir engano ou marcar "ainda não recebi". */
export function desfazerConfirmacao(banco: Banco, id: string, agora = new Date()): Receita {
  return banco.db.transaction((tx) => {
    const atual = exigirAtiva(tx, id);
    if (atual.confirmadaEm === null) {
      throw new ErroDeNegocio('Esta receita ainda está prevista.');
    }
    return tx
      .update(receitas)
      .set({ confirmadaEm: null, atualizadoEm: agoraIso(agora) })
      .where(eq(receitas.id, id))
      .returning()
      .get();
  }, IMEDIATA);
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

/**
 * Receitas recorrentes (salário, bolsa e afins): o modelo e a geração das receitas de cada mês.
 *
 * O modelo NÃO é lançamento. O site gera, uma por mês, receitas comuns (tabela `receitas`, com
 * `recorrente_id`) até hoje, de forma idempotente. Depois de gerada, a receita é uma receita
 * comum: pode ser editada, mandada para a lixeira e entra nos relatórios.
 *
 * Regras:
 * - Uma receita por mês e por modelo. Se o mês já tem uma receita desse modelo (inclusive na
 *   lixeira), não gera outra; o índice único (recorrente_id, data) é a segunda trava.
 * - Editar o modelo ou pausá-lo vale só para as próximas; o que já foi gerado não muda.
 * - Remover o modelo manda para a lixeira; as receitas geradas continuam. Restaurar segue a mesma
 *   regra do retomar (não lança os meses em que ficou na lixeira).
 * - Retomar um modelo pausado move `inicio` para hoje (se ele já era anterior), para não gerar
 *   os meses em que ele ficou pausado.
 * - Receita gerada não altera o saldo das contas.
 * Toda escrita roda numa transação única, com o banco travado para escrita (IMMEDIATE).
 */
import { and, asc, count, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { ehDia, formatarDia, hoje, mesDe, type Dia } from '../../dominio/datas.ts';
import { ehCentavos, type Centavos } from '../../dominio/dinheiro.ts';
import { ehCategoriaReceita } from '../../dominio/receitas.ts';
import {
  datasDaRecorrencia,
  proximaOcorrencia,
  validarModelo,
  type ModeloRecorrencia,
} from '../../dominio/recorrencias.ts';
import type { Banco, BancoDrizzle } from '../db/conexao.ts';
import { contas, receitas, receitasRecorrentes } from '../db/esquema.ts';
import { agoraIso, ErroDeNegocio, naoEncontrado } from './erros.ts';

export type Recorrente = typeof receitasRecorrentes.$inferSelect;

export interface DadosRecorrente {
  descricao?: string | null;
  categoria: string;
  valorCentavos: Centavos;
  diaDoMes: number;
  inicio: Dia;
  fim?: Dia | null;
  contaId?: string | null;
  observacao?: string | null;
}

export interface RecorrenteComResumo extends Recorrente {
  /** Próxima data depois de hoje (respeitando o fim); null se já acabou. */
  proxima: Dia | null;
  /** Quantas receitas (fora da lixeira) o modelo já gerou. */
  geradas: number;
}

const IMEDIATA = { behavior: 'immediate' } as const;

type Tx = Parameters<Parameters<BancoDrizzle['transaction']>[0]>[0];

/** Texto livre: vazio ou só espaços vira null. */
function textoOuNulo(t: string | null | undefined): string | null {
  const s = (t ?? '').trim();
  return s === '' ? null : s;
}

/** Campo do formulário que causou o erro de modelo (dia, início ou fim). */
function campoDoModelo(m: ModeloRecorrencia): string {
  if (!Number.isInteger(m.diaDoMes) || m.diaDoMes < 1 || m.diaDoMes > 31) return 'diaDoMes';
  if (!ehDia(m.inicio)) return 'inicio';
  return 'fim';
}

/** Valida os dados do modelo. `atual` é o modelo sendo editado (se houver). */
function validar(
  db: BancoDrizzle | Tx,
  d: DadosRecorrente,
  atual: { contaId: string | null } | null,
): void {
  if (!ehCategoriaReceita(d.categoria)) {
    throw new ErroDeNegocio('Escolha uma categoria.', 'categoria');
  }
  if (!ehCentavos(d.valorCentavos) || d.valorCentavos <= 0) {
    throw new ErroDeNegocio('O valor precisa ser maior que zero.', 'valor');
  }
  const modelo: ModeloRecorrencia = {
    diaDoMes: d.diaDoMes,
    inicio: d.inicio,
    fim: d.fim ?? null,
  };
  const erro = validarModelo(modelo);
  if (erro) throw new ErroDeNegocio(erro, campoDoModelo(modelo));
  if (d.contaId) {
    const conta = db.select().from(contas).where(eq(contas.id, d.contaId)).get();
    if (!conta) throw new ErroDeNegocio('Essa conta não existe mais.', 'contaId');
    // Conta na lixeira só vale se o modelo já era dela (editar sem trocar).
    if (conta.removidoEm && conta.id !== (atual?.contaId ?? null)) {
      throw new ErroDeNegocio('Essa conta está na lixeira.', 'contaId');
    }
  }
}

/** Modelo fora da lixeira, ou erro. */
function exigirAtivo(tx: Tx, id: string): Recorrente {
  const atual = tx.select().from(receitasRecorrentes).where(eq(receitasRecorrentes.id, id)).get();
  if (!atual || atual.removidoEm) throw naoEncontrado('Esta receita recorrente não existe mais');
  return atual;
}

/** Cria o modelo e já gera as receitas dos meses que cabem até hoje. */
export function criarRecorrente(banco: Banco, d: DadosRecorrente, agora = new Date()): Recorrente {
  const criado = banco.db.transaction((tx) => {
    validar(tx, d, null);
    const quando = agoraIso(agora);
    return tx
      .insert(receitasRecorrentes)
      .values({
        descricao: textoOuNulo(d.descricao),
        categoria: d.categoria,
        valorCentavos: d.valorCentavos,
        diaDoMes: d.diaDoMes,
        inicio: d.inicio,
        fim: d.fim ?? null,
        contaId: d.contaId ?? null,
        observacao: textoOuNulo(d.observacao),
        criadoEm: quando,
        atualizadoEm: quando,
      })
      .returning()
      .get();
  }, IMEDIATA);
  gerarReceitasRecorrentes(banco, hoje(agora), agora);
  return criado;
}

export function obterRecorrente(banco: Banco, id: string): Recorrente | undefined {
  return banco.db.select().from(receitasRecorrentes).where(eq(receitasRecorrentes.id, id)).get();
}

/**
 * Edita o modelo (fora da lixeira). Não altera as receitas já geradas: o novo valor, dia ou
 * conta valem só para os meses que ainda não têm receita.
 */
export function editarRecorrente(
  banco: Banco,
  id: string,
  d: DadosRecorrente,
  agora = new Date(),
): Recorrente {
  const editado = banco.db.transaction((tx) => {
    const atual = exigirAtivo(tx, id);
    validar(tx, d, atual);
    return tx
      .update(receitasRecorrentes)
      .set({
        descricao: textoOuNulo(d.descricao),
        categoria: d.categoria,
        valorCentavos: d.valorCentavos,
        diaDoMes: d.diaDoMes,
        inicio: d.inicio,
        fim: d.fim ?? null,
        contaId: d.contaId ?? null,
        observacao: textoOuNulo(d.observacao),
        atualizadoEm: agoraIso(agora),
      })
      .where(eq(receitasRecorrentes.id, id))
      .returning()
      .get();
  }, IMEDIATA);
  gerarReceitasRecorrentes(banco, hoje(agora), agora);
  return editado;
}

/** Pausa: o modelo deixa de gerar receitas novas. */
export function pausarRecorrente(banco: Banco, id: string, agora = new Date()): Recorrente {
  return banco.db.transaction((tx) => {
    exigirAtivo(tx, id);
    return tx
      .update(receitasRecorrentes)
      .set({ ativa: false, atualizadoEm: agoraIso(agora) })
      .where(eq(receitasRecorrentes.id, id))
      .returning()
      .get();
  }, IMEDIATA);
}

/**
 * Retoma o modelo. Para não gerar os meses em que ficou pausado, `inicio` passa a ser
 * max(inicio, hoje). Um modelo cujo fim já passou não pode ser retomado sem editar o fim.
 */
export function retomarRecorrente(banco: Banco, id: string, agora = new Date()): Recorrente {
  const h = hoje(agora);
  const retomado = banco.db.transaction((tx) => {
    const atual = exigirAtivo(tx, id);
    if (atual.fim !== null && atual.fim < h) {
      throw new ErroDeNegocio(
        `Esta receita recorrente terminou em ${formatarDia(atual.fim)}. Edite a data final para retomar.`,
        'fim',
      );
    }
    return tx
      .update(receitasRecorrentes)
      .set({
        ativa: true,
        inicio: atual.inicio > h ? atual.inicio : h,
        atualizadoEm: agoraIso(agora),
      })
      .where(eq(receitasRecorrentes.id, id))
      .returning()
      .get();
  }, IMEDIATA);
  gerarReceitasRecorrentes(banco, h, agora);
  return retomado;
}

/** Manda o modelo para a lixeira. As receitas já geradas continuam como estão. */
export function removerRecorrente(banco: Banco, id: string, agora = new Date()): Recorrente {
  return banco.db.transaction((tx) => {
    exigirAtivo(tx, id);
    return tx
      .update(receitasRecorrentes)
      .set({ removidoEm: agoraIso(agora) })
      .where(eq(receitasRecorrentes.id, id))
      .returning()
      .get();
  }, IMEDIATA);
}

/**
 * Tira o modelo da lixeira. Devolve o modelo (também se ele já estava fora da lixeira).
 * Como no "retomar", `inicio` passa a ser max(inicio, hoje) para não lançar de uma vez os meses
 * em que o modelo ficou na lixeira. Se o fim já passou, não há para onde mover o início: o modelo
 * volta pausado (edite a data final e retome), também sem lançar nada retroativo.
 */
export function restaurarRecorrente(banco: Banco, id: string, agora = new Date()): Recorrente {
  const h = hoje(agora);
  return banco.db.transaction((tx) => {
    const atual = tx.select().from(receitasRecorrentes).where(eq(receitasRecorrentes.id, id)).get();
    if (!atual) throw naoEncontrado('Esta receita recorrente não existe mais');
    if (!atual.removidoEm) return atual;
    const podeMover = atual.inicio < h && (atual.fim === null || atual.fim >= h);
    return tx
      .update(receitasRecorrentes)
      .set({
        removidoEm: null,
        ...(podeMover ? { inicio: h } : atual.inicio < h ? { ativa: false } : {}),
        atualizadoEm: agoraIso(agora),
      })
      .where(and(eq(receitasRecorrentes.id, id), isNotNull(receitasRecorrentes.removidoEm)))
      .returning()
      .get()!;
  }, IMEDIATA);
}

/** Modelos fora da lixeira: ativos primeiro, depois os pausados. */
export function listarRecorrentes(banco: Banco, agora = new Date()): RecorrenteComResumo[] {
  const h = hoje(agora);
  const linhas = banco.db
    .select()
    .from(receitasRecorrentes)
    .where(isNull(receitasRecorrentes.removidoEm))
    .orderBy(
      desc(receitasRecorrentes.ativa),
      asc(receitasRecorrentes.criadoEm),
      asc(receitasRecorrentes.id),
    )
    .all();
  const geradas = new Map<string | null, number>(
    banco.db
      .select({ recorrenteId: receitas.recorrenteId, total: count() })
      .from(receitas)
      .where(and(isNotNull(receitas.recorrenteId), isNull(receitas.removidoEm)))
      .groupBy(receitas.recorrenteId)
      .all()
      .map((g) => [g.recorrenteId, g.total]),
  );
  return linhas.map((r) => ({
    ...r,
    proxima: proximaOcorrencia({ diaDoMes: r.diaDoMes, inicio: r.inicio, fim: r.fim }, h),
    geradas: geradas.get(r.id) ?? 0,
  }));
}

/** Modelos na lixeira, do mais recentemente removido para o mais antigo. */
export function recorrentesNaLixeira(banco: Banco): Recorrente[] {
  return banco.db
    .select()
    .from(receitasRecorrentes)
    .where(isNotNull(receitasRecorrentes.removidoEm))
    .orderBy(desc(receitasRecorrentes.removidoEm), desc(receitasRecorrentes.id))
    .all();
}

/**
 * Gera as receitas que faltam, até `hojeRef` (inclusive). Idempotente e barato: um mês que já
 * tem receita desse modelo (inclusive na lixeira) não ganha outra. Um modelo com dado ruim é
 * ignorado e não impede os demais. Devolve quantas receitas criou.
 */
export function gerarReceitasRecorrentes(
  banco: Banco,
  hojeRef: Dia = hoje(),
  agora = new Date(),
): number {
  const modelos = banco.db
    .select()
    .from(receitasRecorrentes)
    .where(and(eq(receitasRecorrentes.ativa, true), isNull(receitasRecorrentes.removidoEm)))
    .all();
  if (modelos.length === 0) return 0;
  // Quase sempre não falta nada: confere só com leitura e evita travar o banco para escrita.
  const semPendencia = (m: Recorrente) => {
    try {
      return pendentesDoModelo(banco.db, m, hojeRef).length === 0;
    } catch {
      return true; // modelo com dado ruim (ex.: passa da trava de ocorrências): não gera
    }
  };
  if (modelos.every(semPendencia)) return 0;
  const quando = agoraIso(agora);
  return banco.db.transaction((tx) => {
    let criadas = 0;
    for (const m of modelos) {
      try {
        criadas += gerarDoModelo(tx, m, hojeRef, quando);
      } catch {
        // Dado ruim neste modelo: ignora e segue para os outros.
      }
    }
    return criadas;
  }, IMEDIATA);
}

type Leitor = Pick<BancoDrizzle, 'select'>;

/** Datas do modelo até `hojeRef` cujo mês ainda não tem receita dele (nem na lixeira). */
function pendentesDoModelo(db: Leitor, m: Recorrente, hojeRef: Dia): Dia[] {
  if (!ehCategoriaReceita(m.categoria)) return [];
  const modelo: ModeloRecorrencia = { diaDoMes: m.diaDoMes, inicio: m.inicio, fim: m.fim };
  if (validarModelo(modelo) !== null) return [];
  const meses = new Set(
    db
      .select({ data: receitas.data })
      .from(receitas)
      .where(eq(receitas.recorrenteId, m.id))
      .all()
      .map((r) => mesDe(r.data)),
  );
  return datasDaRecorrencia(modelo, hojeRef).filter((d) => !meses.has(mesDe(d)));
}

function gerarDoModelo(tx: Tx, m: Recorrente, hojeRef: Dia, quando: string): number {
  const pendentes = pendentesDoModelo(tx, m, hojeRef);
  if (pendentes.length === 0) return 0;

  // Conta removida não pode receber receita nova: grava sem conta.
  let contaId = m.contaId;
  if (contaId) {
    const conta = tx.select().from(contas).where(eq(contas.id, contaId)).get();
    if (!conta || conta.removidoEm) contaId = null;
  }

  let criadas = 0;
  for (const data of pendentes) {
    criadas += tx
      .insert(receitas)
      .values({
        descricao: m.descricao,
        categoria: m.categoria,
        data,
        valorCentavos: m.valorCentavos,
        contaId,
        observacao: m.observacao,
        recorrenteId: m.id,
        criadoEm: quando,
        atualizadoEm: quando,
      })
      .onConflictDoNothing()
      .returning({ id: receitas.id })
      .all().length;
  }
  return criadas;
}

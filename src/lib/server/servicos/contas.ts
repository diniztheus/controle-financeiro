/**
 * Contas: cadastro manual com saldo informado por você.
 *
 * Regra da casa: lançar gasto NÃO altera saldo. O saldo só muda quando você o atualiza, e cada
 * atualização guarda uma linha em `saldos_historico` (é dela que sai a evolução do patrimônio).
 * Remover manda a conta para a lixeira (`removido_em`); restaurar traz de volta.
 */
import { and, asc, desc, eq, isNotNull, isNull, max } from 'drizzle-orm';
import type { TipoConta } from '../../dominio/contas.ts';
import { somar, type Centavos } from '../../dominio/dinheiro.ts';
import type { Banco } from '../db/conexao.ts';
import { contas, saldosHistorico } from '../db/esquema.ts';
import { agoraIso, ErroDeNegocio, naoEncontrado } from './erros.ts';

export type Conta = typeof contas.$inferSelect;
export type RegistroSaldo = typeof saldosHistorico.$inferSelect;

export interface DadosConta {
  nome: string;
  tipo: TipoConta;
  saldoCentavos: Centavos;
}

/** Contas ativas (fora da lixeira), na ordem escolhida. */
export function listarContas(banco: Banco): Conta[] {
  return banco.db
    .select()
    .from(contas)
    .where(isNull(contas.removidoEm))
    .orderBy(asc(contas.ordem), asc(contas.criadoEm), asc(contas.id))
    .all();
}

export function contasNaLixeira(banco: Banco): Conta[] {
  return banco.db
    .select()
    .from(contas)
    .where(isNotNull(contas.removidoEm))
    .orderBy(desc(contas.removidoEm))
    .all();
}

export function obterConta(banco: Banco, id: string): Conta | undefined {
  return banco.db.select().from(contas).where(eq(contas.id, id)).get();
}

function exigirContaAtiva(banco: Banco, id: string): Conta {
  const c = obterConta(banco, id);
  if (!c || c.removidoEm) throw naoEncontrado('Conta');
  return c;
}

function nomeEmUso(banco: Banco, nome: string, excetoId?: string): boolean {
  const chave = nome.trim().toLocaleLowerCase('pt-BR');
  return listarContas(banco).some(
    (c) => c.id !== excetoId && c.nome.trim().toLocaleLowerCase('pt-BR') === chave,
  );
}

/** Cria a conta já com o primeiro registro de saldo no histórico. */
export function criarConta(banco: Banco, d: DadosConta, agora = new Date()): Conta {
  if (nomeEmUso(banco, d.nome)) {
    throw new ErroDeNegocio('Já existe uma conta com esse nome.', 'nome');
  }
  return banco.db.transaction((tx) => {
    const ultima = tx
      .select({ m: max(contas.ordem) })
      .from(contas)
      .get();
    const quando = agoraIso(agora);
    const conta = tx
      .insert(contas)
      .values({
        nome: d.nome,
        tipo: d.tipo,
        saldoCentavos: d.saldoCentavos,
        ordem: (ultima?.m ?? -1) + 1,
        criadoEm: quando,
        atualizadoEm: quando,
      })
      .returning()
      .get();
    tx.insert(saldosHistorico)
      .values({ contaId: conta.id, saldoCentavos: d.saldoCentavos, registradoEm: quando })
      .run();
    return conta;
  });
}

/**
 * Edita nome, tipo e saldo. Só grava no histórico se o saldo mudou de fato.
 */
export function editarConta(banco: Banco, id: string, d: DadosConta, agora = new Date()): Conta {
  const atual = exigirContaAtiva(banco, id);
  if (nomeEmUso(banco, d.nome, id)) {
    throw new ErroDeNegocio('Já existe uma conta com esse nome.', 'nome');
  }
  return banco.db.transaction((tx) => {
    const quando = agoraIso(agora);
    const conta = tx
      .update(contas)
      .set({ nome: d.nome, tipo: d.tipo, saldoCentavos: d.saldoCentavos, atualizadoEm: quando })
      .where(eq(contas.id, id))
      .returning()
      .get();
    if (d.saldoCentavos !== atual.saldoCentavos) {
      tx.insert(saldosHistorico)
        .values({ contaId: id, saldoCentavos: d.saldoCentavos, registradoEm: quando })
        .run();
    }
    return conta;
  });
}

/** Atualiza só o saldo (o caso mais comum). */
export function atualizarSaldo(
  banco: Banco,
  id: string,
  saldoCentavos: Centavos,
  agora = new Date(),
): Conta {
  const c = exigirContaAtiva(banco, id);
  return editarConta(banco, id, { nome: c.nome, tipo: c.tipo, saldoCentavos }, agora);
}

/** Histórico de saldos, do mais recente para o mais antigo. */
export function historicoDeSaldos(banco: Banco, contaId: string, limite = 24): RegistroSaldo[] {
  return banco.db
    .select()
    .from(saldosHistorico)
    .where(eq(saldosHistorico.contaId, contaId))
    .orderBy(desc(saldosHistorico.registradoEm), desc(saldosHistorico.id))
    .limit(limite)
    .all();
}

/** Manda para a lixeira. Gastos ligados a ela continuam existindo e mostram a conta. */
export function removerConta(banco: Banco, id: string, agora = new Date()): void {
  exigirContaAtiva(banco, id);
  banco.db
    .update(contas)
    .set({ removidoEm: agoraIso(agora) })
    .where(eq(contas.id, id))
    .run();
}

export function restaurarConta(banco: Banco, id: string): Conta {
  const c = obterConta(banco, id);
  if (!c) throw naoEncontrado('Conta');
  if (!c.removidoEm) return c;
  if (nomeEmUso(banco, c.nome, id)) {
    throw new ErroDeNegocio(
      `Já existe outra conta chamada "${c.nome}". Renomeie-a antes de restaurar esta.`,
    );
  }
  return banco.db
    .update(contas)
    .set({ removidoEm: null })
    .where(and(eq(contas.id, id), isNotNull(contas.removidoEm)))
    .returning()
    .get()!;
}

/** Sobe (-1) ou desce (+1) uma posição na lista. */
export function moverConta(banco: Banco, id: string, direcao: -1 | 1): void {
  const lista = listarContas(banco);
  const i = lista.findIndex((c) => c.id === id);
  if (i < 0) throw naoEncontrado('Conta');
  const j = i + direcao;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j]!, lista[i]!];
  banco.db.transaction((tx) => {
    lista.forEach((c, ordem) => {
      if (c.ordem !== ordem) tx.update(contas).set({ ordem }).where(eq(contas.id, c.id)).run();
    });
  });
}

/** Soma dos saldos das contas ativas e data da atualização mais recente. */
export function totalDasContas(banco: Banco): {
  totalCentavos: Centavos;
  quantidade: number;
  atualizadoEm: string | null;
} {
  const lista = listarContas(banco);
  let ultima: string | null = null;
  for (const c of lista) if (!ultima || c.atualizadoEm > ultima) ultima = c.atualizadoEm;
  return {
    totalCentavos: somar(lista.map((c) => c.saldoCentavos)),
    quantidade: lista.length,
    atualizadoEm: ultima,
  };
}

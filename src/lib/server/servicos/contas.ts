/**
 * Contas: cadastro manual com saldo informado por você.
 *
 * Regra da casa: lançar gasto NÃO altera saldo. O saldo só muda quando você o atualiza, e cada
 * atualização guarda uma linha em `saldos_historico` (é dela que sai a evolução do patrimônio e
 * a data "saldos atualizados em"). Confirmar o mesmo saldo também conta como atualização.
 * Remover manda a conta para a lixeira (`removido_em`); restaurar traz de volta.
 *
 * A coluna `contas.ativa` não é usada nesta onda (fica para "esconder sem remover", se fizer
 * falta). Escritas conferem e gravam na mesma transação IMMEDIATE, para que um segundo processo
 * (ex.: o importador com o site aberto) não passe pela mesma conferência ao mesmo tempo.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, max } from 'drizzle-orm';
import type { TipoConta } from '../../dominio/contas.ts';
import { somar, type Centavos } from '../../dominio/dinheiro.ts';
import { chaveNome, normalizarNome } from '../../dominio/nomes.ts';
import type { Banco, BancoDrizzle } from '../db/conexao.ts';
import { contas, saldosHistorico } from '../db/esquema.ts';
import { agoraIso, ErroDeNegocio, naoEncontrado } from './erros.ts';

export type Conta = typeof contas.$inferSelect;
export type RegistroSaldo = typeof saldosHistorico.$inferSelect;

type Leitor = Pick<BancoDrizzle, 'select'>;

export interface DadosConta {
  nome: string;
  tipo: TipoConta;
  saldoCentavos: Centavos;
}

const IMEDIATA = { behavior: 'immediate' } as const;

function ativas(db: Leitor): Conta[] {
  return db
    .select()
    .from(contas)
    .where(isNull(contas.removidoEm))
    .orderBy(asc(contas.ordem), asc(contas.criadoEm), asc(contas.id))
    .all();
}

/** Contas ativas (fora da lixeira), na ordem escolhida. */
export function listarContas(banco: Banco): Conta[] {
  return ativas(banco.db);
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

function exigirAtiva(db: Leitor, id: string): Conta {
  const c = db.select().from(contas).where(eq(contas.id, id)).get();
  if (!c || c.removidoEm) throw naoEncontrado('Esta conta não existe mais');
  return c;
}

function exigirNomeLivre(db: Leitor, nome: string, excetoId?: string): void {
  const chave = chaveNome(nome);
  const igual = ativas(db).find((c) => c.id !== excetoId && chaveNome(c.nome) === chave);
  if (igual) throw new ErroDeNegocio(`Já existe a conta "${igual.nome}".`, 'nome');
}

function proximaOrdem(db: Leitor): number {
  const r = db
    .select({ m: max(contas.ordem) })
    .from(contas)
    .get();
  return (r?.m ?? -1) + 1;
}

/** Cria a conta já com o primeiro registro de saldo no histórico. */
export function criarConta(banco: Banco, d: DadosConta, agora = new Date()): Conta {
  const nome = normalizarNome(d.nome);
  return banco.db.transaction((tx) => {
    exigirNomeLivre(tx, nome);
    const quando = agoraIso(agora);
    const conta = tx
      .insert(contas)
      .values({
        nome,
        tipo: d.tipo,
        saldoCentavos: d.saldoCentavos,
        ordem: proximaOrdem(tx),
        criadoEm: quando,
        atualizadoEm: quando,
      })
      .returning()
      .get();
    tx.insert(saldosHistorico)
      .values({ contaId: conta.id, saldoCentavos: d.saldoCentavos, registradoEm: quando })
      .run();
    return conta;
  }, IMEDIATA);
}

/**
 * Edita nome, tipo e saldo. Grava no histórico se o saldo mudou (ou se `registrarSaldo`,
 * quando a pessoa confirma o saldo de hoje mesmo sem mudança).
 */
export function editarConta(
  banco: Banco,
  id: string,
  d: DadosConta,
  agora = new Date(),
  registrarSaldo = false,
): Conta {
  const nome = normalizarNome(d.nome);
  return banco.db.transaction((tx) => {
    const atual = exigirAtiva(tx, id);
    exigirNomeLivre(tx, nome, id);
    const quando = agoraIso(agora);
    const conta = tx
      .update(contas)
      .set({ nome, tipo: d.tipo, saldoCentavos: d.saldoCentavos, atualizadoEm: quando })
      .where(eq(contas.id, id))
      .returning()
      .get();
    if (registrarSaldo || d.saldoCentavos !== atual.saldoCentavos) {
      tx.insert(saldosHistorico)
        .values({ contaId: id, saldoCentavos: d.saldoCentavos, registradoEm: quando })
        .run();
    }
    return conta;
  }, IMEDIATA);
}

/** Atualiza só o saldo (o caso mais comum). Sempre grava no histórico. */
export function atualizarSaldo(
  banco: Banco,
  id: string,
  saldoCentavos: Centavos,
  agora = new Date(),
): Conta {
  const c = exigirAtiva(banco.db, id);
  return editarConta(banco, id, { nome: c.nome, tipo: c.tipo, saldoCentavos }, agora, true);
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
  banco.db.transaction((tx) => {
    exigirAtiva(tx, id);
    tx.update(contas)
      .set({ removidoEm: agoraIso(agora) })
      .where(eq(contas.id, id))
      .run();
  }, IMEDIATA);
}

/** Tira da lixeira e coloca no fim da lista. */
export function restaurarConta(banco: Banco, id: string): Conta {
  return banco.db.transaction((tx) => {
    const c = tx.select().from(contas).where(eq(contas.id, id)).get();
    if (!c) throw naoEncontrado('Esta conta não existe mais');
    if (!c.removidoEm) return c;
    const igual = ativas(tx).find((o) => chaveNome(o.nome) === chaveNome(c.nome));
    if (igual) {
      throw new ErroDeNegocio(
        `Já existe outra conta chamada "${igual.nome}". Renomeie-a antes de restaurar esta.`,
      );
    }
    return tx
      .update(contas)
      .set({ removidoEm: null, ordem: proximaOrdem(tx) })
      .where(and(eq(contas.id, id), isNotNull(contas.removidoEm)))
      .returning()
      .get()!;
  }, IMEDIATA);
}

/** Sobe (-1) ou desce (+1) uma posição na lista. */
export function moverConta(banco: Banco, id: string, direcao: -1 | 1): void {
  banco.db.transaction((tx) => {
    const lista = ativas(tx);
    const i = lista.findIndex((c) => c.id === id);
    if (i < 0) throw naoEncontrado('Esta conta não existe mais');
    const j = i + direcao;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j]!, lista[i]!];
    lista.forEach((c, ordem) => {
      if (c.ordem !== ordem) tx.update(contas).set({ ordem }).where(eq(contas.id, c.id)).run();
    });
  }, IMEDIATA);
}

/**
 * Soma dos saldos das contas ativas e quando um saldo foi informado pela última vez
 * (do histórico: renomear uma conta não conta como atualizar saldo).
 */
export function totalDasContas(
  banco: Banco,
  lista: Conta[] = listarContas(banco),
): {
  totalCentavos: Centavos;
  quantidade: number;
  saldoAtualizadoEm: string | null;
} {
  const ultima = lista.length
    ? banco.db
        .select({ m: max(saldosHistorico.registradoEm) })
        .from(saldosHistorico)
        .where(
          inArray(
            saldosHistorico.contaId,
            lista.map((c) => c.id),
          ),
        )
        .get()
    : undefined;
  return {
    totalCentavos: somar(lista.map((c) => c.saldoCentavos)),
    quantidade: lista.length,
    saldoAtualizadoEm: ultima?.m ?? null,
  };
}

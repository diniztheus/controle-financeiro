/**
 * Verificação de integridade do banco em uso: `PRAGMA integrity_check` completo e
 * `foreign_key_check`. O resultado da última verificação fica em memória, para o aviso das telas.
 */
import type { Banco } from '../db/conexao.ts';

export interface ResultadoIntegridade {
  ok: boolean;
  mensagens: string[];
  verificadoEm: string;
}

const LIMITE_MENSAGENS = 20;

let ultima: ResultadoIntegridade | null = null;

export function verificarIntegridade(banco: Banco): ResultadoIntegridade {
  const mensagens: string[] = [];
  const integro = banco.sqlite.pragma('integrity_check') as { integrity_check: string }[];
  if (!(integro.length === 1 && integro[0]!.integrity_check === 'ok')) {
    for (const linha of integro) mensagens.push(linha.integrity_check);
  }
  const quebradas = banco.sqlite.pragma('foreign_key_check') as {
    table: string;
    rowid: number | null;
  }[];
  for (const q of quebradas) {
    mensagens.push(
      `Referência quebrada em ${q.table}${q.rowid === null ? '' : ` (linha ${q.rowid})`}.`,
    );
  }
  const resultado: ResultadoIntegridade = {
    ok: mensagens.length === 0,
    mensagens: mensagens.slice(0, LIMITE_MENSAGENS),
    verificadoEm: new Date().toISOString(),
  };
  ultima = resultado;
  return resultado;
}

/** Resultado da última verificação feita neste processo, ou `null` se ainda não houve. */
export function ultimaVerificacao(): ResultadoIntegridade | null {
  return ultima;
}

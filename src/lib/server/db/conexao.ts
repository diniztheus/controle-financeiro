/**
 * Abre o arquivo SQLite com as configurações da casa:
 * - `journal_mode = WAL`: leituras não bloqueiam escritas e o arquivo resiste melhor a quedas;
 * - `foreign_keys = ON`: o SQLite só respeita chaves estrangeiras com isto ligado;
 * - `busy_timeout`: espera um pouco em vez de falhar se outro processo (ex.: o backup) estiver usando.
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as esquema from './esquema.ts';

export const BUSY_TIMEOUT_MS = 5000;

export type Esquema = typeof esquema;
export type BancoDrizzle = BetterSQLite3Database<Esquema>;

export interface Banco {
  /** Conexão crua do better-sqlite3 (pragmas, backup, consultas de sistema). */
  sqlite: Database.Database;
  /** Drizzle tipado com o esquema. */
  db: BancoDrizzle;
  /** Caminho do arquivo, ou ":memory:". */
  arquivo: string;
}

export function abrirBanco(arquivo: string): Banco {
  const sqlite = new Database(arquivo);
  aplicarPragmas(sqlite);
  const db = drizzle(sqlite, { schema: esquema });
  return { sqlite, db, arquivo };
}

export function aplicarPragmas(sqlite: Database.Database): void {
  // Em memória o SQLite responde "memory"; WAL só existe para arquivos.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  sqlite.pragma('synchronous = NORMAL');
}

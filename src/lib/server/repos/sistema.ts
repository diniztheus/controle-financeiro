/**
 * Consultas sobre o próprio banco (tabelas, contagens, pragmas). Só leitura.
 */
import { existsSync, statSync } from 'node:fs';
import { TABELAS } from '../db/esquema.ts';
import type { Banco } from '../db/conexao.ts';

export interface InfoTabela {
  nome: string;
  linhas: number;
}

/** Tabelas do usuário existentes no arquivo (sem as internas do SQLite e do Drizzle). */
export function tabelasDoBanco(banco: Banco): string[] {
  const rows = banco.sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

/** Linhas por tabela do esquema, na ordem do plano. Tabelas ausentes aparecem com -1. */
export function contarLinhas(banco: Banco): InfoTabela[] {
  const existentes = new Set(tabelasDoBanco(banco));
  return TABELAS.map((nome) => {
    if (!existentes.has(nome)) return { nome, linhas: -1 };
    const r = banco.sqlite.prepare(`SELECT count(*) AS n FROM "${nome}"`).get() as { n: number };
    return { nome, linhas: r.n };
  });
}

export interface Pragmas {
  journalMode: string;
  foreignKeys: boolean;
  busyTimeoutMs: number;
  sqliteVersao: string;
  integridadeRapida: string;
}

export function lerPragmas(banco: Banco): Pragmas {
  const s = banco.sqlite;
  return {
    journalMode: String(s.pragma('journal_mode', { simple: true })),
    foreignKeys: Number(s.pragma('foreign_keys', { simple: true })) === 1,
    busyTimeoutMs: Number(s.pragma('busy_timeout', { simple: true })),
    sqliteVersao: (s.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v,
    integridadeRapida: String(s.pragma('quick_check', { simple: true })),
  };
}

/** Tamanho do arquivo principal mais o diário WAL, em bytes. */
export function tamanhoArquivo(arquivo: string): number {
  let total = 0;
  for (const f of [arquivo, `${arquivo}-wal`]) if (existsSync(f)) total += statSync(f).size;
  return total;
}

export function ping(banco: Banco): boolean {
  const r = banco.sqlite.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
  return r?.ok === 1;
}

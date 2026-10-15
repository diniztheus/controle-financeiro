/**
 * Aplica as migrations pendentes da pasta `drizzle/`.
 *
 * Se o banco já existia e há migration nova, faz um backup ANTES de mexer no esquema.
 * As migrations rodam numa transação: ou entram todas, ou nenhuma.
 *
 * Por que não o `migrate()` do Drizzle: no SQLite, mudar um CHECK exige recriar a tabela
 * (cria `__new_x`, copia, `DROP TABLE x`, renomeia). Com `foreign_keys = ON`, o DROP faz um
 * DELETE implícito que dispararia os `ON DELETE CASCADE` (apagando parcelas!) ou falharia nos
 * RESTRICT. O `PRAGMA foreign_keys=OFF` que o Drizzle Kit escreve na migration não tem efeito
 * dentro de transação. Então seguimos o procedimento oficial do SQLite: desliga as chaves fora
 * da transação, aplica, confere com `PRAGMA foreign_key_check` antes do COMMIT e religa.
 * A tabela `__drizzle_migrations` é a mesma do Drizzle (hash e data), então tudo continua compatível.
 */
import { readMigrationFiles, type MigrationMeta } from 'drizzle-orm/migrator';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fazerBackup } from './backup.ts';
import type { Banco } from './conexao.ts';

export const TABELA_MIGRATIONS = '__drizzle_migrations';

export interface MigrationDoProjeto {
  tag: string;
  quando: number;
  hash: string;
}

export interface MigrationAplicada {
  hash: string;
  quando: number;
  tag: string | null;
}

export interface ResultadoMigracao {
  aplicadas: string[];
  backup: string | null;
}

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

/** Migrations que existem na pasta, na ordem do journal. */
export function migrationsDoProjeto(pasta: string): MigrationDoProjeto[] {
  const journal = JSON.parse(readFileSync(join(pasta, 'meta', '_journal.json'), 'utf8')) as Journal;
  const metas: MigrationMeta[] = readMigrationFiles({ migrationsFolder: pasta });
  return journal.entries.map((e, i) => ({
    tag: e.tag,
    quando: e.when,
    hash: metas[i]?.hash ?? '',
  }));
}

function tabelaExiste(banco: Banco, nome: string): boolean {
  return !!banco.sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(nome);
}

/** Migrations já registradas no banco, da mais antiga para a mais nova. */
export function migrationsAplicadas(banco: Banco, pasta?: string): MigrationAplicada[] {
  if (!tabelaExiste(banco, TABELA_MIGRATIONS)) return [];
  const rows = banco.sqlite
    .prepare(`SELECT hash, created_at AS quando FROM ${TABELA_MIGRATIONS} ORDER BY created_at`)
    .all() as { hash: string; quando: number | string }[];
  const projeto = pasta && existsSync(pasta) ? migrationsDoProjeto(pasta) : [];
  return rows.map((r) => ({
    hash: r.hash,
    quando: Number(r.quando),
    tag: projeto.find((p) => p.quando === Number(r.quando))?.tag ?? null,
  }));
}

/** Mesma regra do migrator do Drizzle: pendente = mais nova que a última aplicada. */
export function migrationsPendentes(banco: Banco, pasta: string): MigrationDoProjeto[] {
  const aplicadas = migrationsAplicadas(banco);
  const ultima = aplicadas.length ? Math.max(...aplicadas.map((a) => a.quando)) : -Infinity;
  return migrationsDoProjeto(pasta).filter((m) => m.quando > ultima);
}

/** Banco "novo" = sem nenhuma tabela de usuário. Nesse caso não há o que proteger com backup. */
export function bancoVazio(banco: Banco): boolean {
  const r = banco.sqlite
    .prepare(
      "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .get() as { n: number };
  return r.n === 0;
}

export function migrar(
  banco: Banco,
  pasta: string,
  pastaBackups: string | null,
): ResultadoMigracao {
  const pendentes = migrationsPendentes(banco, pasta);
  if (pendentes.length === 0) return { aplicadas: [], backup: null };
  const backup =
    pastaBackups && banco.arquivo !== ':memory:' && !bancoVazio(banco)
      ? fazerBackup(banco.sqlite, pastaBackups)
      : null;
  aplicarMigrations(banco, pasta);
  return { aplicadas: pendentes.map((p) => p.tag), backup };
}

function aplicarMigrations(banco: Banco, pasta: string): void {
  const s = banco.sqlite;
  const metas = readMigrationFiles({ migrationsFolder: pasta });
  s.exec(
    `CREATE TABLE IF NOT EXISTS ${TABELA_MIGRATIONS} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`,
  );
  const ultima = s.prepare(`SELECT max(created_at) AS quando FROM ${TABELA_MIGRATIONS}`).get() as {
    quando: number | string | null;
  };
  const desde = ultima.quando === null ? -Infinity : Number(ultima.quando);
  const pendentes = metas.filter((m) => m.folderMillis > desde);
  if (!pendentes.length) return;

  const fkLigada = Number(s.pragma('foreign_keys', { simple: true })) === 1;
  s.pragma('foreign_keys = OFF');
  try {
    s.exec('BEGIN IMMEDIATE');
    try {
      const registrar = s.prepare(
        `INSERT INTO ${TABELA_MIGRATIONS} ("hash", "created_at") VALUES (?, ?)`,
      );
      for (const m of pendentes) {
        for (const comando of m.sql) {
          // Os PRAGMA foreign_keys da migration seriam ignorados na transação; controlamos aqui.
          if (/^\s*PRAGMA\s+foreign_keys\s*=/i.test(comando) || !comando.trim()) continue;
          s.exec(comando);
        }
        registrar.run(m.hash, m.folderMillis);
      }
      const violacoes = s.pragma('foreign_key_check') as unknown[];
      if (violacoes.length) {
        throw new Error(
          `Migration deixaria ${violacoes.length} referência(s) quebrada(s): ${JSON.stringify(violacoes.slice(0, 3))}`,
        );
      }
      s.exec('COMMIT');
    } catch (e) {
      if (s.inTransaction) s.exec('ROLLBACK');
      throw e;
    }
  } finally {
    if (fkLigada) s.pragma('foreign_keys = ON');
  }
}

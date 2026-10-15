/**
 * Backup do banco.
 *
 * Usa `VACUUM INTO`, que gera uma cópia consistente e compacta mesmo com o banco em uso
 * no modo WAL (copiar o arquivo `.db` sozinho perderia o que ainda está no `-wal`).
 * Nome: `financas-AAAA-MM-DD-HHMMSS.db` (horário local).
 */
import type Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function nomeBackup(agora: Date = new Date()): string {
  const d = `${agora.getFullYear()}-${pad2(agora.getMonth() + 1)}-${pad2(agora.getDate())}`;
  const h = `${pad2(agora.getHours())}${pad2(agora.getMinutes())}${pad2(agora.getSeconds())}`;
  return `financas-${d}-${h}.db`;
}

/** Copia o banco aberto para a pasta de backups e devolve o caminho do arquivo criado. */
export function fazerBackup(
  sqlite: Database.Database,
  pastaBackups: string,
  agora: Date = new Date(),
): string {
  mkdirSync(pastaBackups, { recursive: true });
  const base = nomeBackup(agora).replace(/\.db$/, '');
  let destino = join(pastaBackups, `${base}.db`);
  for (let i = 2; existsSync(destino); i++) destino = join(pastaBackups, `${base}-${i}.db`);
  sqlite.prepare('VACUUM INTO ?').run(destino);
  return destino;
}

export interface InfoBackup {
  arquivo: string;
  nome: string;
  bytes: number;
  criadoEm: Date;
}

/** Backups existentes, do mais novo para o mais antigo. */
export function listarBackups(pastaBackups: string): InfoBackup[] {
  if (!existsSync(pastaBackups)) return [];
  return readdirSync(pastaBackups)
    .filter((n) => /^financas-.*\.db$/.test(n))
    .map((nome) => {
      const arquivo = join(pastaBackups, nome);
      const st = statSync(arquivo);
      return { arquivo, nome, bytes: st.size, criadoEm: st.mtime };
    })
    .sort((a, b) => b.nome.localeCompare(a.nome));
}

/**
 * pnpm backup
 *
 * Copia o banco para <pasta de dados>/backups/financas-AAAA-MM-DD-HHMMSS.db.
 * Pode rodar com o site aberto: a cópia é consistente mesmo no modo WAL.
 */
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarEnv, lerConfig } from '../src/lib/server/config.ts';
import { fazerBackup, listarBackups } from '../src/lib/server/db/backup.ts';
import { abrirBanco } from '../src/lib/server/db/conexao.ts';

carregarEnv(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const cfg = lerConfig();

if (!existsSync(cfg.bancoArquivo)) {
  console.error(`Ainda não existe banco em ${cfg.bancoArquivo}.`);
  console.error('Abra o site uma vez (pnpm start) para criá-lo.');
  process.exit(1);
}

const banco = abrirBanco(cfg.bancoArquivo);
try {
  const destino = fazerBackup(banco.sqlite, cfg.backupsDir);
  const kb = Math.max(1, Math.round(statSync(destino).size / 1024));
  console.log(`Backup criado: ${destino} (${kb} KB)`);
  console.log(`Backups guardados em ${cfg.backupsDir}: ${listarBackups(cfg.backupsDir).length}`);
} finally {
  banco.sqlite.close();
}

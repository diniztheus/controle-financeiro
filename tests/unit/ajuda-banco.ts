import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { lerConfig, type Config } from '../../src/lib/server/config';
import { abrirBanco, type Banco } from '../../src/lib/server/db/conexao';
import { migrar } from '../../src/lib/server/db/migrar';

export const PASTA_MIGRATIONS = resolve(__dirname, '../../drizzle');

/** Banco em memória com o esquema completo aplicado. */
export function bancoEmMemoria(): Banco {
  const banco = abrirBanco(':memory:');
  migrar(banco, PASTA_MIGRATIONS, null);
  return banco;
}

/** Pasta temporária isolada (nunca o ~/ControleFinanceiro real). */
export function pastaTemporaria(): { dir: string; config: Config; limpar: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'cf-teste-'));
  const config = lerConfig({
    dadosDir: dir,
    bancoArquivo: join(dir, 'financas.db'),
    backupsDir: join(dir, 'backups'),
    migrationsDir: PASTA_MIGRATIONS,
  });
  return { dir, config, limpar: () => rmSync(dir, { recursive: true, force: true }) };
}

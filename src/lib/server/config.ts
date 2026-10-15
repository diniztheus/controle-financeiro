/**
 * Onde ficam os dados. Lido do ambiente ou do arquivo `.env` na pasta do projeto.
 *
 * Sem configuração, os dados ficam em `~/ControleFinanceiro/dados/` (na pasta pessoal do
 * usuário, em qualquer sistema), fora da pasta do código: apagar ou atualizar o código nunca
 * toca no banco.
 *
 * Este arquivo usa só imports relativos com extensão `.ts` para rodar também nos scripts
 * (`node scripts/backup.ts`), fora do Vite.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NOME_ARQUIVO_BANCO = 'financas.db';

export interface Config {
  /** Pasta de dados (absoluta). */
  dadosDir: string;
  /** Arquivo do banco SQLite. */
  bancoArquivo: string;
  /** Pasta dos backups. */
  backupsDir: string;
  /** Pasta das migrations SQL geradas pelo Drizzle Kit. */
  migrationsDir: string;
}

let envCarregado = false;
let raizCache: string | null = null;

/**
 * Pasta do projeto: a primeira, subindo a partir deste arquivo, que tem `drizzle/meta/_journal.json`.
 * Funciona no código-fonte (src/lib/server), no site compilado (build/server/chunks) e nos
 * scripts, de qualquer pasta em que o comando seja rodado (`node /caminho/build` incluso).
 * Se não achar (ex.: build copiado sozinho para outro lugar), usa a pasta atual.
 */
export function raizDoProjeto(): string {
  if (raizCache) return raizCache;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, 'drizzle', 'meta', '_journal.json'))) return (raizCache = dir);
    const pai = dirname(dir);
    if (pai === dir) return (raizCache = process.cwd());
    dir = pai;
  }
}

/** Carrega `.env` do projeto uma única vez. Variáveis já definidas no ambiente têm prioridade. */
export function carregarEnv(pasta = raizDoProjeto()): void {
  if (envCarregado) return;
  envCarregado = true;
  const arquivo = join(pasta, '.env');
  if (existsSync(arquivo)) process.loadEnvFile(arquivo);
}

/** Expande "~" e torna o caminho absoluto. */
export function resolverCaminho(caminho: string, base = process.cwd()): string {
  let c = caminho.trim();
  if (c === '~') c = homedir();
  else if (c.startsWith('~/') || c.startsWith('~\\')) c = join(homedir(), c.slice(2));
  return isAbsolute(c) ? resolve(c) : resolve(base, c);
}

export function pastaDadosPadrao(): string {
  return join(homedir(), 'ControleFinanceiro', 'dados');
}

/**
 * Monta a configuração. `sobrescrever` serve para testes (pasta temporária).
 * Não cria nada no disco; para isso use {@link garantirPastas}.
 */
export function lerConfig(sobrescrever: Partial<Config> = {}, env = process.env): Config {
  carregarEnv();
  const bruto = env.DADOS_DIR?.trim();
  const raiz = raizDoProjeto();
  const dadosDir =
    sobrescrever.dadosDir ?? (bruto ? resolverCaminho(bruto, raiz) : pastaDadosPadrao());
  return {
    dadosDir,
    bancoArquivo: sobrescrever.bancoArquivo ?? join(dadosDir, NOME_ARQUIVO_BANCO),
    backupsDir: sobrescrever.backupsDir ?? join(dadosDir, 'backups'),
    migrationsDir:
      sobrescrever.migrationsDir ??
      (env.MIGRATIONS_DIR?.trim()
        ? resolverCaminho(env.MIGRATIONS_DIR, raiz)
        : join(raiz, 'drizzle')),
  };
}

/** Cria a pasta de dados e a de backups, se não existirem. */
export function garantirPastas(cfg: Config): void {
  mkdirSync(cfg.dadosDir, { recursive: true });
  mkdirSync(cfg.backupsDir, { recursive: true });
}

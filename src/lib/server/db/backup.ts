/**
 * Backup do banco.
 *
 * Usa `VACUUM INTO`, que gera uma cópia consistente e compacta mesmo com o banco em uso
 * no modo WAL (copiar o arquivo `.db` sozinho perderia o que ainda está no `-wal`).
 * Nome: `financas-AAAA-MM-DD-HHMMSS.db` (horário local).
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { lerConfig } from '../config.ts';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Tipo do backup, pelo prefixo do nome: `auto-` é automático, `antes-de-restaurar-` é a cópia de segurança. */
export type TipoBackup = 'automatico' | 'antes-de-restaurar' | 'manual';

/** Prefixos aceitos: letras minúsculas separadas por hífen (ex.: `auto`, `antes-de-restaurar`). */
const PREFIXO_VALIDO = /^[a-z]+(-[a-z]+)*$/;

/** `financas-AAAA-MM-DD-HHMMSS.db`, ou `financas-<prefixo>-AAAA-MM-DD-HHMMSS.db`. */
export function nomeBackup(agora: Date = new Date(), prefixo?: string): string {
  if (prefixo !== undefined && !PREFIXO_VALIDO.test(prefixo)) {
    throw new Error(`Prefixo de backup inválido: ${prefixo}`);
  }
  const p = prefixo ? `${prefixo}-` : '';
  const d = `${agora.getFullYear()}-${pad2(agora.getMonth() + 1)}-${pad2(agora.getDate())}`;
  const h = `${pad2(agora.getHours())}${pad2(agora.getMinutes())}${pad2(agora.getSeconds())}`;
  return `financas-${p}${d}-${h}.db`;
}

export function tipoDoBackup(nome: string): TipoBackup {
  const resto = nome.replace(/^financas-/, '');
  if (resto.startsWith('auto-')) return 'automatico';
  if (resto.startsWith('antes-de-restaurar-')) return 'antes-de-restaurar';
  return 'manual';
}

/**
 * Nome que pode ser usado para abrir um backup: só letras, números e hífens, sem separadores de
 * caminho nem "..". Evita que um nome vindo da URL ou da linha de comando saia da pasta de backups.
 */
export function nomeBackupValido(nome: string): boolean {
  return /^financas-[A-Za-z0-9-]+\.db$/.test(nome) && nome.length <= 120;
}

/** Copia o banco aberto para a pasta de backups e devolve o caminho do arquivo criado. */
export function fazerBackup(
  sqlite: Database.Database,
  pastaBackups: string,
  agora: Date = new Date(),
  prefixo?: string,
): string {
  mkdirSync(pastaBackups, { recursive: true });
  const base = nomeBackup(agora, prefixo).replace(/\.db$/, '');
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

/** Tabelas sem as quais um arquivo não é o banco do app. */
const TABELAS_ESSENCIAIS = ['contas', 'categorias', 'compras', 'parcelas', 'config'] as const;

export interface VerificacaoBackup {
  ok: boolean;
  erros: string[];
  tabelas: number;
  linhas: Record<string, number>;
  versaoEsquema: string | null;
}

/** Tag da última migration registrada no arquivo, lida do journal da pasta de migrations. */
function versaoDoEsquema(sqlite: Database.Database, pastaMigrations: string): string | null {
  const tem = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get();
  if (!tem) return null;
  const r = sqlite.prepare('SELECT max(created_at) AS q FROM __drizzle_migrations').get() as {
    q: number | string | null;
  };
  if (r.q === null) return null;
  const journal = JSON.parse(
    readFileSync(join(pastaMigrations, 'meta', '_journal.json'), 'utf8'),
  ) as {
    entries: { when: number; tag: string }[];
  };
  return journal.entries.find((e) => e.when === Number(r.q))?.tag ?? null;
}

/**
 * Confere um arquivo de backup SEM alterá-lo (aberto só para leitura, sempre fechado no fim):
 * integridade, chaves estrangeiras, tabelas essenciais e contagens principais.
 * Nunca lança: arquivo que não é um banco SQLite vira `ok: false` com a mensagem.
 */
export function verificarArquivoBackup(
  arquivo: string,
  pastaMigrations: string = lerConfig().migrationsDir,
): VerificacaoBackup {
  const resultado: VerificacaoBackup = {
    ok: false,
    erros: [],
    tabelas: 0,
    linhas: {},
    versaoEsquema: null,
  };
  let s: Database.Database | null = null;
  try {
    if (!existsSync(arquivo)) {
      resultado.erros.push('o arquivo não existe');
      return resultado;
    }
    s = new Database(arquivo, { readonly: true, fileMustExist: true });
    const integro = s.pragma('integrity_check') as { integrity_check: string }[];
    if (!(integro.length === 1 && integro[0]!.integrity_check === 'ok')) {
      for (const linha of integro.slice(0, 5)) resultado.erros.push(linha.integrity_check);
    }
    const quebradas = s.pragma('foreign_key_check') as unknown[];
    if (quebradas.length) {
      resultado.erros.push(`${quebradas.length} referência(s) entre tabelas quebrada(s)`);
    }
    const existentes = new Set(
      (
        s
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'",
          )
          .all() as { name: string }[]
      ).map((t) => t.name),
    );
    resultado.tabelas = existentes.size;
    for (const t of TABELAS_ESSENCIAIS) {
      if (!existentes.has(t)) resultado.erros.push(`falta a tabela ${t}`);
    }
    for (const t of ['contas', 'compras', 'receitas']) {
      if (!existentes.has(t)) {
        resultado.linhas[t] = 0;
        continue;
      }
      const r = s.prepare(`SELECT count(*) AS n FROM "${t}"`).get() as { n: number };
      resultado.linhas[t] = r.n;
    }
    resultado.versaoEsquema = versaoDoEsquema(s, pastaMigrations);
    resultado.ok = resultado.erros.length === 0;
  } catch {
    resultado.erros.push('o arquivo não é um banco de dados SQLite válido');
  } finally {
    s?.close();
  }
  return resultado;
}

/**
 * Apaga os backups AUTOMÁTICOS mais antigos além dos `manter` mais novos.
 * Manuais e de "antes de restaurar" nunca são apagados aqui. Devolve os nomes apagados.
 */
export function rotacionarAutomaticos(pastaBackups: string, manter: number): string[] {
  const limite = Math.max(1, Math.floor(manter));
  const automaticos = listarBackups(pastaBackups).filter(
    (b) => tipoDoBackup(b.nome) === 'automatico' && nomeBackupValido(b.nome),
  );
  const apagar = automaticos.slice(limite);
  for (const b of apagar) unlinkSync(join(pastaBackups, b.nome));
  return apagar.map((b) => b.nome);
}

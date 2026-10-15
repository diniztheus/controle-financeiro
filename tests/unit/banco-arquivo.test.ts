import Database from 'better-sqlite3';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  lerConfig,
  pastaDadosPadrao,
  raizDoProjeto,
  resolverCaminho,
} from '../../src/lib/server/config';
import { fazerBackup, listarBackups, nomeBackup } from '../../src/lib/server/db/backup';
import { abrirBanco } from '../../src/lib/server/db/conexao';
import { iniciarBanco } from '../../src/lib/server/db/index';
import {
  migrationsAplicadas,
  migrationsDoProjeto,
  migrationsPendentes,
} from '../../src/lib/server/db/migrar';
import { contas } from '../../src/lib/server/db/esquema';
import { lerStatus } from '../../src/lib/server/servicos/status';
import { PASTA_MIGRATIONS, pastaTemporaria } from './ajuda-banco';

const limpezas: (() => void)[] = [];
/** Todas as migrations do projeto, em ordem. */
const TAGS = migrationsDoProjeto(PASTA_MIGRATIONS).map((m) => m.tag);
afterEach(() => {
  while (limpezas.length) limpezas.pop()!();
});
function temp() {
  const t = pastaTemporaria();
  limpezas.push(t.limpar);
  return t;
}

describe('config', () => {
  it('padrão é ~/ControleFinanceiro/dados', () => {
    expect(pastaDadosPadrao()).toBe(join(homedir(), 'ControleFinanceiro', 'dados'));
    const cfg = lerConfig({}, {});
    expect(cfg.dadosDir).toBe(pastaDadosPadrao());
    expect(cfg.bancoArquivo).toBe(join(pastaDadosPadrao(), 'financas.db'));
    expect(cfg.backupsDir).toBe(join(pastaDadosPadrao(), 'backups'));
  });

  it('DADOS_DIR do ambiente, com ~ expandido', () => {
    expect(lerConfig({}, { DADOS_DIR: '~/x/y' }).dadosDir).toBe(join(homedir(), 'x', 'y'));
    expect(resolverCaminho('/abs/pasta')).toBe(resolve('/abs/pasta'));
    expect(resolverCaminho('rel', resolve('/base'))).toBe(resolve('/base', 'rel'));
  });

  it('os testes rodam com DADOS_DIR temporário (nunca o real)', () => {
    expect(process.env.DADOS_DIR).toBeTruthy();
    expect(lerConfig().dadosDir).not.toBe(pastaDadosPadrao());
  });
});

describe('arquivo do banco', () => {
  it('cria pasta e banco sozinho, em WAL, com o esquema aplicado', () => {
    const { config } = temp();
    const b = iniciarBanco(config);
    limpezas.unshift(() => b.sqlite.close());
    expect(b.criadoAgora).toBe(true);
    expect(existsSync(config.bancoArquivo)).toBe(true);
    expect(existsSync(config.backupsDir)).toBe(true);
    expect(b.migracao.aplicadas).toEqual(TAGS);
    expect(b.migracao.backup).toBeNull(); // banco novo: nada a proteger
    const st = lerStatus(b);
    expect(st.ok).toBe(true);
    expect(st.pragmas.journalMode).toBe('wal');
    expect(st.tabelasPresentes).toBe(13);
    expect(st.migrationsPendentes).toBe(0);
    expect(st.versaoEsquema).toBe(TAGS[TAGS.length - 1]);
  });

  it('segunda abertura não reaplica nem faz backup', () => {
    const { config } = temp();
    iniciarBanco(config).sqlite.close();
    const b = iniciarBanco(config);
    limpezas.unshift(() => b.sqlite.close());
    expect(b.criadoAgora).toBe(false);
    expect(b.migracao).toEqual({ aplicadas: [], backup: null });
    expect(listarBackups(config.backupsDir)).toHaveLength(0);
  });

  it('backup automático antes de aplicar migration nova num banco existente', () => {
    const { dir, config } = temp();
    // Banco com dados e a 1ª migration aplicada.
    const b1 = iniciarBanco(config);
    b1.db.insert(contas).values({ nome: 'Corrente', saldoCentavos: 4200 }).run();
    b1.sqlite.close();

    // Simula uma migration nova numa cópia da pasta drizzle/.
    const pasta = join(dir, 'drizzle');
    cpSync(PASTA_MIGRATIONS, pasta, { recursive: true });
    const journalArq = join(pasta, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalArq, 'utf8'));
    const ultima = journal.entries[journal.entries.length - 1];
    journal.entries.push({
      ...ultima,
      idx: ultima.idx + 1,
      when: ultima.when + 1000,
      tag: '9999_teste',
    });
    writeFileSync(journalArq, JSON.stringify(journal));
    writeFileSync(join(pasta, '9999_teste.sql'), 'ALTER TABLE `contas` ADD `apelido` text;');

    const cfg2 = { ...config, migrationsDir: pasta };
    const aberto = abrirBanco(cfg2.bancoArquivo);
    expect(migrationsPendentes(aberto, pasta).map((m) => m.tag)).toEqual(['9999_teste']);
    aberto.sqlite.close();

    const b2 = iniciarBanco(cfg2);
    limpezas.unshift(() => b2.sqlite.close());
    expect(b2.migracao.aplicadas).toEqual(['9999_teste']);
    expect(b2.migracao.backup).toMatch(/financas-\d{4}-\d{2}-\d{2}-\d{6}\.db$/);
    expect(migrationsAplicadas(b2, pasta).map((m) => m.tag)).toEqual([...TAGS, '9999_teste']);

    // O backup tem os dados e o esquema ANTERIOR à migration.
    const copia = new Database(b2.migracao.backup!, { readonly: true });
    limpezas.unshift(() => copia.close());
    expect(copia.prepare('SELECT saldo_centavos AS s FROM contas').get()).toEqual({ s: 4200 });
    const colunas = (copia.prepare('PRAGMA table_info(contas)').all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(colunas).not.toContain('apelido');
  });

  it('migration com erro não deixa o banco pela metade', () => {
    const { dir, config } = temp();
    iniciarBanco(config).sqlite.close();
    const pasta = join(dir, 'drizzle-ruim');
    cpSync(PASTA_MIGRATIONS, pasta, { recursive: true });
    const journalArq = join(pasta, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalArq, 'utf8'));
    const ultima = journal.entries[journal.entries.length - 1];
    journal.entries.push({ ...ultima, idx: 1, when: ultima.when + 1000, tag: '9999_ruim' });
    writeFileSync(journalArq, JSON.stringify(journal));
    writeFileSync(
      join(pasta, '9999_ruim.sql'),
      'CREATE TABLE `nova` (`id` text);\n--> statement-breakpoint\nISSO NAO E SQL;',
    );
    expect(() => iniciarBanco({ ...config, migrationsDir: pasta })).toThrow();
    const b = abrirBanco(config.bancoArquivo);
    limpezas.unshift(() => b.sqlite.close());
    expect(
      b.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'nova'").get(),
    ).toBeUndefined();
    expect(listarBackups(config.backupsDir)).toHaveLength(1); // backup foi feito antes de tentar
  });
});

describe('backup sob demanda', () => {
  it('nome com data e hora locais', () => {
    expect(nomeBackup(new Date(2026, 9, 5, 7, 3, 9))).toBe('financas-2026-10-05-070309.db');
  });

  it('copia o banco em uso (WAL) sem perder o que ainda está no -wal', () => {
    const { config } = temp();
    const b = iniciarBanco(config);
    limpezas.unshift(() => b.sqlite.close());
    b.db.insert(contas).values({ nome: 'Poupança', tipo: 'poupanca', saldoCentavos: 999 }).run();
    const agora = new Date(2026, 9, 15, 14, 30, 0);
    const a1 = fazerBackup(b.sqlite, config.backupsDir, agora);
    const a2 = fazerBackup(b.sqlite, config.backupsDir, agora);
    expect(a1).toMatch(/financas-2026-10-15-143000\.db$/);
    expect(a2).toMatch(/financas-2026-10-15-143000-2\.db$/);
    const copia = new Database(a1, { readonly: true });
    limpezas.unshift(() => copia.close());
    expect(copia.prepare('SELECT nome, saldo_centavos AS s FROM contas').get()).toEqual({
      nome: 'Poupança',
      s: 999,
    });
    expect(listarBackups(config.backupsDir).map((x) => x.nome)).toEqual(
      ['financas-2026-10-15-143000.db', 'financas-2026-10-15-143000-2.db'].sort().reverse(),
    );
  });

  it('listarBackups ignora outros arquivos e pasta inexistente', () => {
    const { dir } = temp();
    expect(listarBackups(join(dir, 'nao-existe'))).toEqual([]);
    mkdirSync(join(dir, 'b'));
    writeFileSync(join(dir, 'b', 'outra-coisa.txt'), 'x');
    expect(listarBackups(join(dir, 'b'))).toEqual([]);
  });
});

describe('pasta do projeto', () => {
  it('migrations ficam relativas ao projeto, não à pasta atual', () => {
    const atual = process.cwd();
    try {
      process.chdir(tmpdir());
      expect(lerConfig({}, {}).migrationsDir).toBe(PASTA_MIGRATIONS);
      expect(raizDoProjeto()).toBe(resolve(PASTA_MIGRATIONS, '..'));
    } finally {
      process.chdir(atual);
    }
  });
});

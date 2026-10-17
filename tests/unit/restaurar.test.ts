import Database from 'better-sqlite3';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fazerBackup, verificarArquivoBackup } from '../../src/lib/server/db/backup';
import { contas } from '../../src/lib/server/db/esquema';
import { iniciarBanco } from '../../src/lib/server/db/index';
import { migrationsDoProjeto } from '../../src/lib/server/db/migrar';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import { restaurarDoDisco, trocarBanco } from '../../src/lib/server/servicos/backups';
import { PASTA_MIGRATIONS, pastaTemporaria } from './ajuda-banco';

const limpezas: (() => void)[] = [];
const TAGS = migrationsDoProjeto(PASTA_MIGRATIONS).map((m) => m.tag);
afterEach(() => {
  while (limpezas.length) limpezas.pop()!();
});

function temp() {
  const t = pastaTemporaria();
  limpezas.push(t.limpar);
  return t;
}

/** Nomes das contas gravadas num arquivo (abre só para leitura). */
function nomesDeContas(arquivo: string): string[] {
  const s = new Database(arquivo, { readonly: true, fileMustExist: true });
  try {
    return (s.prepare('SELECT nome FROM contas ORDER BY nome').all() as { nome: string }[]).map(
      (r) => r.nome,
    );
  } finally {
    s.close();
  }
}

describe('restaurar do disco', () => {
  it('volta ao backup, desfaz o que veio depois e guarda o banco anterior', () => {
    const { config } = temp();
    const b = iniciarBanco(config);
    b.db.insert(contas).values({ nome: 'A', saldoCentavos: 100 }).run();
    const backup = basename(
      fazerBackup(b.sqlite, config.backupsDir, new Date(2026, 9, 10, 10), 'auto'),
    );
    b.db.insert(contas).values({ nome: 'B', saldoCentavos: 200 }).run();
    b.sqlite.close();

    const r = restaurarDoDisco(config, backup, new Date(2026, 9, 11, 12));
    expect(r.antesDeRestaurar).toBe('financas-antes-de-restaurar-2026-10-11-120000.db');
    expect(nomesDeContas(config.bancoArquivo)).toEqual(['A']);
    expect(nomesDeContas(join(config.backupsDir, r.antesDeRestaurar))).toEqual(['A', 'B']);
    expect(existsSync(`${config.bancoArquivo}-wal`)).toBe(false);
  });

  it('recusa backup corrompido e não toca no banco atual', () => {
    const { config } = temp();
    const b = iniciarBanco(config);
    b.db.insert(contas).values({ nome: 'Atual', saldoCentavos: 1 }).run();
    b.sqlite.close();
    const ruim = 'financas-2026-10-10-100000.db';
    writeFileSync(join(config.backupsDir, ruim), 'lixo '.repeat(500));
    expect(() => restaurarDoDisco(config, ruim)).toThrow(ErroDeNegocio);
    expect(nomesDeContas(config.bancoArquivo)).toEqual(['Atual']);
    expect(readdirSync(config.backupsDir).some((n) => n.includes('antes-de-restaurar'))).toBe(
      false,
    );
  });

  it('recusa nomes fora da pasta de backups (path traversal)', () => {
    const { config, dir } = temp();
    const b = iniciarBanco(config);
    b.sqlite.close();
    for (const ruim of [
      '../x.db',
      'a/b.db',
      join(dir, 'financas.db'),
      'financas-../financas.db',
      '',
    ]) {
      expect(() => restaurarDoDisco(config, ruim), ruim).toThrow(ErroDeNegocio);
    }
    expect(existsSync(config.bancoArquivo)).toBe(true);
  });

  it('restaura backup de esquema antigo e as migrations novas são aplicadas ao reabrir', () => {
    const { dir, config } = temp();
    // Esquema só até a migration 0003 (receitas).
    const pastaAntiga = join(dir, 'drizzle-ate-0003');
    cpSync(PASTA_MIGRATIONS, pastaAntiga, { recursive: true });
    const journalArq = join(pastaAntiga, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalArq, 'utf8'));
    journal.entries = journal.entries.slice(0, 4);
    writeFileSync(journalArq, JSON.stringify(journal));

    const antigo = iniciarBanco({
      ...config,
      bancoArquivo: join(dir, 'antigo.db'),
      migrationsDir: pastaAntiga,
    });
    antigo.db.insert(contas).values({ nome: 'Antiga', saldoCentavos: 5 }).run();
    const backup = basename(fazerBackup(antigo.sqlite, config.backupsDir, new Date(2026, 0, 5)));
    antigo.sqlite.close();
    expect(verificarArquivoBackup(join(config.backupsDir, backup), pastaAntiga).versaoEsquema).toBe(
      '0003_receitas',
    );

    // Banco atual, com o esquema completo e dados diferentes.
    const atual = iniciarBanco(config);
    atual.db.insert(contas).values({ nome: 'Nova', saldoCentavos: 9 }).run();
    atual.sqlite.close();

    restaurarDoDisco(config, backup);
    const reaberto = iniciarBanco(config);
    try {
      expect(reaberto.migracao.aplicadas).toEqual(TAGS.slice(4));
      expect(reaberto.sqlite.prepare('SELECT nome FROM contas').all()).toEqual([
        { nome: 'Antiga' },
      ]);
    } finally {
      reaberto.sqlite.close();
    }
  });

  it('falha no meio da troca desfaz: o banco volta à cópia de segurança', () => {
    const { config } = temp();
    const b = iniciarBanco(config);
    b.db.insert(contas).values({ nome: 'Intacta', saldoCentavos: 1 }).run();
    const copia = fazerBackup(
      b.sqlite,
      config.backupsDir,
      new Date(2026, 0, 6),
      'antes-de-restaurar',
    );
    b.sqlite.close();
    // A origem é uma pasta: a cópia para o temporário falha depois de o banco já estar pronto.
    const origemQuebrada = join(config.backupsDir, 'pasta-no-lugar-do-backup');
    mkdirSync(origemQuebrada);
    expect(() => trocarBanco(config, origemQuebrada, copia)).toThrow();
    expect(nomesDeContas(config.bancoArquivo)).toEqual(['Intacta']);
    expect(readdirSync(config.dadosDir).some((n) => n.startsWith('.restauracao-'))).toBe(false);
  });
});

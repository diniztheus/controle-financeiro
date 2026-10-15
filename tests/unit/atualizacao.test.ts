/**
 * Atualizar um banco da v0.0 (só a migration 0000) para o esquema atual:
 * backup antes, dados preservados (inclusive parcelas ligadas por CASCADE) e regras novas valendo.
 */
import Database from 'better-sqlite3';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lerConfig } from '../../src/lib/server/config';
import { iniciarBanco } from '../../src/lib/server/db/index';
import { migrationsDoProjeto } from '../../src/lib/server/db/migrar';
import { contarLinhas } from '../../src/lib/server/repos/sistema';
import { lerStatus } from '../../src/lib/server/servicos/status';
import { PASTA_MIGRATIONS } from './ajuda-banco';

const limpezas: (() => void)[] = [];
afterEach(() => {
  while (limpezas.length) limpezas.pop()!();
});

/** Pasta de migrations só com as primeiras `n` (simula uma versão antiga do código). */
function migrationsAte(dir: string, n: number): string {
  const pasta = join(dir, `drizzle-${n}`);
  cpSync(PASTA_MIGRATIONS, pasta, { recursive: true });
  const arq = join(pasta, 'meta', '_journal.json');
  const j = JSON.parse(readFileSync(arq, 'utf8'));
  j.entries = j.entries.slice(0, n);
  writeFileSync(arq, JSON.stringify(j));
  return pasta;
}

describe('atualização v0.0 → esquema atual', () => {
  it('faz backup, preserva todos os dados e passa a recusar float e data impossível', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cf-atualizacao-'));
    limpezas.push(() => rmSync(dir, { recursive: true, force: true }));
    const base = lerConfig({
      dadosDir: dir,
      bancoArquivo: join(dir, 'financas.db'),
      backupsDir: join(dir, 'backups'),
    });

    // 1. Banco criado pela v0.0, com dados em todas as tabelas.
    const v00 = iniciarBanco({ ...base, migrationsDir: migrationsAte(dir, 1) });
    expect(v00.migracao.aplicadas).toEqual(['0000_fundacao']);
    v00.sqlite.exec(`
      INSERT INTO contas (id, nome, saldo_centavos) VALUES ('conta', 'Corrente', 123456);
      INSERT INTO saldos_historico (id, conta_id, saldo_centavos) VALUES ('h1', 'conta', 100000);
      INSERT INTO categorias (id, nome) VALUES ('cat', 'Mercado'), ('cat2', 'Lazer');
      INSERT INTO cartoes (id, nome, limite_centavos, dia_fechamento, dia_vencimento) VALUES ('cartao', 'Visa', 500000, 3, 10);
      INSERT INTO compras (id, descricao, categoria_id, data_compra, valor_total_centavos, meio, conta_id)
        VALUES ('avista', 'Feira', 'cat', '2026-10-15', 4990, 'conta', 'conta');
      INSERT INTO compras (id, descricao, categoria_id, data_compra, valor_total_centavos, meio, cartao_id, num_parcelas)
        VALUES ('tv', 'TV', 'cat2', '2026-10-15', 10000, 'cartao', 'cartao', 3);
      INSERT INTO faturas (id, cartao_id, mes_vencimento, data_fechamento, data_vencimento)
        VALUES ('f1', 'cartao', '2026-11', '2026-11-03', '2026-11-10');
      INSERT INTO parcelas (id, compra_id, numero, valor_centavos, mes_competencia, fatura_id) VALUES
        ('p0', 'avista', 1, 4990, '2026-10', NULL),
        ('p1', 'tv', 1, 3334, '2026-10', 'f1'),
        ('p2', 'tv', 2, 3333, '2026-11', NULL),
        ('p3', 'tv', 3, 3333, '2026-12', NULL);
      INSERT INTO btc_movimentos (id, sats, valor_centavos, data) VALUES ('b1', 150000, 52000, '2026-10-01');
      INSERT INTO btc_precos (data, preco_centavos, origem) VALUES ('2026-10-01', 34666666, 'implicito');
      INSERT INTO limites_mensais (mes, valor_centavos) VALUES ('padrao', 300000);
      INSERT INTO config (chave, valor) VALUES ('tema', '"escuro"');
    `);
    // A v0.0 aceitava isto (o defeito corrigido na 0001):
    expect(() =>
      v00.sqlite.prepare("UPDATE contas SET ordem = 1 WHERE id = 'conta'").run(),
    ).not.toThrow();
    const antes = contarLinhas(v00);
    v00.sqlite.close();

    // 2. Código novo abre o mesmo banco.
    const novo = iniciarBanco({ ...base, migrationsDir: PASTA_MIGRATIONS });
    limpezas.unshift(() => novo.sqlite.close());
    const tags = migrationsDoProjeto(PASTA_MIGRATIONS).map((m) => m.tag);
    expect(novo.migracao.aplicadas).toEqual(tags.slice(1));
    expect(novo.migracao.aplicadas).toContain('0001_tipos_e_datas');
    expect(novo.migracao.aplicadas).toContain('0002_gasto_conta_e_descricao_opcionais');

    // Backup antes, com o esquema antigo e os dados.
    expect(novo.migracao.backup).toMatch(/financas-\d{4}-\d{2}-\d{2}-\d{6}\.db$/);
    const copia = new Database(novo.migracao.backup!, { readonly: true });
    limpezas.unshift(() => copia.close());
    expect(copia.prepare('SELECT count(*) AS n FROM parcelas').get()).toEqual({ n: 4 });
    expect(copia.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get()).toEqual({ n: 1 });

    // Nada se perdeu: mesmas contagens, parcelas ainda ligadas às compras e à fatura.
    expect(contarLinhas(novo)).toEqual(antes);
    const s = novo.sqlite;
    expect(
      s.prepare("SELECT sum(valor_centavos) AS t FROM parcelas WHERE compra_id = 'tv'").get(),
    ).toEqual({ t: 10000 });
    expect(s.prepare("SELECT fatura_id FROM parcelas WHERE id = 'p1'").get()).toEqual({
      fatura_id: 'f1',
    });
    expect(s.prepare("SELECT saldo_centavos FROM contas WHERE id = 'conta'").get()).toEqual({
      saldo_centavos: 123456,
    });
    // 0002: a compra recriada manteve a conta, e agora aceita gasto sem conta e sem descrição.
    expect(s.prepare("SELECT conta_id FROM compras WHERE id = 'avista'").get()).toEqual({
      conta_id: 'conta',
    });
    expect(() =>
      s
        .prepare(
          "INSERT INTO compras (id, descricao, categoria_id, data_compra, valor_total_centavos, meio) VALUES ('semconta', NULL, 'cat', '2026-10-16', 100, 'conta')",
        )
        .run(),
    ).not.toThrow();
    s.prepare("DELETE FROM compras WHERE id = 'semconta'").run();
    expect(s.pragma('foreign_key_check')).toEqual([]);
    expect(s.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(lerStatus(novo).ok).toBe(true);

    // Nenhuma sobra de tabela temporária, índices recriados.
    const nomes = s.prepare('SELECT name, sql FROM sqlite_master').all() as {
      name: string;
      sql: string | null;
    }[];
    expect(nomes.filter((x) => x.name.startsWith('__new_') || x.sql?.includes('__new_'))).toEqual(
      [],
    );
    for (const idx of [
      'categorias_nome_unico',
      'faturas_cartao_mes_unico',
      'parcelas_compra_numero_unico',
      'parcelas_mes_competencia_idx',
      'compras_data_idx',
      'compras_categoria_idx',
    ]) {
      expect(nomes.map((x) => x.name)).toContain(idx);
    }

    // CASCADE continua funcionando depois da recriação das tabelas.
    s.prepare("DELETE FROM compras WHERE id = 'tv'").run();
    expect(s.prepare("SELECT count(*) AS n FROM parcelas WHERE compra_id = 'tv'").get()).toEqual({
      n: 0,
    });

    // Regras novas valendo.
    expect(() =>
      s.prepare("UPDATE contas SET saldo_centavos = 10.5 WHERE id = 'conta'").run(),
    ).toThrow(/CHECK/);
    expect(() =>
      s.prepare("UPDATE contas SET saldo_centavos = 'abc' WHERE id = 'conta'").run(),
    ).toThrow(/CHECK/);
    expect(() => s.prepare('UPDATE btc_movimentos SET sats = 1.5').run()).toThrow(/CHECK/);
    expect(() => s.prepare('UPDATE parcelas SET valor_centavos = -5').run()).toThrow(/CHECK/);
    expect(() => s.prepare("UPDATE compras SET data_compra = '2026-02-31'").run()).toThrow(/CHECK/);
    expect(() =>
      s.prepare("INSERT INTO categorias (id, nome) VALUES ('c3', 'Saúde')").run(),
    ).not.toThrow();
    expect(() =>
      s.prepare("INSERT INTO categorias (id, nome) VALUES ('c4', 'mercado')").run(),
    ).toThrow(/UNIQUE/);
  });

  it('migration que quebraria uma referência é desfeita inteira', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cf-atualizacao-'));
    limpezas.push(() => rmSync(dir, { recursive: true, force: true }));
    const cfg = lerConfig({
      dadosDir: dir,
      bancoArquivo: join(dir, 'financas.db'),
      backupsDir: join(dir, 'backups'),
      migrationsDir: PASTA_MIGRATIONS,
    });
    const b = iniciarBanco(cfg);
    b.sqlite.exec(`INSERT INTO contas (id, nome) VALUES ('conta', 'C');
      INSERT INTO saldos_historico (id, conta_id, saldo_centavos) VALUES ('h', 'conta', 1);`);
    b.sqlite.close();

    const pasta = join(dir, 'drizzle-fk');
    cpSync(PASTA_MIGRATIONS, pasta, { recursive: true });
    const arq = join(pasta, 'meta', '_journal.json');
    const j = JSON.parse(readFileSync(arq, 'utf8'));
    const ult = j.entries[j.entries.length - 1];
    j.entries.push({ ...ult, idx: ult.idx + 1, when: ult.when + 1000, tag: '9999_apaga_conta' });
    writeFileSync(arq, JSON.stringify(j));
    writeFileSync(join(pasta, '9999_apaga_conta.sql'), "DELETE FROM contas WHERE id = 'conta';");

    expect(() => iniciarBanco({ ...cfg, migrationsDir: pasta })).toThrow(/referência/);
    const depois = new Database(cfg.bancoArquivo);
    limpezas.unshift(() => depois.close());
    expect(depois.prepare('SELECT count(*) AS n FROM contas').get()).toEqual({ n: 1 });
    expect(depois.prepare('SELECT count(*) AS n FROM saldos_historico').get()).toEqual({ n: 1 });
  });
});

import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../../src/lib/server/db/conexao';
import {
  btcMovimentos,
  btcPrecos,
  cartoes,
  categorias,
  compras,
  config,
  contas,
  faturas,
  limitesMensais,
  parcelas,
  saldosHistorico,
  TABELAS,
} from '../../src/lib/server/db/esquema';
import { contarLinhas, lerPragmas, tabelasDoBanco } from '../../src/lib/server/repos/sistema';
import { bancoEmMemoria } from './ajuda-banco';

let banco: Banco;
beforeEach(() => {
  banco = bancoEmMemoria();
});
afterEach(() => banco.sqlite.close());

/** Executa e espera que o banco recuse com erro de restrição. */
function recusa(fn: () => unknown, padrao: RegExp = /constraint/i) {
  expect(fn).toThrow(padrao);
}

function base() {
  const { db } = banco;
  const conta = db
    .insert(contas)
    .values({ nome: 'Nubank', saldoCentavos: 150000 })
    .returning()
    .get();
  const cat = db.insert(categorias).values({ nome: 'Mercado', cor: 'c0' }).returning().get();
  const cartao = db
    .insert(cartoes)
    .values({ nome: 'Visa', limiteCentavos: 500000, diaFechamento: 3, diaVencimento: 10 })
    .returning()
    .get();
  return { conta, cat, cartao };
}

describe('esquema', () => {
  it('cria as 13 tabelas (as 11 da seção 3 mais receitas e recorrentes)', () => {
    expect(tabelasDoBanco(banco).sort()).toEqual([...TABELAS].sort());
    expect(contarLinhas(banco).every((t) => t.linhas === 0)).toBe(true);
  });

  it('chaves estrangeiras ligadas e busy_timeout definido', () => {
    const p = lerPragmas(banco);
    expect(p.foreignKeys).toBe(true);
    expect(p.busyTimeoutMs).toBe(5000);
    expect(p.integridadeRapida).toBe('ok');
  });

  it('cria os índices pedidos no plano', () => {
    const idx = (
      banco.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    for (const nome of [
      'parcelas_mes_competencia_idx',
      'parcelas_fatura_idx',
      'compras_data_idx',
      'compras_categoria_idx',
      'btc_movimentos_data_idx',
      'saldos_historico_conta_data_idx',
      'faturas_cartao_mes_unico',
      'categorias_nome_unico',
    ]) {
      expect(idx).toContain(nome);
    }
  });

  it('ids são ULID e timestamps são preenchidos', () => {
    const { conta } = base();
    expect(conta.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(conta.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(conta.atualizadoEm).toBe(conta.criadoEm);
    expect(conta.removidoEm).toBeNull();
    expect(conta.ativa).toBe(true);
    expect(conta.tipo).toBe('corrente');
  });

  it('atualizado_em muda ao atualizar', async () => {
    const { conta } = base();
    await new Promise((r) => setTimeout(r, 5));
    const nova = banco.db
      .update(contas)
      .set({ saldoCentavos: 1 })
      .where(eq(contas.id, conta.id))
      .returning()
      .get();
    expect(nova.atualizadoEm > conta.atualizadoEm).toBe(true);
  });
});

describe('CHECKs', () => {
  it('tipo de conta', () => {
    recusa(() =>
      banco.sqlite.prepare("INSERT INTO contas (id, nome, tipo) VALUES ('x', 'A', 'cripto')").run(),
    );
    recusa(() => banco.sqlite.prepare("INSERT INTO contas (id, nome) VALUES ('y', '   ')").run());
  });

  it('dias de fechamento e vencimento de 1 a 31', () => {
    for (const [f, v] of [
      [0, 10],
      [32, 10],
      [5, 0],
      [5, 32],
    ] as const) {
      recusa(() =>
        banco.db.insert(cartoes).values({ nome: 'X', diaFechamento: f, diaVencimento: v }).run(),
      );
    }
    expect(() =>
      banco.db.insert(cartoes).values({ nome: 'Y', diaFechamento: 31, diaVencimento: 1 }).run(),
    ).not.toThrow();
  });

  it('nome de categoria único, sem diferenciar maiúsculas', () => {
    base();
    recusa(() => banco.db.insert(categorias).values({ nome: 'Mercado' }).run(), /UNIQUE/);
    recusa(() => banco.db.insert(categorias).values({ nome: 'mercado' }).run(), /UNIQUE/);
  });

  it('compra: meio cartão ⇒ cartao_id; meio conta aceita conta em branco', () => {
    const { conta, cat, cartao } = base();
    const c = {
      descricao: 'Feira',
      categoriaId: cat.id,
      dataCompra: '2026-10-15',
      valorTotalCentavos: 1000,
    };
    // Gasto à vista sem conta ("Não informar") e sem descrição, como no app atual.
    expect(() =>
      banco.db
        .insert(compras)
        .values({ ...c, descricao: null, meio: 'conta' })
        .run(),
    ).not.toThrow();
    recusa(() =>
      banco.db
        .insert(compras)
        .values({ ...c, meio: 'cartao' })
        .run(),
    );
    recusa(() =>
      banco.db
        .insert(compras)
        .values({ ...c, meio: 'cartao', contaId: conta.id })
        .run(),
    );
    recusa(() =>
      banco.db
        .insert(compras)
        .values({ ...c, meio: 'conta', contaId: conta.id, cartaoId: cartao.id })
        .run(),
    );
    recusa(() =>
      banco.sqlite
        .prepare(
          `INSERT INTO compras (id, descricao, categoria_id, data_compra, valor_total_centavos, meio, conta_id) VALUES ('z', 'a', '${cat.id}', '2026-10-15', 10, 'pix', '${conta.id}')`,
        )
        .run(),
    );
    expect(() =>
      banco.db
        .insert(compras)
        .values({ ...c, meio: 'conta', contaId: conta.id })
        .run(),
    ).not.toThrow();
    expect(() =>
      banco.db
        .insert(compras)
        .values({ ...c, meio: 'cartao', cartaoId: cartao.id, numParcelas: 24 })
        .run(),
    ).not.toThrow();
  });

  it('compra: parcelas de 1 a 24, valor positivo, data ISO', () => {
    const { cat, cartao } = base();
    const c = {
      descricao: 'TV',
      categoriaId: cat.id,
      dataCompra: '2026-10-15',
      valorTotalCentavos: 1000,
      meio: 'cartao' as const,
      cartaoId: cartao.id,
    };
    recusa(() =>
      banco.db
        .insert(compras)
        .values({ ...c, numParcelas: 0 })
        .run(),
    );
    recusa(() =>
      banco.db
        .insert(compras)
        .values({ ...c, numParcelas: 25 })
        .run(),
    );
    recusa(() =>
      banco.db
        .insert(compras)
        .values({ ...c, valorTotalCentavos: 0 })
        .run(),
    );
    recusa(() =>
      banco.db
        .insert(compras)
        .values({ ...c, dataCompra: '15/10/2026' })
        .run(),
    );
    recusa(() =>
      banco.db
        .insert(compras)
        .values({ ...c, dataCompra: '2026-13-01' })
        .run(),
    );
    recusa(() =>
      banco.db
        .insert(compras)
        .values({ ...c, descricao: ' ' })
        .run(),
    );
  });

  it('chave estrangeira inexistente é recusada', () => {
    recusa(
      () =>
        banco.db
          .insert(compras)
          .values({
            descricao: 'x',
            categoriaId: 'nao-existe',
            dataCompra: '2026-10-15',
            valorTotalCentavos: 1,
            meio: 'conta',
            contaId: 'nao-existe',
          })
          .run(),
      /FOREIGN KEY/,
    );
    recusa(
      () =>
        banco.db.insert(saldosHistorico).values({ contaId: 'nao-existe', saldoCentavos: 1 }).run(),
      /FOREIGN KEY/,
    );
  });

  it('fatura única por cartão e mês de vencimento', () => {
    const { cartao } = base();
    const f = {
      cartaoId: cartao.id,
      mesVencimento: '2026-11',
      dataFechamento: '2026-11-03',
      dataVencimento: '2026-11-10',
    };
    banco.db.insert(faturas).values(f).run();
    recusa(() => banco.db.insert(faturas).values(f).run(), /UNIQUE/);
    recusa(() =>
      banco.db
        .insert(faturas)
        .values({ ...f, mesVencimento: '2026-13' })
        .run(),
    );
    recusa(() =>
      banco.db
        .insert(faturas)
        .values({ ...f, mesVencimento: '2026-12', pagaEm: 'ontem' })
        .run(),
    );
  });

  it('parcelas: apagar a compra apaga as parcelas (cascade); apagar fatura solta a parcela', () => {
    const { cat, cartao } = base();
    const compra = banco.db
      .insert(compras)
      .values({
        descricao: 'TV',
        categoriaId: cat.id,
        dataCompra: '2026-10-15',
        valorTotalCentavos: 1000,
        meio: 'cartao',
        cartaoId: cartao.id,
        numParcelas: 2,
      })
      .returning()
      .get();
    const fat = banco.db
      .insert(faturas)
      .values({
        cartaoId: cartao.id,
        mesVencimento: '2026-11',
        dataFechamento: '2026-11-03',
        dataVencimento: '2026-11-10',
      })
      .returning()
      .get();
    banco.db
      .insert(parcelas)
      .values([
        {
          compraId: compra.id,
          numero: 1,
          valorCentavos: 500,
          mesCompetencia: '2026-10',
          faturaId: fat.id,
        },
        { compraId: compra.id, numero: 2, valorCentavos: 500, mesCompetencia: '2026-11' },
      ])
      .run();
    recusa(
      () =>
        banco.db
          .insert(parcelas)
          .values({ compraId: compra.id, numero: 2, valorCentavos: 1, mesCompetencia: '2026-11' })
          .run(),
      /UNIQUE/,
    );
    recusa(() =>
      banco.db
        .insert(parcelas)
        .values({ compraId: compra.id, numero: 25, valorCentavos: 1, mesCompetencia: '2026-11' })
        .run(),
    );
    recusa(() =>
      banco.db
        .insert(parcelas)
        .values({ compraId: compra.id, numero: 3, valorCentavos: 1, mesCompetencia: '2026-1' })
        .run(),
    );

    banco.db.delete(faturas).where(eq(faturas.id, fat.id)).run();
    expect(
      banco.db
        .select()
        .from(parcelas)
        .all()
        .map((p) => p.faturaId),
    ).toEqual([null, null]);

    banco.db.delete(compras).where(eq(compras.id, compra.id)).run();
    expect(
      banco.db
        .select({ n: sql<number>`count(*)` })
        .from(parcelas)
        .get()?.n,
    ).toBe(0);
  });

  it('cartão com fatura não pode ser apagado de verdade (só ir para a lixeira)', () => {
    const { cartao } = base();
    banco.db
      .insert(faturas)
      .values({
        cartaoId: cartao.id,
        mesVencimento: '2026-11',
        dataFechamento: '2026-11-03',
        dataVencimento: '2026-11-10',
      })
      .run();
    recusa(() => banco.db.delete(cartoes).where(eq(cartoes.id, cartao.id)).run(), /FOREIGN KEY/);
  });

  it('histórico de saldo some junto com a conta apagada de verdade', () => {
    const { conta } = base();
    banco.db.insert(saldosHistorico).values({ contaId: conta.id, saldoCentavos: 100 }).run();
    banco.db.delete(contas).where(eq(contas.id, conta.id)).run();
    expect(banco.db.select().from(saldosHistorico).all()).toHaveLength(0);
  });

  it('bitcoin: sats diferente de zero, valor não negativo, preço positivo e origem válida', () => {
    recusa(() => banco.db.insert(btcMovimentos).values({ sats: 0, data: '2026-10-15' }).run());
    recusa(() =>
      banco.db
        .insert(btcMovimentos)
        .values({ sats: 10, valorCentavos: -1, data: '2026-10-15' })
        .run(),
    );
    expect(() =>
      banco.db.insert(btcMovimentos).values({ sats: -500, data: '2026-10-15' }).run(),
    ).not.toThrow();
    recusa(() => banco.db.insert(btcPrecos).values({ data: '2026-10-15', precoCentavos: 0 }).run());
    recusa(() =>
      banco.sqlite
        .prepare(
          "INSERT INTO btc_precos (data, preco_centavos, origem) VALUES ('2026-10-15', 1, 'chute')",
        )
        .run(),
    );
    banco.db
      .insert(btcPrecos)
      .values({ data: '2026-10-15', precoCentavos: 60000000, origem: 'api' })
      .run();
    recusa(
      () => banco.db.insert(btcPrecos).values({ data: '2026-10-15', precoCentavos: 1 }).run(),
      /UNIQUE|PRIMARY/,
    );
  });

  it('limites mensais: AAAA-MM ou "padrao"', () => {
    banco.db
      .insert(limitesMensais)
      .values([
        { mes: 'padrao', valorCentavos: 300000 },
        { mes: '2026-10', valorCentavos: 250000 },
      ])
      .run();
    recusa(() =>
      banco.db.insert(limitesMensais).values({ mes: 'outubro', valorCentavos: 1 }).run(),
    );
    recusa(() =>
      banco.db.insert(limitesMensais).values({ mes: '2026-11', valorCentavos: -1 }).run(),
    );
  });

  it('config guarda JSON', () => {
    banco.db
      .insert(config)
      .values({ chave: 'tema', valor: { modo: 'escuro' } })
      .run();
    expect(banco.db.select().from(config).get()?.valor).toEqual({ modo: 'escuro' });
    recusa(() =>
      banco.sqlite.prepare("INSERT INTO config (chave, valor) VALUES ('x', '{quebrado')").run(),
    );
  });
});

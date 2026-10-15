/**
 * As tabelas não são STRICT, então o banco precisa recusar sozinho: dinheiro/sats em float ou
 * texto, valores negativos onde não cabem e datas que não existem (migration 0001).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../../src/lib/server/db/conexao';
import { bancoEmMemoria } from './ajuda-banco';

let banco: Banco;
let ids: { conta: string; cat: string; cartao: string; compra: string; fatura: string };

beforeEach(() => {
  banco = bancoEmMemoria();
  const s = banco.sqlite;
  s.exec(`
    INSERT INTO contas (id, nome) VALUES ('conta', 'Corrente');
    INSERT INTO categorias (id, nome) VALUES ('cat', 'Mercado');
    INSERT INTO cartoes (id, nome, dia_fechamento, dia_vencimento) VALUES ('cartao', 'Visa', 3, 10);
    INSERT INTO compras (id, descricao, categoria_id, data_compra, valor_total_centavos, meio, cartao_id, num_parcelas)
      VALUES ('compra', 'TV', 'cat', '2026-10-15', 1000, 'cartao', 'cartao', 2);
    INSERT INTO faturas (id, cartao_id, mes_vencimento, data_fechamento, data_vencimento)
      VALUES ('fatura', 'cartao', '2026-11', '2026-11-03', '2026-11-10');
  `);
  ids = { conta: 'conta', cat: 'cat', cartao: 'cartao', compra: 'compra', fatura: 'fatura' };
});
afterEach(() => banco.sqlite.close());

/** Monta um INSERT válido por tabela; `coluna` recebe `valor` (via parâmetro, sem conversão). */
function inserir(tabela: string, coluna: string, valor: unknown) {
  const n = Math.random().toString(36).slice(2);
  const base: Record<string, Record<string, unknown>> = {
    contas: { id: n, nome: 'X', saldo_centavos: 0, ativa: 1, ordem: 0 },
    saldos_historico: { id: n, conta_id: ids.conta, saldo_centavos: 0 },
    categorias: { id: n, nome: 'Cat ' + n, ordem: 0, arquivada: 0 },
    cartoes: {
      id: n,
      nome: 'C',
      limite_centavos: 0,
      dia_fechamento: 1,
      dia_vencimento: 1,
      ativo: 1,
    },
    compras: {
      id: n,
      descricao: 'd',
      categoria_id: ids.cat,
      data_compra: '2026-10-15',
      valor_total_centavos: 100,
      meio: 'conta',
      conta_id: ids.conta,
      num_parcelas: 1,
    },
    parcelas: {
      id: n,
      compra_id: ids.compra,
      numero: 3,
      valor_centavos: 1,
      mes_competencia: '2026-10',
    },
    faturas: {
      id: n,
      cartao_id: ids.cartao,
      mes_vencimento: '2027-01',
      data_fechamento: '2027-01-03',
      data_vencimento: '2027-01-10',
      paga_em: null,
      valor_pago_centavos: null,
    },
    btc_movimentos: { id: n, sats: 1, valor_centavos: 0, data: '2026-10-15' },
    btc_precos: { data: '2026-10-15', preco_centavos: 1, origem: 'manual' },
    limites_mensais: { mes: '2026-10', valor_centavos: 0 },
  };
  const linha = { ...base[tabela], [coluna]: valor };
  const cols = Object.keys(linha);
  banco.sqlite
    .prepare(
      `INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(linha));
}

const recusa = (t: string, c: string, v: unknown) =>
  expect(() => inserir(t, c, v), `${t}.${c} = ${JSON.stringify(v)}`).toThrow(/CHECK constraint/);
const aceita = (t: string, c: string, v: unknown) =>
  expect(() => inserir(t, c, v), `${t}.${c} = ${JSON.stringify(v)}`).not.toThrow();

// [tabela, coluna, valor válido, aceita negativo?]
const INTEIRAS: [string, string, number, boolean][] = [
  ['contas', 'saldo_centavos', 150, true],
  ['contas', 'ordem', 2, true],
  ['contas', 'ativa', 1, false],
  ['saldos_historico', 'saldo_centavos', -150, true],
  ['categorias', 'ordem', 1, true],
  ['categorias', 'arquivada', 0, false],
  ['cartoes', 'limite_centavos', 500000, false],
  ['cartoes', 'dia_fechamento', 31, false],
  ['cartoes', 'dia_vencimento', 1, false],
  ['cartoes', 'ativo', 1, false],
  ['compras', 'valor_total_centavos', 1, false],
  ['compras', 'num_parcelas', 24, false],
  ['parcelas', 'numero', 4, false],
  ['parcelas', 'valor_centavos', 0, false],
  ['faturas', 'valor_pago_centavos', 1990, false],
  ['btc_movimentos', 'sats', -2100, true],
  ['btc_movimentos', 'valor_centavos', 0, false],
  ['btc_precos', 'preco_centavos', 35000000, false],
  ['limites_mensais', 'valor_centavos', 300000, false],
];

describe('colunas inteiras recusam float, texto e (quando não cabe) negativo', () => {
  it.each(INTEIRAS)('%s.%s', (tabela, coluna, valido, aceitaNegativo) => {
    aceita(tabela, coluna, valido);
    // float com parte decimal; 10.0 o SQLite já guarda como inteiro, e tudo bem
    recusa(tabela, coluna, valido + 0.5);
    // texto não numérico e texto numérico (que viraria inteiro por afinidade… e não deve passar como 'abc')
    recusa(tabela, coluna, 'abc');
    recusa(tabela, coluna, '');
    // blob
    recusa(tabela, coluna, Buffer.from([1]));
    if (aceitaNegativo) aceita(tabela, coluna, -7);
    else recusa(tabela, coluna, -7);
  });

  it('booleanos só 0 ou 1', () => {
    recusa('contas', 'ativa', 2);
    recusa('cartoes', 'ativo', 0.5);
    recusa('categorias', 'arquivada', 'sim');
  });

  it('parcela pode ser zero (R$ 0,05 em 24 vezes) mas não negativa', () => {
    aceita('parcelas', 'valor_centavos', 0);
    recusa('parcelas', 'valor_centavos', -5);
  });

  it('valor pago da fatura pode ficar vazio', () => {
    aceita('faturas', 'valor_pago_centavos', null);
  });
});

describe('datas AAAA-MM-DD precisam existir no calendário', () => {
  const DATAS: [string, string][] = [
    ['compras', 'data_compra'],
    ['faturas', 'data_fechamento'],
    ['faturas', 'data_vencimento'],
    ['faturas', 'paga_em'],
    ['btc_movimentos', 'data'],
    ['btc_precos', 'data'],
  ];
  it.each(DATAS)('%s.%s', (tabela, coluna) => {
    aceita(tabela, coluna, '2028-02-29');
    for (const ruim of [
      '2026-02-31',
      '2026-02-29',
      '2026-04-31',
      '2026-13-01',
      '2026-00-10',
      '2026-01-00',
      '2026-01-32',
      '2026-1-5',
      '2026-01-05 10:00',
      '15/10/2026',
      'ontem',
    ]) {
      recusa(tabela, coluna, ruim);
    }
    recusa(tabela, coluna, 20261015);
  });

  it('meses AAAA-MM continuam validados', () => {
    recusa('parcelas', 'mes_competencia', '2026-13');
    recusa('limites_mensais', 'mes', 202610);
    aceita('limites_mensais', 'mes', 'padrao');
  });
});

describe('categorias', () => {
  it('nomes diferentes convivem; repetido sem diferenciar maiúsculas não', () => {
    aceita('categorias', 'nome', 'Transporte');
    aceita('categorias', 'nome', 'Lazer');
    expect(() => inserir('categorias', 'nome', 'mercado')).toThrow(/UNIQUE/);
  });
});

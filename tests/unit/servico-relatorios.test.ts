import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../../src/lib/server/db/conexao';
import { cartoes, compras, parcelas } from '../../src/lib/server/db/esquema';
import { criarCategoria } from '../../src/lib/server/servicos/categorias';
import { criarConta, atualizarSaldo, removerConta } from '../../src/lib/server/servicos/contas';
import {
  definirPrecoManual,
  registrarMovimento,
  removerMovimento,
} from '../../src/lib/server/servicos/bitcoin';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import { lancamentosDoMes, lancarGasto, removerGasto } from '../../src/lib/server/servicos/gastos';
import {
  definirLimiteMes,
  definirLimitePadrao,
  limiteDoMes,
  listarLimites,
} from '../../src/lib/server/servicos/limite';
import {
  buscarLancamentos,
  evolucaoPatrimonioMensal,
  exportar,
  intervaloDeMeses,
  lancamentosNoPeriodo,
  MAX_MESES,
  relatorioCategorias,
} from '../../src/lib/server/servicos/relatorios';
import { filtroForm, limiteMesForm } from '../../src/lib/validacao/nucleo';
import { bancoEmMemoria } from './ajuda-banco';

let banco: Banco;
beforeEach(() => {
  banco = bancoEmMemoria();
});
afterEach(() => {
  banco.sqlite.close();
});

/** "Hoje" fixo dos testes: outubro de 2026. */
const AGORA = new Date('2026-10-15T12:00:00');

/** Cenário com gastos em vários meses, parcelas de cartão, saldos e lixeira. */
function montarCenario() {
  const mercado = criarCategoria(banco, { nome: 'Mercado', cor: null }).id;
  const lazer = criarCategoria(banco, { nome: 'Lazer', cor: null }).id;
  const saude = criarCategoria(banco, { nome: 'Saúde', cor: null }).id;
  const nubank = criarConta(
    banco,
    { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 100_000 },
    new Date('2026-03-01T12:00:00Z'),
  ).id;

  const gasto = (categoriaId: string, data: string, valorCentavos: number, contaId?: string) =>
    lancarGasto(
      banco,
      { valorCentavos, descricao: null, categoriaId, data, contaId: contaId ?? null },
      AGORA,
    );

  gasto(mercado, '2026-05-10', 10_000, nubank);
  gasto(mercado, '2026-06-10', 20_000, nubank);
  gasto(lazer, '2026-06-20', 5_000);
  gasto(mercado, '2026-08-03', 30_000, nubank);
  gasto(lazer, '2026-10-02', 15_000);
  const aRemover = gasto(saude, '2026-10-05', 2_000);
  removerGasto(banco, aRemover.id, AGORA);

  // Compra no cartão: 30.000 em 3 parcelas de 10.000 (agosto, setembro e outubro).
  const cartao = banco.db
    .insert(cartoes)
    .values({ nome: 'Visa', limiteCentavos: 500_000, diaFechamento: 3, diaVencimento: 10 })
    .returning()
    .get();
  const compra = banco.db
    .insert(compras)
    .values({
      descricao: 'TV',
      categoriaId: lazer,
      dataCompra: '2026-08-15',
      valorTotalCentavos: 30_000,
      meio: 'cartao',
      cartaoId: cartao.id,
      numParcelas: 3,
    })
    .returning()
    .get();
  for (const [numero, mes] of [
    [1, '2026-08'],
    [2, '2026-09'],
    [3, '2026-10'],
  ] as const) {
    banco.db
      .insert(parcelas)
      .values({ compraId: compra.id, numero, valorCentavos: 10_000, mesCompetencia: mes })
      .run();
  }
}

describe('intervaloDeMeses', () => {
  it('lista os meses inclusive', () => {
    expect(intervaloDeMeses('2026-01', '2026-03')).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(intervaloDeMeses('2026-03', '2026-03')).toEqual(['2026-03']);
  });

  it('recusa intervalo invertido ou longo demais', () => {
    expect(() => intervaloDeMeses('2026-03', '2026-01')).toThrow(ErroDeNegocio);
    expect(() => intervaloDeMeses('2016-01', '2026-01')).toThrow(ErroDeNegocio); // 121 meses
    expect(intervaloDeMeses('2016-02', '2026-01')).toHaveLength(MAX_MESES); // 120 meses
  });
});

describe('lancamentosNoPeriodo', () => {
  it('traz todos os meses, inclusive os sem gasto, e parcelas no mês de competência', () => {
    montarCenario();
    const porMes = lancamentosNoPeriodo(banco, '2026-06', '2026-10');
    expect(Object.keys(porMes)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(porMes['2026-07']).toEqual([]);
    expect(porMes['2026-09']!.map((l) => l.valorCentavos)).toEqual([10_000]);
    expect(porMes['2026-09']![0]!.meio).toBe('cartao');
    expect(porMes['2026-09']![0]!.parcela).toBe(2);
  });

  it('não traz gasto que está na lixeira', () => {
    montarCenario();
    const todos = Object.values(lancamentosNoPeriodo(banco, '2026-01', '2026-12')).flat();
    expect(todos.some((l) => l.categoriaNome === 'Saúde')).toBe(false);
  });

  it('cada mês sai igual a lancamentosDoMes (mesma ordem e campos)', () => {
    montarCenario();
    const porMes = lancamentosNoPeriodo(banco, '2025-11', '2027-02');
    for (const [mes, lista] of Object.entries(porMes)) {
      expect(lista).toEqual(lancamentosDoMes(banco, mes));
    }
  });
});

describe('buscarLancamentos', () => {
  it('período padrão são os últimos 12 meses até o mês atual', () => {
    montarCenario();
    const r = buscarLancamentos(banco, {}, AGORA);
    expect(r.lancamentos).toHaveLength(8);
    expect(r.totalCentavos).toBe(110_000);
    expect(r.truncado).toBe(false);
    // Mais recente primeiro.
    expect(r.lancamentos[0]!.data).toBe('2026-10-15');
  });

  it('filtra por texto ignorando maiúsculas', () => {
    montarCenario();
    const r = buscarLancamentos(banco, { texto: 'MERCADO' }, AGORA);
    expect(r.lancamentos).toHaveLength(3);
    expect(r.totalCentavos).toBe(60_000);
  });

  it('datas de dia definem os meses consultados e filtram os dias', () => {
    montarCenario();
    const r = buscarLancamentos(banco, { de: '2026-06-01', ate: '2026-06-30' }, AGORA);
    expect(r.lancamentos.map((l) => l.valorCentavos).sort((x, y) => x - y)).toEqual([
      5_000, 20_000,
    ]);
    expect(r.totalCentavos).toBe(25_000);
  });

  it('filtra por meio e por faixa de valor', () => {
    montarCenario();
    const cartao = buscarLancamentos(banco, { meio: 'cartao' }, AGORA);
    expect(cartao.lancamentos).toHaveLength(3);
    // Faixa de 10.000 a 20.000 (inclusive): 3 parcelas da TV, mercado 10.000 e 20.000, lazer 15.000.
    const faixa = buscarLancamentos(banco, { minCentavos: 10_000, maxCentavos: 20_000 }, AGORA);
    expect(faixa.lancamentos.map((l) => l.valorCentavos).sort((a, b) => a - b)).toEqual([
      10_000, 10_000, 10_000, 10_000, 15_000, 20_000,
    ]);
  });

  it('recusa período de datas invertido', () => {
    montarCenario();
    expect(() => buscarLancamentos(banco, { de: '2026-06-10', ate: '2026-03-01' }, AGORA)).toThrow(
      ErroDeNegocio,
    );
  });

  it('limita a 500 linhas e avisa que está truncado, mas soma tudo', () => {
    const categoria = criarCategoria(banco, { nome: 'Volume', cor: null }).id;
    for (let i = 0; i < 501; i++) {
      lancarGasto(
        banco,
        {
          valorCentavos: 100,
          descricao: null,
          categoriaId: categoria,
          data: '2026-10-01',
          contaId: null,
        },
        AGORA,
      );
    }
    const r = buscarLancamentos(banco, {}, AGORA);
    expect(r.lancamentos).toHaveLength(500);
    expect(r.truncado).toBe(true);
    expect(r.totalCentavos).toBe(501 * 100);
  });
});

describe('relatorioCategorias', () => {
  it('soma por categoria e mês, com média mensal e ordem por total', () => {
    montarCenario();
    const r = relatorioCategorias(banco, 6, AGORA);
    expect(r.meses).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(r.totaisPorMes).toEqual({
      '2026-05': 10_000,
      '2026-06': 25_000,
      '2026-07': 0,
      '2026-08': 40_000,
      '2026-09': 10_000,
      '2026-10': 25_000,
    });
    expect(r.totalCentavos).toBe(110_000);
    expect(r.linhas.map((l) => l.categoriaNome)).toEqual(['Mercado', 'Lazer']);
    const mercado = r.linhas[0]!;
    expect(mercado.totalCentavos).toBe(60_000);
    expect(mercado.mediaMensalCentavos).toBe(10_000);
    // Lazer: 50.000 em 6 meses = 8.333,33 por mês, arredondado ao centavo.
    expect(r.linhas[1]!.mediaMensalCentavos).toBe(8_333);
  });

  it('comparativo mostra variação e não calcula percentual sobre mês zerado', () => {
    montarCenario();
    const c = relatorioCategorias(banco, 6, AGORA).comparativo;
    expect(c[0]).toEqual({
      mes: '2026-05',
      totalCentavos: 10_000,
      variacaoCentavos: null,
      variacaoPercentual: null,
    });
    expect(c[1]!.variacaoCentavos).toBe(15_000);
    expect(c[1]!.variacaoPercentual).toBe(150);
    expect(c[2]!.variacaoPercentual).toBe(-100);
    // Agosto sobe a partir de julho zerado: sem percentual.
    expect(c[3]!.variacaoCentavos).toBe(40_000);
    expect(c[3]!.variacaoPercentual).toBeNull();
  });

  it('maiores gastos: top 10 por valor, empate pelo mais recente', () => {
    montarCenario();
    const m = relatorioCategorias(banco, 6, AGORA).maiores;
    expect(m).toHaveLength(8);
    expect(m.map((l) => l.valorCentavos)).toEqual([
      30_000, 20_000, 15_000, 10_000, 10_000, 10_000, 10_000, 5_000,
    ]);
    expect(m[3]!.data).toBe('2026-10-15');
  });

  it('valida a quantidade de meses', () => {
    expect(() => relatorioCategorias(banco, 0, AGORA)).toThrow(ErroDeNegocio);
    expect(() => relatorioCategorias(banco, 61, AGORA)).toThrow(ErroDeNegocio);
  });
});

describe('evolucaoPatrimonioMensal', () => {
  /**
   * Nubank: 100.000 em março, 150.000 a partir de 10/07. Poupança (criada em junho) com 50.000.
   * "Antiga" tem saldo mas está na lixeira e não conta. Bitcoin: 100.000 sats comprados em 10/04
   * por 500.000 o BTC, mais 50.000 sats em 01/08; 1.000.000 sats em maio foram removidos.
   * O preço vai a 600.000 o BTC em 30/09.
   */
  function cenarioPatrimonio() {
    const nubank = criarConta(
      banco,
      { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 100_000 },
      new Date('2026-03-01T12:00:00Z'),
    );
    atualizarSaldo(banco, nubank.id, 150_000, new Date('2026-07-10T12:00:00Z'));
    criarConta(
      banco,
      { nome: 'Poupança', tipo: 'poupanca', saldoCentavos: 50_000 },
      new Date('2026-06-01T12:00:00Z'),
    );
    const antiga = criarConta(
      banco,
      { nome: 'Antiga', tipo: 'corrente', saldoCentavos: 999_999 },
      new Date('2026-02-01T12:00:00Z'),
    );
    removerConta(banco, antiga.id, new Date('2026-04-01T12:00:00Z'));

    registrarMovimento(banco, { sats: 100_000, valorCentavos: 50_000, data: '2026-04-10' });
    const lixo = registrarMovimento(banco, {
      sats: 1_000_000,
      valorCentavos: 0,
      data: '2026-05-01',
    });
    removerMovimento(banco, lixo.id);
    registrarMovimento(banco, { sats: 50_000, valorCentavos: 0, data: '2026-08-01' });
    definirPrecoManual(banco, '2026-09-30', 60_000_000);
  }

  it('usa o último saldo até o fim do mês e o bitcoin pelo último preço', () => {
    cenarioPatrimonio();
    const pontos = evolucaoPatrimonioMensal(banco, 10, AGORA);
    expect(pontos.map((p) => p.mes)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(pontos.map((p) => p.totalCentavos)).toEqual([
      0, 0, 100_000, 150_000, 150_000, 200_000, 250_000, 275_000, 290_000, 290_000,
    ]);
    expect(pontos.slice(0, 2).every((p) => !p.temSaldo)).toBe(true);
    expect(pontos[2]!.temSaldo).toBe(true);
  });

  it('separa contas e bitcoin e reflete o saldo novo a partir do mês certo', () => {
    cenarioPatrimonio();
    const pontos = evolucaoPatrimonioMensal(banco, 10, AGORA);
    const jun = pontos.find((p) => p.mes === '2026-06')!;
    expect(jun.contasCentavos).toBe(150_000);
    expect(jun.bitcoinCentavos).toBe(50_000);
    const jul = pontos.find((p) => p.mes === '2026-07')!;
    expect(jul.contasCentavos).toBe(200_000);
    const set = pontos.find((p) => p.mes === '2026-09')!;
    // 150.000 sats a 600.000 o BTC valem 90.000.
    expect(set.bitcoinCentavos).toBe(90_000);
  });

  it('valida a quantidade de meses', () => {
    expect(() => evolucaoPatrimonioMensal(banco, 0, AGORA)).toThrow(ErroDeNegocio);
    expect(() => evolucaoPatrimonioMensal(banco, 121, AGORA)).toThrow(ErroDeNegocio);
  });
});

describe('exportar', () => {
  it('CSV com BOM, cabeçalho e as linhas do período', () => {
    montarCenario();
    const r = exportar(banco, { de: '2026-06', ate: '2026-06', formato: 'csv' });
    expect(r.nome).toBe('lancamentos-2026-06-a-2026-06.csv');
    expect(r.tipo).toMatch(/text\/csv/);
    expect(r.conteudo.startsWith('﻿')).toBe(true);
    const linhas = r.conteudo.slice(1).split('\r\n').filter(Boolean);
    expect(linhas).toHaveLength(3); // cabeçalho + 2 gastos
    expect(linhas[0]!.split(';')).toHaveLength(7);
    expect(r.conteudo).toContain('200,00');
  });

  it('JSON com os valores em centavos e em reais', () => {
    montarCenario();
    const r = exportar(banco, { de: '2026-08', ate: '2026-10', formato: 'json' });
    expect(r.nome).toBe('lancamentos-2026-08-a-2026-10.json');
    expect(r.tipo).toMatch(/application\/json/);
    const itens = JSON.parse(r.conteudo) as { valorCentavos: number; valor: string }[];
    // Ago: mercado 30.000 e TV 10.000; set: TV 10.000; out: lazer 15.000 e TV 10.000.
    expect(itens).toHaveLength(5);
    expect(itens.reduce((soma, i) => soma + i.valorCentavos, 0)).toBe(75_000);
    expect(itens[0]!.valor).toBe('300.00');
  });

  it('recusa formato desconhecido e período invertido', () => {
    expect(() =>
      exportar(banco, { de: '2026-06', ate: '2026-06', formato: 'xml' as 'csv' }),
    ).toThrow(ErroDeNegocio);
    expect(() => exportar(banco, { de: '2026-09', ate: '2026-06', formato: 'csv' })).toThrow(
      ErroDeNegocio,
    );
  });
});

describe('limite por mês', () => {
  it('mês com limite próprio ganha do padrão; zero volta ao padrão', () => {
    definirLimitePadrao(banco, 300_000);
    expect(limiteDoMes(banco, '2026-10')).toBe(300_000);

    definirLimiteMes(banco, '2026-10', 450_000);
    expect(limiteDoMes(banco, '2026-10')).toBe(450_000);
    expect(limiteDoMes(banco, '2026-11')).toBe(300_000);
    expect(listarLimites(banco)).toEqual({
      padrao: 300_000,
      porMes: [{ mes: '2026-10', valorCentavos: 450_000 }],
    });

    definirLimiteMes(banco, '2026-10', 0);
    expect(limiteDoMes(banco, '2026-10')).toBe(300_000);
    expect(listarLimites(banco).porMes).toEqual([]);
  });

  it('lista os meses do mais recente para o mais antigo, e sem padrão vira null', () => {
    definirLimiteMes(banco, '2026-01', 1_000);
    definirLimiteMes(banco, '2026-12', 2_000);
    expect(listarLimites(banco)).toEqual({
      padrao: null,
      porMes: [
        { mes: '2026-12', valorCentavos: 2_000 },
        { mes: '2026-01', valorCentavos: 1_000 },
      ],
    });
    expect(limiteDoMes(banco, '2026-06')).toBeNull();
  });

  it('recusa mês inválido e valor negativo', () => {
    expect(() => definirLimiteMes(banco, '2026/10', 1)).toThrow(ErroDeNegocio);
    expect(() => definirLimiteMes(banco, 'padrao', 1)).toThrow(ErroDeNegocio);
    expect(() => definirLimiteMes(banco, '2026-10', -1)).toThrow(ErroDeNegocio);
  });
});

describe('formulários de limite e filtro', () => {
  it('limiteMesForm converte reais em centavos; vazio vira zero', () => {
    const ok = limiteMesForm.safeParse({ mes: '2026-10', valor: '1.200,50' });
    expect(ok.success && ok.data).toEqual({ mes: '2026-10', valor: 120_050 });
    const zero = limiteMesForm.safeParse({ mes: '2026-10', valor: '' });
    expect(zero.success && zero.data.valor).toBe(0);
    expect(limiteMesForm.safeParse({ mes: '2026-13', valor: '1' }).success).toBe(false);
  });

  it('filtroForm lê o GET: texto aparado, faixa em centavos, vazios ausentes', () => {
    const r = filtroForm.safeParse({
      q: '  Mercado ',
      de: '2026-06-01',
      ate: '2026-06-30',
      min: '10,00',
      max: '1.000,00',
      meio: '',
      categoria: '',
      origem: '',
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.texto).toBe('Mercado');
    expect(r.data.de).toBe('2026-06-01');
    expect(r.data.minCentavos).toBe(1_000);
    expect(r.data.maxCentavos).toBe(100_000);
    expect(r.data.meio).toBeUndefined();
    expect(r.data.categoriaId).toBeUndefined();
  });

  it('filtroForm aponta o erro de cada campo inválido', () => {
    const campo = (entrada: Record<string, string>) => {
      const r = filtroForm.safeParse(entrada);
      return r.success ? null : r.error.issues[0]?.path[0];
    };
    expect(campo({ de: '2026-02-30' })).toBe('de');
    expect(campo({ min: 'abc' })).toBe('min');
    expect(campo({ meio: 'pix' })).toBe('meio');
    expect(campo({ de: '2026-06-10', ate: '2026-06-01' })).toBe('ate');
    expect(campo({ min: '500,00', max: '100,00' })).toBe('max');
  });
});

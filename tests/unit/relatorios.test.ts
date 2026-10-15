import { describe, expect, it } from 'vitest';
import {
  comparativoMensal,
  evolucaoPatrimonio,
  filtrarLancamentos,
  gastosPorCategoriaEmMeses,
  lancamentosParaCsv,
  lancamentosParaJson,
  maioresGastos,
  type RegistroSaldo,
} from '../../src/lib/dominio/relatorios';
import type { Lancamento } from '../../src/lib/dominio/lancamentos';

function lanc(extra: Partial<Lancamento> = {}): Lancamento {
  return {
    compraId: 'c1',
    data: '2026-01-10',
    dataCompra: '2026-01-10',
    valorCentavos: 1000,
    valorTotalCentavos: 1000,
    parcela: 1,
    numParcelas: 1,
    descricao: 'Mercado',
    categoriaId: 'cat-mercado',
    categoriaNome: 'Mercado',
    categoriaCor: '#2e7d32',
    meio: 'conta',
    contaNome: 'Corrente',
    contaRemovida: false,
    cartaoNome: null,
    criadoEm: '2026-01-10T10:00:00Z',
    ...extra,
  };
}

describe('filtrarLancamentos', () => {
  const base = [
    lanc({
      compraId: 'a',
      descricao: 'Café da manhã',
      categoriaNome: 'Alimentação',
      categoriaId: 'alim',
      data: '2026-01-05',
      valorCentavos: 1500,
      meio: 'cartao',
      contaNome: null,
      cartaoNome: 'Nubank Roxinho',
    }),
    lanc({
      compraId: 'b',
      descricao: 'Aluguel',
      categoriaNome: 'Moradia',
      categoriaId: 'mor',
      data: '2026-01-10',
      valorCentavos: 200000,
      contaNome: 'Corrente',
    }),
    lanc({
      compraId: 'c',
      descricao: 'Pão',
      categoriaNome: 'Alimentação',
      categoriaId: 'alim',
      data: '2026-01-31',
      valorCentavos: 1000,
      contaNome: 'Poupança',
    }),
  ];

  it('sem critérios devolve todos, em array novo', () => {
    const r = filtrarLancamentos(base, {});
    expect(r).toHaveLength(3);
    expect(r).not.toBe(base);
  });

  it('busca sem diferenciar acentos nem maiúsculas', () => {
    expect(filtrarLancamentos(base, { texto: 'cafe' }).map((x) => x.compraId)).toEqual(['a']);
    expect(filtrarLancamentos(base, { texto: 'CAFÉ' }).map((x) => x.compraId)).toEqual(['a']);
    expect(filtrarLancamentos(base, { texto: 'alimentacao' }).map((x) => x.compraId)).toEqual([
      'a',
      'c',
    ]);
    expect(filtrarLancamentos(base, { texto: 'Pão' }).map((x) => x.compraId)).toEqual(['c']);
    expect(filtrarLancamentos(base, { texto: 'pao' }).map((x) => x.compraId)).toEqual(['c']);
  });

  it('busca também em conta e cartão', () => {
    expect(filtrarLancamentos(base, { texto: 'NUBANK' }).map((x) => x.compraId)).toEqual(['a']);
    expect(filtrarLancamentos(base, { texto: 'poupanca' }).map((x) => x.compraId)).toEqual(['c']);
  });

  it('texto vazio ou só espaços não filtra', () => {
    expect(filtrarLancamentos(base, { texto: '' })).toHaveLength(3);
    expect(filtrarLancamentos(base, { texto: '   ' })).toHaveLength(3);
  });

  it('de e ate são inclusivos sobre a data', () => {
    expect(
      filtrarLancamentos(base, { de: '2026-01-10', ate: '2026-01-31' }).map((x) => x.compraId),
    ).toEqual(['b', 'c']);
    expect(
      filtrarLancamentos(base, { de: '2026-01-10', ate: '2026-01-10' }).map((x) => x.compraId),
    ).toEqual(['b']);
  });

  it('valor mínimo e máximo são inclusivos, em centavos', () => {
    expect(
      filtrarLancamentos(base, { minCentavos: 1000, maxCentavos: 1500 }).map((x) => x.compraId),
    ).toEqual(['a', 'c']);
    expect(filtrarLancamentos(base, { minCentavos: 200001 })).toEqual([]);
  });

  it('categoria, meio e origem batem exatamente', () => {
    expect(filtrarLancamentos(base, { categoriaId: 'alim' })).toHaveLength(2);
    expect(filtrarLancamentos(base, { meio: 'cartao' }).map((x) => x.compraId)).toEqual(['a']);
    expect(filtrarLancamentos(base, { origem: 'Corrente' }).map((x) => x.compraId)).toEqual(['b']);
    expect(filtrarLancamentos(base, { origem: 'Nubank' })).toEqual([]);
    expect(filtrarLancamentos(base, { origem: 'Nubank Roxinho' }).map((x) => x.compraId)).toEqual([
      'a',
    ]);
  });

  it('combina os critérios como E', () => {
    const r = filtrarLancamentos(base, { texto: 'alimentacao', de: '2026-01-06', meio: 'conta' });
    expect(r.map((x) => x.compraId)).toEqual(['c']);
  });

  it('rejeita data e valor inválidos em vez de filtrar em silêncio', () => {
    expect(() => filtrarLancamentos(base, { de: '2026-02-30' })).toThrow(RangeError);
    expect(() => filtrarLancamentos(base, { minCentavos: 10.5 })).toThrow(RangeError);
  });
});

describe('gastosPorCategoriaEmMeses', () => {
  const jan = [
    lanc({ compraId: 'a', categoriaId: 'mer', categoriaNome: 'Mercado', valorCentavos: 3000 }),
    lanc({
      compraId: 'b',
      categoriaId: 'laz',
      categoriaNome: 'Lazer',
      categoriaCor: null,
      valorCentavos: 500,
    }),
  ];
  const fev = [
    lanc({ compraId: 'c', categoriaId: 'mer', categoriaNome: 'Mercado', valorCentavos: 1000 }),
  ];

  it('soma por categoria e mês, ordena por total desc', () => {
    const r = gastosPorCategoriaEmMeses(['2026-01', '2026-02'], { '2026-01': jan, '2026-02': fev });
    expect(r.meses).toEqual(['2026-01', '2026-02']);
    expect(r.linhas.map((l) => l.categoriaNome)).toEqual(['Mercado', 'Lazer']);
    expect(r.linhas[0]).toMatchObject({
      porMes: { '2026-01': 3000, '2026-02': 1000 },
      totalCentavos: 4000,
    });
    expect(r.linhas[1]).toMatchObject({
      categoriaCor: null,
      porMes: { '2026-01': 500, '2026-02': 0 },
    });
    expect(r.totaisPorMes).toEqual({ '2026-01': 3500, '2026-02': 1000 });
    expect(r.totalCentavos).toBe(4500);
  });

  it('média conta os meses sem gasto no divisor', () => {
    // 1.000 centavos em 3 meses: 333,33 -> 333
    const r = gastosPorCategoriaEmMeses(['2026-01', '2026-02', '2026-03'], {
      '2026-01': [lanc({ valorCentavos: 1000 })],
    });
    expect(r.linhas[0]!.mediaMensalCentavos).toBe(333);
    expect(r.linhas[0]!.porMes).toEqual({ '2026-01': 1000, '2026-02': 0, '2026-03': 0 });
  });

  it('média arredonda meio para cima ao centavo', () => {
    const quatro = ['2026-01', '2026-02', '2026-03', '2026-04'];
    // 6 / 4 = 1,5 -> 2; 2 / 4 = 0,5 -> 1
    const a = gastosPorCategoriaEmMeses(quatro, { '2026-01': [lanc({ valorCentavos: 6 })] });
    const b = gastosPorCategoriaEmMeses(quatro, { '2026-01': [lanc({ valorCentavos: 2 })] });
    expect(a.linhas[0]!.mediaMensalCentavos).toBe(2);
    expect(b.linhas[0]!.mediaMensalCentavos).toBe(1);
  });

  it('mês ausente em porMes conta como sem gasto', () => {
    const r = gastosPorCategoriaEmMeses(['2026-01', '2026-02'], { '2026-01': jan });
    expect(r.totaisPorMes['2026-02']).toBe(0);
    expect(r.linhas.every((l) => l.porMes['2026-02'] === 0)).toBe(true);
  });

  it('sem meses devolve tudo zerado e sem linhas', () => {
    const r = gastosPorCategoriaEmMeses([], {});
    expect(r).toEqual({ meses: [], linhas: [], totaisPorMes: {}, totalCentavos: 0 });
  });

  it('rejeita mês em formato errado', () => {
    expect(() => gastosPorCategoriaEmMeses(['2026/01'], {})).toThrow(RangeError);
  });
});

describe('comparativoMensal', () => {
  it('primeiro mês não tem variação; depois, variação em centavos e porcentagem', () => {
    const r = comparativoMensal(['2026-01', '2026-02', '2026-03'], {
      '2026-01': 3000,
      '2026-02': 4000,
      '2026-03': 3000,
    });
    expect(r[0]).toEqual({
      mes: '2026-01',
      totalCentavos: 3000,
      variacaoCentavos: null,
      variacaoPercentual: null,
    });
    // 1000 / 3000 = 33,33%
    expect(r[1]).toEqual({
      mes: '2026-02',
      totalCentavos: 4000,
      variacaoCentavos: 1000,
      variacaoPercentual: 33.33,
    });
    // -1000 / 4000 = -25%
    expect(r[2]!.variacaoCentavos).toBe(-1000);
    expect(r[2]!.variacaoPercentual).toBe(-25);
  });

  it('mês anterior zero: porcentagem null, variação em centavos preservada', () => {
    const r = comparativoMensal(['2026-01', '2026-02'], { '2026-02': 500 });
    expect(r[1]).toEqual({
      mes: '2026-02',
      totalCentavos: 500,
      variacaoCentavos: 500,
      variacaoPercentual: null,
    });
  });

  it('dois meses zerados: variação zero, sem porcentagem', () => {
    const r = comparativoMensal(['2026-01', '2026-02'], {});
    expect(r[1]).toEqual({
      mes: '2026-02',
      totalCentavos: 0,
      variacaoCentavos: 0,
      variacaoPercentual: null,
    });
  });

  it('sem meses devolve lista vazia', () => {
    expect(comparativoMensal([], {})).toEqual([]);
  });
});

describe('maioresGastos', () => {
  const l = [
    lanc({ compraId: 'x', valorCentavos: 500, data: '2026-01-01' }),
    lanc({ compraId: 'y', valorCentavos: 9000, data: '2026-01-02' }),
    lanc({ compraId: 'z', valorCentavos: 9000, data: '2026-03-01' }),
    lanc({ compraId: 'w', valorCentavos: 100, data: '2026-02-01' }),
  ];

  it('ordena por valor e desempata pela data mais recente', () => {
    expect(maioresGastos(l, 3).map((x) => x.compraId)).toEqual(['z', 'y', 'x']);
  });

  it('n maior que a lista devolve tudo; n zero devolve vazio', () => {
    expect(maioresGastos(l, 99)).toHaveLength(4);
    expect(maioresGastos(l, 0)).toEqual([]);
  });

  it('não altera a entrada e rejeita n inválido', () => {
    const antes = l.map((x) => x.compraId).join();
    maioresGastos(l, 2);
    expect(l.map((x) => x.compraId).join()).toBe(antes);
    expect(() => maioresGastos(l, -1)).toThrow(RangeError);
    expect(() => maioresGastos(l, 1.5)).toThrow(RangeError);
  });
});

describe('evolucaoPatrimonio', () => {
  const saldos: RegistroSaldo[] = [
    { contaId: 'a', saldoCentavos: 10000, registradoEm: '2026-01-15T12:00:00Z' },
    { contaId: 'a', saldoCentavos: 20000, registradoEm: '2026-02-20T09:00:00.000Z' },
    { contaId: 'b', saldoCentavos: 5000, registradoEm: '2026-01-31T23:59:00Z' },
    { contaId: 'c', saldoCentavos: 999, registradoEm: '2026-02-01T00:00:00Z' },
  ];

  it('mês antes de qualquer saldo: contas 0 e temSaldo falso', () => {
    const [p] = evolucaoPatrimonio(['2025-12'], saldos, [], []);
    expect(p).toEqual({
      mes: '2025-12',
      contasCentavos: 0,
      bitcoinCentavos: 0,
      totalCentavos: 0,
      temSaldo: false,
    });
  });

  it('cada conta vale o último saldo até o fim do mês', () => {
    const [jan, fev] = evolucaoPatrimonio(['2026-01', '2026-02'], saldos, [], []);
    // Janeiro: a = 10.000; b = 5.000 (registrado no último minuto do mês). c ainda não existe.
    expect(jan).toMatchObject({ contasCentavos: 15000, totalCentavos: 15000, temSaldo: true });
    // Fevereiro: a = 20.000 (substituiu o de janeiro); b = 5.000; c = 999 (registrado em 1º/fev).
    expect(fev).toMatchObject({ contasCentavos: 25999, totalCentavos: 25999, temSaldo: true });
  });

  it('saldo registrado depois do fim do mês não entra', () => {
    const [jan] = evolucaoPatrimonio(['2026-01'], [saldos[3]!], [], []);
    expect(jan!.temSaldo).toBe(false);
    expect(jan!.contasCentavos).toBe(0);
  });

  it('bitcoin: sats até o fim do mês vezes o último preço até o fim do mês', () => {
    const movs = [
      { sats: 100_000_000, data: '2026-01-10' },
      { sats: 50_000_000, data: '2026-03-01' }, // depois de fevereiro: não entra em fevereiro
    ];
    const precos = [
      { data: '2026-01-05', precoCentavos: 30_000_000 },
      { data: '2026-02-03', precoCentavos: 40_000_000 },
    ];
    const r = evolucaoPatrimonio(['2025-12', '2026-01', '2026-02'], [], movs, precos);
    expect(r.map((p) => p.bitcoinCentavos)).toEqual([0, 30_000_000, 40_000_000]);
    expect(r.map((p) => p.temSaldo)).toEqual([false, false, false]);
  });

  it('bitcoin sem preço conhecido vale 0, mas os sats já contam quando o preço aparece', () => {
    const movs = [{ sats: 100_000_000, data: '2026-01-10' }];
    const r = evolucaoPatrimonio(['2026-01', '2026-02'], [], movs, [
      { data: '2026-02-15', precoCentavos: 30_000_000 },
    ]);
    expect(r[0]!.bitcoinCentavos).toBe(0);
    expect(r[1]!.bitcoinCentavos).toBe(30_000_000);
  });

  it('bitcoin arredonda meio para cima uma única vez', () => {
    // 0,5 BTC a R$ 3.000,01/BTC = 150.000,5 centavos -> 150.001
    const r = evolucaoPatrimonio(
      ['2026-01'],
      [],
      [{ sats: 50_000_000, data: '2026-01-02' }],
      [{ data: '2026-01-01', precoCentavos: 300_001 }],
    );
    expect(r[0]!.bitcoinCentavos).toBe(150_001);
  });

  it('total é contas mais bitcoin, sem perder centavos', () => {
    const r = evolucaoPatrimonio(
      ['2026-01'],
      saldos.slice(0, 1),
      [{ sats: 1, data: '2026-01-01' }],
      [{ data: '2026-01-01', precoCentavos: 1 }],
    );
    // 1 sat a R$ 0,01/BTC vale 0,0000001 centavo -> 0
    expect(r[0]).toMatchObject({ contasCentavos: 10000, bitcoinCentavos: 0, totalCentavos: 10000 });
  });

  it('devolve um ponto por mês, na ordem pedida', () => {
    const r = evolucaoPatrimonio(['2026-03', '2026-01'], [], [], []);
    expect(r.map((p) => p.mes)).toEqual(['2026-03', '2026-01']);
  });
});

describe('lancamentosParaCsv', () => {
  it('cabeçalho, separador ;, vírgula decimal e quebra \\r\\n, sem BOM', () => {
    const csv = lancamentosParaCsv([
      lanc({
        data: '2026-01-10',
        descricao: 'Mercado',
        valorCentavos: 4290,
        parcela: 2,
        numParcelas: 3,
      }),
      lanc({
        data: '2026-01-11',
        descricao: 'Café',
        valorCentavos: 5,
        meio: 'cartao',
        contaNome: null,
        cartaoNome: 'Nubank',
      }),
    ]);
    expect(csv).toBe(
      'Data;Descrição;Categoria;Valor;Parcela;Meio;Conta/Cartão\r\n' +
        '2026-01-10;Mercado;Mercado;42,90;2/3;Conta;Corrente\r\n' +
        '2026-01-11;Café;Mercado;0,05;1/1;Cartão;Nubank\r\n',
    );
    expect(csv.startsWith('﻿')).toBe(false);
  });

  it('lista vazia devolve só o cabeçalho', () => {
    expect(lancamentosParaCsv([])).toBe(
      'Data;Descrição;Categoria;Valor;Parcela;Meio;Conta/Cartão\r\n',
    );
  });

  it('valor negativo sai como número, sem apóstrofo', () => {
    const csv = lancamentosParaCsv([lanc({ valorCentavos: -340 })]);
    expect(csv).toContain(';-3,40;');
  });

  it('escapa ponto e vírgula, aspas e quebra de linha', () => {
    const csv = lancamentosParaCsv([lanc({ descricao: 'Pão; "integral"\nx' })]);
    expect(csv).toContain('"Pão; ""integral""\nx"');
  });

  it('protege contra injeção de fórmula em = + - @ e tab', () => {
    const casos: [string, string][] = [
      ['=1+1', "'=1+1"],
      ['+55 11', "'+55 11"],
      ['-teste', "'-teste"],
      ['@SUM(A1)', "'@SUM(A1)"],
      ['\t=2', "'\t=2"],
      ['Pão =x', 'Pão =x'], // fórmula só conta no início da célula
    ];
    for (const [entrada, esperado] of casos) {
      const csv = lancamentosParaCsv([lanc({ descricao: entrada })]);
      expect(csv.split('\r\n')[1]!.startsWith(`2026-01-10;${esperado};Mercado;`)).toBe(true);
    }
  });

  it('fórmula com aspas sai entre aspas, com o apóstrofo na frente', () => {
    const csv = lancamentosParaCsv([lanc({ descricao: '=HYPERLINK("http://x","clique")' })]);
    expect(
      csv.split('\r\n')[1]!.startsWith('2026-01-10;"\'=HYPERLINK(""http://x"",""clique"")";'),
    ).toBe(true);
  });

  it('descrição e conta nulas viram célula vazia', () => {
    const csv = lancamentosParaCsv([
      lanc({ descricao: null, contaNome: null, cartaoNome: null, meio: 'cartao' }),
    ]);
    expect(csv.split('\r\n')[1]).toBe('2026-01-10;;Mercado;10,00;1/1;Cartão;');
  });
});

describe('lancamentosParaJson', () => {
  it('JSON indentado com valor em centavos e em texto com ponto', () => {
    const json = lancamentosParaJson([
      lanc({
        data: '2026-01-10',
        descricao: 'Mercado',
        valorCentavos: 4290,
        parcela: 2,
        numParcelas: 3,
      }),
      lanc({
        data: '2026-01-11',
        descricao: null,
        valorCentavos: 5,
        meio: 'cartao',
        contaNome: null,
        cartaoNome: 'Nubank',
      }),
    ]);
    expect(json).toBe(
      [
        '[',
        '  {',
        '    "data": "2026-01-10",',
        '    "descricao": "Mercado",',
        '    "categoria": "Mercado",',
        '    "valorCentavos": 4290,',
        '    "valor": "42.90",',
        '    "parcela": 2,',
        '    "numParcelas": 3,',
        '    "meio": "conta",',
        '    "origem": "Corrente"',
        '  },',
        '  {',
        '    "data": "2026-01-11",',
        '    "descricao": null,',
        '    "categoria": "Mercado",',
        '    "valorCentavos": 5,',
        '    "valor": "0.05",',
        '    "parcela": 1,',
        '    "numParcelas": 1,',
        '    "meio": "cartao",',
        '    "origem": "Nubank"',
        '  }',
        ']',
      ].join('\n'),
    );
  });

  it('valor negativo e lista vazia', () => {
    expect(JSON.parse(lancamentosParaJson([lanc({ valorCentavos: -340 })]))[0].valor).toBe('-3.40');
    expect(lancamentosParaJson([])).toBe('[]');
  });

  it('rejeita valor que não é centavos inteiros', () => {
    expect(() => lancamentosParaJson([lanc({ valorCentavos: 42.9 })])).toThrow(RangeError);
  });
});

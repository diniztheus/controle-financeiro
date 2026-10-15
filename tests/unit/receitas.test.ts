import { describe, expect, it } from 'vitest';
import {
  agruparReceitasPorDia,
  CATEGORIAS_RECEITA,
  ehCategoriaReceita,
  fluxoMensal,
  porCategoriaReceita,
  type ReceitaDoMes,
  resumoFluxo,
} from '../../src/lib/dominio/receitas';

function receita(extra: Partial<ReceitaDoMes> = {}): ReceitaDoMes {
  return {
    id: 'r1',
    data: '2019-03-10',
    descricao: 'Salário de março',
    categoria: 'Salário',
    valorCentavos: 500000,
    contaNome: null,
    contaRemovida: false,
    ...extra,
  };
}

describe('categorias de receita', () => {
  it('aceita só as categorias da lista', () => {
    for (const c of CATEGORIAS_RECEITA) expect(ehCategoriaReceita(c)).toBe(true);
    expect(ehCategoriaReceita('Mercado')).toBe(false);
    expect(ehCategoriaReceita('salário')).toBe(false);
    expect(ehCategoriaReceita(null)).toBe(false);
    expect(ehCategoriaReceita(undefined)).toBe(false);
  });
});

describe('agruparReceitasPorDia', () => {
  it('agrupa por dia, do mais recente ao mais antigo, com total por dia', () => {
    const dias = agruparReceitasPorDia([
      receita({ id: 'a', data: '2019-03-05', valorCentavos: 100 }),
      receita({ id: 'b', data: '2019-03-20', valorCentavos: 250 }),
      receita({ id: 'c', data: '2019-03-20', valorCentavos: 50 }),
    ]);
    expect(dias.map((d) => d.data)).toEqual(['2019-03-20', '2019-03-05']);
    expect(dias[0]?.totalCentavos).toBe(300);
    expect(dias[0]?.itens.map((i) => i.id)).toEqual(['b', 'c']);
    expect(dias[1]?.totalCentavos).toBe(100);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(agruparReceitasPorDia([])).toEqual([]);
  });
});

describe('porCategoriaReceita', () => {
  it('soma por categoria, ordena pelo maior e calcula percentual com 1 casa', () => {
    const fatias = porCategoriaReceita([
      receita({ id: 'a', categoria: 'Freelance', valorCentavos: 100 }),
      receita({ id: 'b', categoria: 'Salário', valorCentavos: 200 }),
      receita({ id: 'c', categoria: 'Salário', valorCentavos: 100 }),
    ]);
    expect(fatias).toEqual([
      { categoria: 'Salário', totalCentavos: 300, percentual: 75 },
      { categoria: 'Freelance', totalCentavos: 100, percentual: 25 },
    ]);
  });

  it('arredonda o percentual meio para cima com 1 casa', () => {
    const fatias = porCategoriaReceita([
      receita({ id: 'a', categoria: 'Salário', valorCentavos: 1 }),
      receita({ id: 'b', categoria: 'Outros', valorCentavos: 2 }),
    ]);
    // 1/3 = 33,33... -> 33,3 ; 2/3 = 66,66... -> 66,7
    expect(fatias.find((f) => f.categoria === 'Salário')?.percentual).toBe(33.3);
    expect(fatias.find((f) => f.categoria === 'Outros')?.percentual).toBe(66.7);
  });

  it('desempata por nome e devolve lista vazia sem receitas', () => {
    const fatias = porCategoriaReceita([
      receita({ id: 'a', categoria: 'Presente', valorCentavos: 100 }),
      receita({ id: 'b', categoria: 'Outros', valorCentavos: 100 }),
    ]);
    expect(fatias.map((f) => f.categoria)).toEqual(['Outros', 'Presente']);
    expect(porCategoriaReceita([])).toEqual([]);
  });
});

describe('resumoFluxo', () => {
  it('calcula saldo e taxa de poupança com 1 casa', () => {
    expect(resumoFluxo(300000, 210000)).toEqual({
      entradasCentavos: 300000,
      saidasCentavos: 210000,
      saldoCentavos: 90000,
      taxaPoupancaPercentual: 30,
    });
    // 1/3 de 100 -> 33,3
    expect(resumoFluxo(300, 200).taxaPoupancaPercentual).toBe(33.3);
    // 2/3 -> 66,7
    expect(resumoFluxo(300, 100).taxaPoupancaPercentual).toBe(66.7);
  });

  it('saldo negativo e taxa negativa quando gasta mais do que entra', () => {
    const r = resumoFluxo(100000, 150000);
    expect(r.saldoCentavos).toBe(-50000);
    expect(r.taxaPoupancaPercentual).toBe(-50);
  });

  it('sem entradas a taxa é null, mesmo com saídas', () => {
    expect(resumoFluxo(0, 0).taxaPoupancaPercentual).toBeNull();
    const r = resumoFluxo(0, 4000);
    expect(r.saldoCentavos).toBe(-4000);
    expect(r.taxaPoupancaPercentual).toBeNull();
  });

  it('rejeita valores que não são centavos inteiros', () => {
    expect(() => resumoFluxo(10.5, 0)).toThrow(RangeError);
    expect(() => resumoFluxo(0, Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });
});

describe('fluxoMensal', () => {
  it('usa 0 para mês ausente e mantém a ordem dos meses pedidos', () => {
    const fluxo = fluxoMensal(
      ['2019-02', '2019-03', '2019-01'],
      { '2019-03': 100000 },
      { '2019-02': 4000, '2019-03': 25000 },
    );
    expect(fluxo.map((f) => f.mes)).toEqual(['2019-02', '2019-03', '2019-01']);
    expect(fluxo[0]).toEqual({
      mes: '2019-02',
      entradasCentavos: 0,
      saidasCentavos: 4000,
      saldoCentavos: -4000,
      taxaPoupancaPercentual: null,
    });
    expect(fluxo[1]?.saldoCentavos).toBe(75000);
    expect(fluxo[1]?.taxaPoupancaPercentual).toBe(75);
    expect(fluxo[2]).toMatchObject({ mes: '2019-01', entradasCentavos: 0, saidasCentavos: 0 });
  });

  it('lista vazia de meses devolve lista vazia', () => {
    expect(fluxoMensal([], {}, {})).toEqual([]);
  });

  it('rejeita mês inválido', () => {
    expect(() => fluxoMensal(['2019-13'], {}, {})).toThrow(RangeError);
  });
});

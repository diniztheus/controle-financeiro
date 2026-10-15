import { describe, expect, it } from 'vitest';
import {
  capitalizar,
  comparar,
  criarDia,
  criarMes,
  diaNoMes,
  diasNoMes,
  diferencaMeses,
  ehBissexto,
  ehDia,
  ehMes,
  formatarDia,
  hoje,
  mesAtual,
  mesDe,
  mesesEntre,
  nomeMes,
  nomeMesCurto,
  primeiroDiaDoMes,
  somarDias,
  somarMeses,
  somarMesesData,
  ultimoDiaDoMes,
} from '../../src/lib/dominio/datas';

describe('validação', () => {
  it.each(['2026-01', '2026-12', '1999-07', '0001-01'])('mês válido %s', (m) => {
    expect(ehMes(m)).toBe(true);
  });
  it.each(['2026-13', '2026-00', '2026-1', '26-01', '2026/01', '2026-01-01', '', 202601, null])(
    'mês inválido %j',
    (m) => {
      expect(ehMes(m)).toBe(false);
    },
  );
  it.each(['2026-01-31', '2028-02-29', '2000-02-29', '2026-04-30'])('dia válido %s', (d) => {
    expect(ehDia(d)).toBe(true);
  });
  it.each([
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '2026-01-32',
    '2026-1-1',
    '15/10/2026',
    '',
    undefined,
  ])('dia inválido %j', (d) => {
    expect(ehDia(d)).toBe(false);
  });

  it('bissexto', () => {
    expect(ehBissexto(2024)).toBe(true);
    expect(ehBissexto(2026)).toBe(false);
    expect(ehBissexto(1900)).toBe(false);
    expect(ehBissexto(2000)).toBe(true);
  });

  it('criarMes / criarDia', () => {
    expect(criarMes(2026, 3)).toBe('2026-03');
    expect(criarDia(2026, 3, 9)).toBe('2026-03-09');
    expect(() => criarMes(2026, 13)).toThrow(RangeError);
    expect(() => criarDia(2026, 2, 29)).toThrow(RangeError);
  });
});

describe('mês', () => {
  it('dias no mês e último dia', () => {
    expect(diasNoMes('2026-01')).toBe(31);
    expect(diasNoMes('2026-02')).toBe(28);
    expect(diasNoMes('2028-02')).toBe(29);
    expect(diasNoMes('2026-04')).toBe(30);
    expect(ultimoDiaDoMes('2026-02')).toBe('2026-02-28');
    expect(ultimoDiaDoMes('2028-02')).toBe('2028-02-29');
    expect(ultimoDiaDoMes('2026-12')).toBe('2026-12-31');
    expect(primeiroDiaDoMes('2026-12')).toBe('2026-12-01');
  });

  it('mesDe', () => {
    expect(mesDe('2026-10-15')).toBe('2026-10');
    expect(() => mesDe('2026-02-30')).toThrow(RangeError);
  });

  it('somarMeses atravessa a virada de ano nos dois sentidos', () => {
    expect(somarMeses('2026-10', 0)).toBe('2026-10');
    expect(somarMeses('2026-10', 1)).toBe('2026-11');
    expect(somarMeses('2026-11', 3)).toBe('2027-02');
    expect(somarMeses('2026-12', 1)).toBe('2027-01');
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
    expect(somarMeses('2026-03', -15)).toBe('2024-12');
    expect(somarMeses('2026-01', 24)).toBe('2028-01');
    expect(somarMeses('2026-06', 23)).toBe('2028-05');
    expect(() => somarMeses('2026-01', 1.5)).toThrow(RangeError);
  });

  it('somarMeses e diferencaMeses são inversos', () => {
    for (let n = -40; n <= 40; n++) {
      expect(diferencaMeses('2026-07', somarMeses('2026-07', n))).toBe(n);
    }
  });

  it('mesesEntre', () => {
    expect(mesesEntre('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(mesesEntre('2026-05', '2026-05')).toEqual(['2026-05']);
    expect(mesesEntre('2026-05', '2026-04')).toEqual([]);
  });

  it('diaNoMes limita ao último dia (fechamento dia 31 em fevereiro)', () => {
    expect(diaNoMes('2026-02', 31)).toBe('2026-02-28');
    expect(diaNoMes('2028-02', 30)).toBe('2028-02-29');
    expect(diaNoMes('2026-04', 31)).toBe('2026-04-30');
    expect(diaNoMes('2026-03', 5)).toBe('2026-03-05');
    expect(() => diaNoMes('2026-03', 0)).toThrow(RangeError);
    expect(() => diaNoMes('2026-03', 32)).toThrow(RangeError);
  });
});

describe('dia', () => {
  it('somarMesesData com clamp de dia', () => {
    expect(somarMesesData('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMesesData('2028-01-31', 1)).toBe('2028-02-29');
    expect(somarMesesData('2026-03-31', -1)).toBe('2026-02-28');
    expect(somarMesesData('2026-05-31', 1)).toBe('2026-06-30');
    expect(somarMesesData('2026-12-15', 2)).toBe('2027-02-15');
    // o clamp não "contamina" o mês seguinte: parte sempre da data original
    expect(somarMesesData('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('somarDias atravessa meses, anos e bissextos', () => {
    expect(somarDias('2026-02-28', 1)).toBe('2026-03-01');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
    expect(somarDias('2026-10-15', 0)).toBe('2026-10-15');
    expect(somarDias('2026-10-15', 365)).toBe('2027-10-15');
    // mudança de horário de verão não afeta (aritmética em UTC)
    expect(somarDias('2018-11-03', 1)).toBe('2018-11-04');
  });

  it('comparar funciona para dias e meses', () => {
    expect(comparar('2026-01-31', '2026-02-01')).toBe(-1);
    expect(comparar('2026-12', '2026-02')).toBe(1);
    expect(comparar('2026-02', '2026-02')).toBe(0);
  });

  it('hoje e mesAtual usam o horário local', () => {
    const d = new Date(2026, 9, 5, 23, 59);
    expect(hoje(d)).toBe('2026-10-05');
    expect(mesAtual(d)).toBe('2026-10');
    expect(ehDia(hoje())).toBe(true);
  });
});

describe('nomes', () => {
  it('nomeMes e nomeMesCurto em português', () => {
    expect(nomeMes('2026-10')).toBe('outubro de 2026');
    expect(nomeMes('2026-03')).toBe('março de 2026');
    expect(capitalizar(nomeMes('2026-01'))).toBe('Janeiro de 2026');
    expect(nomeMesCurto('2026-02')).toBe('fev');
    expect(nomeMesCurto('2026-03')).toBe('mar');
  });

  it('formatarDia', () => {
    expect(formatarDia('2026-10-05')).toBe('05/10/2026');
    expect(() => formatarDia('2026-10-32')).toThrow(RangeError);
  });
});

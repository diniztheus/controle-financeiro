import { describe, expect, it } from 'vitest';
import {
  centavosParaCampo,
  dividirEmParcelas,
  ehCentavos,
  exigirValor,
  formatarBRL,
  formatarNumero,
  LIMITE_CENTAVOS,
  MAX_PARCELAS,
  parseValor,
  separarValor,
  somar,
} from '../../src/lib/dominio/dinheiro';

describe('parseValor', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12,50', 1250],
    ['12,05', 1205],
    ['0,01', 1],
    [',5', 50],
    ['0', 0],
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1.234.567,89', 123456789],
    ['1.234', 123400],
    ['12.345.678', 1234567800],
    ['R$ 1.234,56', 123456],
    ['R$1.234,56', 123456],
    ['r$ 10', 1000],
    ['  7,9  ', 790],
    ['1 234,56', 123456],
    ['-3,40', -340],
    ['−3,40', -340],
    ['-R$ 3,40', -340],
    ['R$ -3,40', -340],
    ['+7', 700],
    ['-0,00', 0],
    ['007,10', 710],
    // compatibilidade com o app atual: ponto decimal quando não há vírgula e não é milhar
    ['12.5', 1250],
    ['12.50', 1250],
    ['0.99', 99],
  ])('%j → %i centavos', (texto, esperado) => {
    expect(parseValor(texto)).toBe(esperado);
  });

  it.each([
    '',
    '   ',
    'abc',
    '12a',
    'R$',
    '-',
    '1,234',
    '1,2,3',
    '12,',
    '1.23,00',
    '1.2345,00',
    '12.345.67',
    '1..234',
    '12.3456',
    '3-',
    '--3',
    '- -3',
    'R$ R$ 3',
    '1e3',
    'Infinity',
    'NaN',
    '0x10',
    '99999999999999999,99',
  ])('rejeita %j', (texto) => {
    expect(parseValor(texto)).toBeNull();
  });

  it('rejeita null e undefined', () => {
    expect(parseValor(null)).toBeNull();
    expect(parseValor(undefined)).toBeNull();
  });

  it('nunca devolve -0', () => {
    expect(Object.is(parseValor('-0'), 0)).toBe(true);
  });

  it('não sofre com ponto flutuante (0,1 + 0,2 vira 30 centavos exatos)', () => {
    expect(somar([parseValor('0,1')!, parseValor('0,2')!])).toBe(30);
    expect(parseValor('1.005,35')).toBe(100535);
    expect(parseValor('4,35')).toBe(435);
    expect(parseValor('1,15')).toBe(115);
  });

  it('aceita valores grandes até o limite', () => {
    expect(parseValor('90.000.000.000.000,00')).toBe(LIMITE_CENTAVOS);
    expect(parseValor('90.000.000.000.000,01')).toBeNull();
  });

  it('exigirValor lança erro em português', () => {
    expect(exigirValor('10')).toBe(1000);
    expect(() => exigirValor('dez')).toThrow(/Valor inválido/);
  });
});

describe('formatação', () => {
  it.each([
    [0, 'R$ 0,00'],
    [1, 'R$ 0,01'],
    [99, 'R$ 0,99'],
    [100, 'R$ 1,00'],
    [123456, 'R$ 1.234,56'],
    [100000000, 'R$ 1.000.000,00'],
    [-340, '−R$ 3,40'],
    [-123456789, '−R$ 1.234.567,89'],
  ])('formatarBRL(%i) = %j', (c, esperado) => {
    expect(formatarBRL(c)).toBe(esperado);
  });

  it('formatarNumero sem símbolo', () => {
    expect(formatarNumero(123456)).toBe('1.234,56');
    expect(formatarNumero(-5)).toBe('−0,05');
  });

  it('separarValor dá as partes do razão alinhado na vírgula', () => {
    expect(separarValor(123456)).toEqual({ sinal: '', inteiro: '1.234', centavos: '56' });
    expect(separarValor(-7)).toEqual({ sinal: '−', inteiro: '0', centavos: '07' });
    expect(separarValor(1000)).toEqual({ sinal: '', inteiro: '10', centavos: '00' });
  });

  it('centavosParaCampo faz ida e volta com parseValor', () => {
    for (const c of [0, 1, 50, 1234, 123456, -340, 999999999]) {
      const texto = centavosParaCampo(c);
      expect(parseValor(texto)).toBe(c);
    }
    expect(centavosParaCampo(123456)).toBe('1234,56');
    expect(centavosParaCampo(-340)).toBe('-3,40');
  });

  it('recusa valores que não são centavos inteiros', () => {
    expect(() => formatarBRL(1.5)).toThrow(RangeError);
    expect(() => formatarBRL(Number.NaN)).toThrow(RangeError);
    expect(ehCentavos(10)).toBe(true);
    expect(ehCentavos(10.1)).toBe(false);
    expect(ehCentavos('10')).toBe(false);
  });
});

describe('dividirEmParcelas', () => {
  it('resto na 1ª parcela', () => {
    expect(dividirEmParcelas(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(dividirEmParcelas(1000, 3)).toEqual([334, 333, 333]);
    expect(dividirEmParcelas(101, 2)).toEqual([51, 50]);
    expect(dividirEmParcelas(5, 24)).toEqual([5, ...Array(23).fill(0)]);
  });

  it('divisão exata', () => {
    expect(dividirEmParcelas(1200, 12)).toEqual(Array(12).fill(100));
  });

  it('à vista = 1 parcela', () => {
    expect(dividirEmParcelas(4990, 1)).toEqual([4990]);
  });

  it('soma das parcelas é sempre o total (varredura)', () => {
    for (let total = 0; total <= 2500; total += 7) {
      for (let n = 1; n <= MAX_PARCELAS; n++) {
        const ps = dividirEmParcelas(total, n);
        expect(ps).toHaveLength(n);
        expect(ps.reduce((a, b) => a + b, 0)).toBe(total);
        expect(ps.every((p) => Number.isInteger(p))).toBe(true);
        expect(ps[0]! - ps[n - 1]!).toBeLessThan(n);
        expect(new Set(ps.slice(1)).size).toBeLessThanOrEqual(1);
      }
    }
  });

  it('valores grandes continuam exatos', () => {
    const total = 8_999_999_999_999_999;
    const ps = dividirEmParcelas(total, 7);
    expect(ps.reduce((a, b) => a + b, 0)).toBe(total);
  });

  it('negativo (estorno) mantém o sinal em todas as parcelas', () => {
    const ps = dividirEmParcelas(-1000, 3);
    expect(ps).toEqual([-334, -333, -333]);
  });

  it.each([0, 25, -1, 1.5, Number.NaN])('rejeita %d parcelas', (n) => {
    expect(() => dividirEmParcelas(1000, n)).toThrow(RangeError);
  });

  it('rejeita total não inteiro', () => {
    expect(() => dividirEmParcelas(10.5, 2)).toThrow(RangeError);
  });
});

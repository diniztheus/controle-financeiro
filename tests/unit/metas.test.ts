import { describe, expect, it } from 'vitest';
import {
  calcularMeta,
  faltaMeta,
  mesesAtePrazo,
  metaConcluida,
  percentualMeta,
  porMes,
} from '../../src/lib/dominio/metas';

describe('percentual', () => {
  it('vai de 0 e pode passar de 100', () => {
    expect(percentualMeta(0, 10000)).toBe(0);
    expect(percentualMeta(5000, 10000)).toBe(50);
    expect(percentualMeta(15000, 10000)).toBe(150);
  });
  it('arredonda para baixo (33,3% vira 33, não 34)', () => {
    expect(percentualMeta(1, 3)).toBe(33);
    expect(percentualMeta(2, 3)).toBe(66);
  });
  it('não quebra com 0,29 (ponto flutuante)', () => {
    expect(percentualMeta(29, 100)).toBe(29);
  });
});

describe('falta e conclusão', () => {
  it('falta nunca é negativa', () => {
    expect(faltaMeta(30000, 100000)).toBe(70000);
    expect(faltaMeta(150000, 100000)).toBe(0);
  });
  it('concluída quando guardado chega ao alvo', () => {
    expect(metaConcluida(99999, 100000)).toBe(false);
    expect(metaConcluida(100000, 100000)).toBe(true);
    expect(metaConcluida(120000, 100000)).toBe(true);
  });
});

describe('meses até o prazo', () => {
  it('sem prazo é null', () => {
    expect(mesesAtePrazo(null, '2026-10-19')).toBeNull();
  });
  it('prazo no mesmo mês conta como 1 mês', () => {
    expect(mesesAtePrazo('2026-10-30', '2026-10-19')).toBe(1);
  });
  it('conta o mês atual e os seguintes', () => {
    // out/2026 até jul/2027: out, nov, dez, jan, fev, mar, abr, mai, jun, jul = 10
    expect(mesesAtePrazo('2027-07-15', '2026-10-19')).toBe(10);
  });
  it('prazo que já passou é null', () => {
    expect(mesesAtePrazo('2026-10-05', '2026-10-19')).toBeNull();
    expect(mesesAtePrazo('2025-12-31', '2026-10-19')).toBeNull();
  });
  it('prazo que é hoje ainda conta', () => {
    expect(mesesAtePrazo('2026-10-19', '2026-10-19')).toBe(1);
  });
});

describe('por mês (arredondado para cima)', () => {
  it('falta ÷ meses, para cima em centavos', () => {
    expect(porMes(100, 3)).toBe(34);
    expect(porMes(99, 3)).toBe(33);
    expect(porMes(0, 5)).toBe(0);
    expect(porMes(1, 10)).toBe(1);
  });
  it('recusa meses inválidos', () => {
    expect(() => porMes(100, 0)).toThrow(RangeError);
    expect(() => porMes(100, 1.5)).toThrow(RangeError);
  });
});

describe('calcularMeta', () => {
  it('viagem de R$ 3.000 até julho/2027, sem nada guardado', () => {
    const c = calcularMeta({ alvoCentavos: 300000, prazo: '2027-07-31' }, 0, '2026-10-19');
    expect(c).toMatchObject({
      guardadoCentavos: 0,
      percentual: 0,
      faltaCentavos: 300000,
      concluida: false,
      mesesAtePrazo: 10,
      prazoPassado: false,
      porMesCentavos: 30000,
    });
  });
  it('guardou mais que o alvo: concluída, falta zero, nada por mês', () => {
    const c = calcularMeta({ alvoCentavos: 100000, prazo: '2027-01-10' }, 120000, '2026-10-19');
    expect(c.concluida).toBe(true);
    expect(c.percentual).toBe(120);
    expect(c.faltaCentavos).toBe(0);
    expect(c.porMesCentavos).toBe(0);
  });
  it('prazo passado: sem valor mensal e marcado como passado', () => {
    const c = calcularMeta({ alvoCentavos: 100000, prazo: '2026-01-10' }, 1000, '2026-10-19');
    expect(c.prazoPassado).toBe(true);
    expect(c.porMesCentavos).toBeNull();
    expect(c.mesesAtePrazo).toBeNull();
  });
  it('sem prazo: sem valor mensal', () => {
    const c = calcularMeta({ alvoCentavos: 100000, prazo: null }, 1000, '2026-10-19');
    expect(c.prazoPassado).toBe(false);
    expect(c.porMesCentavos).toBeNull();
    expect(c.faltaCentavos).toBe(99000);
  });
  it('recusa guardado que não é centavos inteiros', () => {
    expect(() => calcularMeta({ alvoCentavos: 100000, prazo: null }, 10.5, '2026-10-19')).toThrow(
      RangeError,
    );
  });
});

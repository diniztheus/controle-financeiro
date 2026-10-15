import { describe, expect, it } from 'vitest';
import {
  MAX_OCORRENCIAS,
  datasDaRecorrencia,
  descreverRecorrencia,
  proximaOcorrencia,
  validarModelo,
  type ModeloRecorrencia,
} from '../../src/lib/dominio/recorrencias.ts';

const modelo = (over: Partial<ModeloRecorrencia> = {}): ModeloRecorrencia => ({
  diaDoMes: 5,
  inicio: '2026-01-01',
  fim: null,
  ...over,
});

describe('datasDaRecorrencia', () => {
  it('gera uma data por mês, em ordem, até a data limite', () => {
    expect(datasDaRecorrencia(modelo(), '2026-04-05')).toEqual([
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
      '2026-04-05',
    ]);
  });

  it('dia 31 cai no último dia dos meses curtos', () => {
    const r = datasDaRecorrencia(modelo({ diaDoMes: 31, inicio: '2025-01-01' }), '2025-06-30');
    expect(r).toEqual([
      '2025-01-31',
      '2025-02-28',
      '2025-03-31',
      '2025-04-30',
      '2025-05-31',
      '2025-06-30',
    ]);
  });

  it('dia 31 fevereiro bissexto cai em 29', () => {
    const r = datasDaRecorrencia(modelo({ diaDoMes: 31, inicio: '2024-02-01' }), '2024-03-31');
    expect(r).toEqual(['2024-02-29', '2024-03-31']);
  });

  it('dia 30 em fevereiro de ano não bissexto cai em 28', () => {
    expect(
      datasDaRecorrencia(modelo({ diaDoMes: 30, inicio: '2026-02-01' }), '2026-02-28'),
    ).toEqual(['2026-02-28']);
  });

  it('início no meio do mês descarta o mês de início se o dia já passou', () => {
    expect(datasDaRecorrencia(modelo({ inicio: '2026-03-20' }), '2026-04-30')).toEqual([
      '2026-04-05',
    ]);
  });

  it('início no meio do mês mantém o mês de início se o dia ainda não passou', () => {
    expect(datasDaRecorrencia(modelo({ inicio: '2026-03-02' }), '2026-03-31')).toEqual([
      '2026-03-05',
    ]);
  });

  it('início exatamente no dia gera nesse dia', () => {
    expect(datasDaRecorrencia(modelo({ inicio: '2026-03-05' }), '2026-03-05')).toEqual([
      '2026-03-05',
    ]);
  });

  it('fim no meio do período corta as datas', () => {
    expect(
      datasDaRecorrencia(modelo({ inicio: '2026-03-10', fim: '2026-06-30' }), '2030-01-01'),
    ).toEqual(['2026-04-05', '2026-05-05', '2026-06-05']);
  });

  it('fim com dia anterior ao dia pretendido exclui o último mês', () => {
    expect(
      datasDaRecorrencia(modelo({ inicio: '2026-03-10', fim: '2026-06-04' }), '2030-01-01'),
    ).toEqual(['2026-04-05', '2026-05-05']);
  });

  it('ate antes do início devolve lista vazia', () => {
    expect(datasDaRecorrencia(modelo({ inicio: '2026-03-10' }), '2026-02-28')).toEqual([]);
  });

  it('ate no mesmo mês do início, antes do dia, devolve lista vazia', () => {
    expect(datasDaRecorrencia(modelo({ inicio: '2026-03-10' }), '2026-03-09')).toEqual([]);
  });

  it('fim antes do início devolve lista vazia', () => {
    expect(
      datasDaRecorrencia(modelo({ inicio: '2026-03-10', fim: '2026-01-01' }), '2030-01-01'),
    ).toEqual([]);
  });

  it('aceita exatamente MAX_OCORRENCIAS datas', () => {
    const r = datasDaRecorrencia(modelo({ diaDoMes: 1, inicio: '2000-01-01' }), '2049-12-31');
    expect(r).toHaveLength(MAX_OCORRENCIAS);
    expect(r.at(-1)).toBe('2049-12-01');
  });

  it('lança RangeError ao passar de MAX_OCORRENCIAS', () => {
    expect(() =>
      datasDaRecorrencia(modelo({ diaDoMes: 1, inicio: '2000-01-01' }), '2050-01-01'),
    ).toThrow(RangeError);
  });

  it('lança RangeError para dia do mês fora de 1..31 ou não inteiro', () => {
    expect(() => datasDaRecorrencia(modelo({ diaDoMes: 0 }), '2026-12-31')).toThrow(RangeError);
    expect(() => datasDaRecorrencia(modelo({ diaDoMes: 32 }), '2026-12-31')).toThrow(RangeError);
    expect(() => datasDaRecorrencia(modelo({ diaDoMes: 5.5 }), '2026-12-31')).toThrow(RangeError);
  });

  it('lança RangeError para datas inválidas', () => {
    expect(() => datasDaRecorrencia(modelo({ inicio: '2026-02-30' }), '2026-12-31')).toThrow(
      RangeError,
    );
    expect(() => datasDaRecorrencia(modelo(), '31/12/2026')).toThrow(RangeError);
  });
});

describe('proximaOcorrencia', () => {
  it('devolve a próxima data estritamente depois de hoje', () => {
    expect(proximaOcorrencia(modelo(), '2026-04-04')).toBe('2026-04-05');
  });

  it('no próprio dia da ocorrência, pula para o mês seguinte', () => {
    expect(proximaOcorrencia(modelo(), '2026-04-05')).toBe('2026-05-05');
  });

  it('antes do início, a primeira ocorrência válida é a do mês do início (ou o seguinte)', () => {
    expect(proximaOcorrencia(modelo({ inicio: '2026-03-20' }), '2026-01-01')).toBe('2026-04-05');
    expect(proximaOcorrencia(modelo({ inicio: '2026-03-02' }), '2026-01-01')).toBe('2026-03-05');
  });

  it('dia 31 usa o último dia do mês seguinte curto', () => {
    expect(proximaOcorrencia(modelo({ diaDoMes: 31, inicio: '2026-01-01' }), '2026-01-31')).toBe(
      '2026-02-28',
    );
  });

  it('respeita o fim: devolve null quando a próxima data passaria dele', () => {
    expect(proximaOcorrencia(modelo({ fim: '2026-06-30' }), '2026-05-10')).toBe('2026-06-05');
    expect(proximaOcorrencia(modelo({ fim: '2026-06-30' }), '2026-06-05')).toBe(null);
  });

  it('fim no dia exato da ocorrência inclui essa data', () => {
    expect(proximaOcorrencia(modelo({ fim: '2026-06-05' }), '2026-05-10')).toBe('2026-06-05');
  });

  it('recorrência já encerrada devolve null', () => {
    expect(proximaOcorrencia(modelo({ fim: '2025-12-31' }), '2026-05-10')).toBe(null);
  });

  it('sem fim, nunca devolve null', () => {
    expect(proximaOcorrencia(modelo(), '2099-12-31')).toBe('2100-01-05');
  });

  it('lança RangeError para hoje inválido', () => {
    expect(() => proximaOcorrencia(modelo(), 'hoje')).toThrow(RangeError);
  });
});

describe('descreverRecorrencia', () => {
  it('descreve recorrência sem fim', () => {
    expect(descreverRecorrencia(modelo({ inicio: '2026-03-10' }))).toBe(
      'Todo dia 5, de mar/2026 sem data final',
    );
  });

  it('descreve dia 31 com período', () => {
    expect(descreverRecorrencia({ diaDoMes: 31, inicio: '2026-01-01', fim: '2026-12-31' })).toBe(
      'Todo dia 31 (último dia nos meses curtos), de jan/2026 a dez/2026',
    );
  });
});

describe('validarModelo', () => {
  it('aceita modelo válido', () => {
    expect(validarModelo(modelo({ fim: '2026-12-31' }))).toBeNull();
  });

  it('recusa dia fora de 1..31 e não inteiro', () => {
    expect(validarModelo(modelo({ diaDoMes: 0 }))).toMatch(/1 a 31/);
    expect(validarModelo(modelo({ diaDoMes: 32 }))).toMatch(/1 a 31/);
    expect(validarModelo(modelo({ diaDoMes: 2.5 }))).toMatch(/1 a 31/);
  });

  it('recusa datas inválidas', () => {
    expect(validarModelo(modelo({ inicio: '2026-02-30' }))).toMatch(/início/);
    expect(validarModelo(modelo({ fim: '2026-13-01' }))).toMatch(/final/);
  });

  it('recusa fim antes do início', () => {
    expect(validarModelo(modelo({ inicio: '2026-03-01', fim: '2026-02-28' }))).toMatch(/antes/);
  });

  it('aceita fim igual ao início', () => {
    expect(validarModelo(modelo({ inicio: '2026-03-01', fim: '2026-03-01' }))).toBeNull();
  });
});

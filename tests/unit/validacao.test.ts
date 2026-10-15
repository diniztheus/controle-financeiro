import { describe, expect, it } from 'vitest';
import {
  dia,
  diaDoMes,
  mes,
  numeroParcelas,
  textoObrigatorio,
  valorEmReais,
  valorPositivo,
} from '../../src/lib/validacao/comum';

describe('esquemas compartilhados', () => {
  it('valorEmReais converte para centavos', () => {
    expect(valorEmReais.parse('1.234,56')).toBe(123456);
    expect(valorEmReais.safeParse('abc').success).toBe(false);
  });

  it('valorPositivo recusa zero e negativo', () => {
    expect(valorPositivo.parse('0,01')).toBe(1);
    expect(valorPositivo.safeParse('0').success).toBe(false);
    expect(valorPositivo.safeParse('-3').success).toBe(false);
  });

  it('dia, mês, dia do mês e parcelas', () => {
    expect(dia.safeParse('2026-02-29').success).toBe(false);
    expect(dia.parse('2028-02-29')).toBe('2028-02-29');
    expect(mes.safeParse('2026-13').success).toBe(false);
    expect(diaDoMes.parse('31')).toBe(31);
    expect(diaDoMes.safeParse('32').success).toBe(false);
    expect(numeroParcelas.parse('24')).toBe(24);
    expect(numeroParcelas.safeParse('25').success).toBe(false);
    expect(numeroParcelas.safeParse('0').success).toBe(false);
  });

  it('texto obrigatório apara espaços', () => {
    const nome = textoObrigatorio('Nome', 5);
    expect(nome.parse('  Nu  ')).toBe('Nu');
    const r = nome.safeParse('   ');
    expect(r.success).toBe(false);
    expect(nome.safeParse('123456').success).toBe(false);
  });
});

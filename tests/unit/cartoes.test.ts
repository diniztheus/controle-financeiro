import { describe, expect, it } from 'vitest';
import {
  limiteDisponivel,
  previaParcelas,
  rotuloParcela,
  situacaoFatura,
  totalDaFatura,
  type ItemFatura,
} from '../../src/lib/dominio/cartoes';

describe('situação da fatura', () => {
  // Fatura que fecha em 10/10 e vence em 20/10.
  const f = { dataFechamento: '2026-10-10', dataVencimento: '2026-10-20', pagaEm: null };

  it('aberta antes do fechamento', () => {
    expect(situacaoFatura(f, '2026-10-01')).toBe('aberta');
    expect(situacaoFatura(f, '2026-10-09')).toBe('aberta');
  });

  it('fechada a partir do dia do fechamento, inclusive no vencimento', () => {
    expect(situacaoFatura(f, '2026-10-10')).toBe('fechada');
    expect(situacaoFatura(f, '2026-10-20')).toBe('fechada');
  });

  it('vencida só depois do dia do vencimento', () => {
    expect(situacaoFatura(f, '2026-10-21')).toBe('vencida');
    expect(situacaoFatura(f, '2027-01-01')).toBe('vencida');
  });

  it('paga tem prioridade sobre vencida, fechada e aberta', () => {
    expect(situacaoFatura({ ...f, pagaEm: '2026-10-25' }, '2026-11-01')).toBe('paga');
    expect(situacaoFatura({ ...f, pagaEm: '2026-10-15' }, '2026-10-16')).toBe('paga');
    expect(situacaoFatura({ ...f, pagaEm: '2026-10-05' }, '2026-10-06')).toBe('paga');
    expect(situacaoFatura({ ...f, pagaEm: '2026-10-05' }, '2026-10-01')).toBe('paga');
  });

  it('fatura com fechamento e vencimento no mesmo dia', () => {
    const g = { dataFechamento: '2026-04-30', dataVencimento: '2026-04-30', pagaEm: null };
    expect(situacaoFatura(g, '2026-04-29')).toBe('aberta');
    expect(situacaoFatura(g, '2026-04-30')).toBe('fechada');
    expect(situacaoFatura(g, '2026-05-01')).toBe('vencida');
  });
});

describe('limite disponível', () => {
  it('limite menos o que está a pagar', () => {
    expect(limiteDisponivel(100000, 25000)).toBe(75000);
    expect(limiteDisponivel(100000, 0)).toBe(100000);
    expect(limiteDisponivel(100000, 100000)).toBe(0);
  });

  it('pode ser negativo quando estoura o limite', () => {
    expect(limiteDisponivel(100000, 120000)).toBe(-20000);
  });

  it('null quando não há limite definido', () => {
    expect(limiteDisponivel(0, 5000)).toBeNull();
    expect(limiteDisponivel(-1, 0)).toBeNull();
  });
});

describe('itens e rótulos da fatura', () => {
  const item = (valorCentavos: number, parcela = 1, numParcelas = 1): ItemFatura => ({
    compraId: 'c1',
    data: '2026-10-01',
    descricao: null,
    categoriaNome: 'Outros',
    categoriaCor: null,
    valorCentavos,
    parcela,
    numParcelas,
  });

  it('total da fatura', () => {
    expect(totalDaFatura([])).toBe(0);
    expect(totalDaFatura([item(1000), item(2500), item(1)])).toBe(3501);
  });

  it('rótulo de parcela', () => {
    expect(rotuloParcela(3, 10)).toBe('3/10');
    expect(rotuloParcela(24, 24)).toBe('24/24');
    expect(rotuloParcela(1, 1)).toBe('À vista');
  });
});

describe('prévia de parcelas', () => {
  // Fecha dia 3, vence dia 10 (vencimento depois do fechamento).
  const ciclo = { diaFechamento: 3, diaVencimento: 10 };

  it('10x de R$ 1.000,00 comprada antes do fechamento começa na fatura do mês', () => {
    const ps = previaParcelas('2026-10-01', ciclo, 100000, 10);
    expect(ps).toHaveLength(10);
    expect(ps.every((p) => p.valorCentavos === 10000)).toBe(true);
    expect(ps[0]).toEqual({
      numero: 1,
      valorCentavos: 10000,
      mesCompetencia: '2026-10',
      mesFatura: '2026-10',
      vencimento: '2026-10-10',
    });
    expect(ps[9]).toEqual({
      numero: 10,
      valorCentavos: 10000,
      mesCompetencia: '2027-07',
      mesFatura: '2027-07',
      vencimento: '2027-07-10',
    });
  });

  it('compra no dia do fechamento cai na fatura seguinte', () => {
    const ps = previaParcelas('2026-10-03', ciclo, 30000, 3);
    expect(ps.map((p) => p.mesFatura)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(ps[0]?.vencimento).toBe('2026-11-10');
    // Competência segue o mês da compra, não a fatura.
    expect(ps.map((p) => p.mesCompetencia)).toEqual(['2026-10', '2026-11', '2026-12']);
  });

  it('1ª parcela leva o resto dos centavos', () => {
    const ps = previaParcelas('2026-10-01', ciclo, 10000, 3);
    expect(ps.map((p) => p.valorCentavos)).toEqual([3334, 3333, 3333]);
  });

  it('recusa número de parcelas fora de 1..24 e total não positivo', () => {
    expect(() => previaParcelas('2026-10-01', ciclo, 10000, 0)).toThrow(RangeError);
    expect(() => previaParcelas('2026-10-01', ciclo, 10000, 25)).toThrow(RangeError);
    expect(() => previaParcelas('2026-10-01', ciclo, 0, 2)).toThrow();
  });
});

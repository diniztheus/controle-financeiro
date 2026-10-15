import { describe, expect, it } from 'vitest';
import { somarDias, somarMeses } from '../../src/lib/dominio/datas';
import {
  dataFechamento,
  dataVencimento,
  mesDaFatura,
  venceNoMesSeguinte,
  type CicloCartao,
} from '../../src/lib/dominio/fatura';
import { gerarParcelas } from '../../src/lib/dominio/parcelas';

describe('fatura: compra no dia do fechamento', () => {
  const c: CicloCartao = { diaFechamento: 10, diaVencimento: 20 };

  it('um dia antes do fechamento fica na fatura do mês', () => {
    expect(venceNoMesSeguinte(c)).toBe(false);
    expect(mesDaFatura(c, '2026-10-09')).toBe('2026-10');
  });

  it('no dia do fechamento e depois cai na seguinte', () => {
    expect(mesDaFatura(c, '2026-10-10')).toBe('2026-11');
    expect(mesDaFatura(c, '2026-10-11')).toBe('2026-11');
  });

  it('datas da fatura de outubro', () => {
    expect(dataFechamento(c, '2026-10')).toBe('2026-10-10');
    expect(dataVencimento(c, '2026-10')).toBe('2026-10-20');
  });
});

describe('fatura: fechamento 31 em fevereiro', () => {
  // Vencimento 10 é antes do fechamento: vence no mês seguinte.
  const c: CicloCartao = { diaFechamento: 31, diaVencimento: 10 };

  it('fevereiro de 2026 (28 dias): fecha em 28/02', () => {
    expect(mesDaFatura(c, '2026-02-27')).toBe('2026-03');
    expect(mesDaFatura(c, '2026-02-28')).toBe('2026-04');
    expect(dataFechamento(c, '2026-03')).toBe('2026-02-28');
    expect(dataVencimento(c, '2026-03')).toBe('2026-03-10');
  });

  it('janeiro (31 dias): 30/01 é antes do fechamento, 31/01 é depois', () => {
    expect(mesDaFatura(c, '2026-01-30')).toBe('2026-02');
    expect(mesDaFatura(c, '2026-01-31')).toBe('2026-03');
    expect(dataFechamento(c, '2026-02')).toBe('2026-01-31');
  });

  it('fevereiro bissexto (2028, 29 dias): fecha em 29/02', () => {
    const d: CicloCartao = { diaFechamento: 31, diaVencimento: 15 };
    expect(mesDaFatura(d, '2028-02-28')).toBe('2028-03');
    expect(mesDaFatura(d, '2028-02-29')).toBe('2028-04');
    expect(dataFechamento(d, '2028-03')).toBe('2028-02-29');
    expect(mesDaFatura(d, '2027-02-27')).toBe('2027-03');
    expect(mesDaFatura(d, '2027-02-28')).toBe('2027-04');
  });

  it('31/10 com fechamento 31 já é depois do fechamento: fatura de dezembro', () => {
    expect(mesDaFatura(c, '2026-10-30')).toBe('2026-11');
    expect(mesDaFatura(c, '2026-10-31')).toBe('2026-12');
    expect(dataFechamento(c, '2026-12')).toBe('2026-11-30');
  });
});

describe('fatura: fechamento e vencimento no dia 31', () => {
  it('fechamento 31 e vencimento 31: vencimento no mês seguinte, fechamento em mês curto', () => {
    const c: CicloCartao = { diaFechamento: 31, diaVencimento: 31 };
    expect(venceNoMesSeguinte(c)).toBe(true);
    expect(mesDaFatura(c, '2026-02-27')).toBe('2026-03');
    expect(mesDaFatura(c, '2026-02-28')).toBe('2026-04');
    expect(dataFechamento(c, '2026-03')).toBe('2026-02-28');
    expect(dataVencimento(c, '2026-03')).toBe('2026-03-31');
    expect(dataVencimento(c, '2026-04')).toBe('2026-04-30');
  });

  it('fechamento 30 e vencimento 31 no mesmo mês: fechamento e vencimento no mesmo dia', () => {
    const c: CicloCartao = { diaFechamento: 30, diaVencimento: 31 };
    expect(venceNoMesSeguinte(c)).toBe(false);
    // Abril tem 30 dias: fecha e vence em 30/04.
    expect(mesDaFatura(c, '2026-04-29')).toBe('2026-04');
    expect(mesDaFatura(c, '2026-04-30')).toBe('2026-05');
    expect(dataFechamento(c, '2026-04')).toBe('2026-04-30');
    expect(dataVencimento(c, '2026-04')).toBe('2026-04-30');
    expect(dataVencimento(c, '2026-05')).toBe('2026-05-31');
  });

  it('fevereiro: fechamento 30 e vencimento 31 viram 28/02', () => {
    const c: CicloCartao = { diaFechamento: 30, diaVencimento: 31 };
    expect(mesDaFatura(c, '2026-02-27')).toBe('2026-02');
    expect(mesDaFatura(c, '2026-02-28')).toBe('2026-03');
    expect(dataFechamento(c, '2026-02')).toBe('2026-02-28');
    expect(dataVencimento(c, '2026-02')).toBe('2026-02-28');
  });

  it('fechamento 29 e vencimento 30 em fevereiro de 2027', () => {
    const c: CicloCartao = { diaFechamento: 29, diaVencimento: 30 };
    expect(mesDaFatura(c, '2027-02-27')).toBe('2027-02');
    expect(mesDaFatura(c, '2027-02-28')).toBe('2027-03');
    expect(dataVencimento(c, '2027-02')).toBe('2027-02-28');
  });

  it('vencimento 31 em meses de 30 e 31 dias, e vencimento 29 em fevereiro', () => {
    const c: CicloCartao = { diaFechamento: 20, diaVencimento: 31 };
    expect(dataVencimento(c, '2026-02')).toBe('2026-02-28');
    expect(dataVencimento(c, '2026-06')).toBe('2026-06-30');
    expect(dataVencimento(c, '2026-07')).toBe('2026-07-31');
    expect(dataFechamento(c, '2026-07')).toBe('2026-07-20');
    expect(mesDaFatura(c, '2026-06-20')).toBe('2026-07');
    const d: CicloCartao = { diaFechamento: 5, diaVencimento: 29 };
    expect(dataVencimento(d, '2027-02')).toBe('2027-02-28');
    expect(dataVencimento(d, '2028-02')).toBe('2028-02-29');
  });
});

describe('fatura: virada de ano', () => {
  const c: CicloCartao = { diaFechamento: 20, diaVencimento: 5 };

  it('compra em dezembro pode cair na fatura de janeiro ou de fevereiro', () => {
    expect(mesDaFatura(c, '2026-12-19')).toBe('2027-01');
    expect(mesDaFatura(c, '2026-12-20')).toBe('2027-02');
  });

  it('datas das faturas que atravessam o ano', () => {
    expect(dataVencimento(c, '2027-01')).toBe('2027-01-05');
    expect(dataFechamento(c, '2027-01')).toBe('2026-12-20');
    expect(dataVencimento(c, '2027-02')).toBe('2027-02-05');
    expect(dataFechamento(c, '2027-02')).toBe('2027-01-20');
  });

  it('parcelas que atravessam o ano', () => {
    const d: CicloCartao = { diaFechamento: 3, diaVencimento: 10 };
    expect(mesDaFatura(d, '2026-12-05', 0)).toBe('2027-01');
    expect(mesDaFatura(d, '2026-12-05', 1)).toBe('2027-02');
    expect(mesDaFatura(d, '2026-12-05', 2)).toBe('2027-03');
    expect(mesDaFatura(d, '2026-12-02', 0)).toBe('2026-12');
  });
});

describe('fatura: parcela i e 24 parcelas', () => {
  const c: CicloCartao = { diaFechamento: 3, diaVencimento: 10 };

  it('a parcela i cai na fatura da 1ª mais i', () => {
    for (let i = 0; i < 24; i++) {
      expect(mesDaFatura(c, '2026-10-15', i)).toBe(somarMeses('2026-11', i));
    }
  });

  it('24 parcelas: a última cai 23 meses depois da 1ª', () => {
    expect(mesDaFatura(c, '2026-10-15', 23)).toBe('2028-10');
  });

  it('índice de parcela não inteiro ou negativo é recusado', () => {
    expect(() => mesDaFatura(c, '2026-10-15', -1)).toThrow(RangeError);
    expect(() => mesDaFatura(c, '2026-10-15', 1.5)).toThrow(RangeError);
  });

  it('dia de fechamento e vencimento fora de 1..31 é recusado', () => {
    expect(() => mesDaFatura({ diaFechamento: 3, diaVencimento: 0 }, '2026-10-01')).toThrow();
    expect(() => dataVencimento({ diaFechamento: 32, diaVencimento: 1 }, '2026-10')).toThrow();
  });
});

describe('fatura: gerarParcelas', () => {
  it('100,00 em 3x: 33,34 + 33,33 + 33,33', () => {
    const ps = gerarParcelas('2026-10-01', 10000, 3);
    expect(ps.map((p) => p.valorCentavos)).toEqual([3334, 3333, 3333]);
    expect(ps.map((p) => p.numero)).toEqual([1, 2, 3]);
  });

  it('competência de cada parcela: mês da compra + i, inclusive virada de ano', () => {
    const ps = gerarParcelas('2026-11-30', 9000, 3);
    expect(ps.map((p) => p.mesCompetencia)).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('uma parcela só leva o total inteiro', () => {
    expect(gerarParcelas('2026-10-15', 4290, 1)).toEqual([
      { numero: 1, valorCentavos: 4290, mesCompetencia: '2026-10' },
    ]);
  });

  it('24 parcelas: a soma é sempre o total, com o resto na 1ª', () => {
    const ps = gerarParcelas('2026-10-15', 10000, 24);
    expect(ps).toHaveLength(24);
    expect(ps[0]?.valorCentavos).toBe(432);
    expect(ps.slice(1).every((p) => p.valorCentavos === 416)).toBe(true);
    expect(ps.at(-1)?.mesCompetencia).toBe('2028-09');
  });

  it('a soma das parcelas é sempre igual ao total, para vários valores e números', () => {
    for (const total of [100, 9999, 10000, 123456789]) {
      for (let n = 1; n <= 24; n++) {
        const soma = gerarParcelas('2026-10-15', total, n).reduce((s, p) => s + p.valorCentavos, 0);
        expect(soma).toBe(total);
      }
    }
  });

  it('recusa total não positivo e número de parcelas fora de 1..24', () => {
    expect(() => gerarParcelas('2026-10-15', 0, 1)).toThrow();
    expect(() => gerarParcelas('2026-10-15', 100, 0)).toThrow();
    expect(() => gerarParcelas('2026-10-15', 100, 25)).toThrow();
  });
});

describe('fatura: coerência entre fechamento, vencimento e mesDaFatura', () => {
  const ciclos: CicloCartao[] = [];
  for (const diaFechamento of [1, 5, 10, 20, 28, 29, 30, 31]) {
    for (let diaVencimento = 1; diaVencimento <= 31; diaVencimento++) {
      ciclos.push({ diaFechamento, diaVencimento });
    }
  }

  it('fechamento não passa do vencimento da mesma fatura', () => {
    for (const c of ciclos) {
      for (let m = 0; m < 3; m++) {
        const mes = somarMeses('2026-01', m);
        expect(dataFechamento(c, mes) <= dataVencimento(c, mes)).toBe(true);
      }
    }
  });

  it('cada dia cai numa única fatura: fechamento anterior <= dia < fechamento da fatura', () => {
    for (const c of ciclos) {
      let dia = '2026-01-01';
      for (let n = 0; n < 3 * 365; n++) {
        const mes = mesDaFatura(c, dia);
        const fechaEsta = dataFechamento(c, mes);
        const fechouAnterior = dataFechamento(c, somarMeses(mes, -1));
        if (!(dia < fechaEsta && fechouAnterior <= dia)) {
          throw new Error(
            `Compra ${dia} com ${JSON.stringify(c)} caiu em ${mes}, fechamento ${fechaEsta}`,
          );
        }
        dia = somarDias(dia, 1);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  CATEGORIAS_PADRAO,
  CORES,
  chaveCategoria,
  corPorPosicao,
  ehCor,
  proximaCor,
} from '../../src/lib/dominio/categorias';
import {
  dataFechamento,
  dataVencimento,
  mesDaFatura,
  venceNoMesSeguinte,
} from '../../src/lib/dominio/fatura';
import { gerarParcelas } from '../../src/lib/dominio/parcelas';
import {
  acumuladoPorDia,
  compararComAnterior,
  diaDeCorte,
  patrimonioLiquido,
  porCategoria,
  situacaoLimite,
  type LancamentoDoMes,
} from '../../src/lib/dominio/resumo';

describe('parcelas', () => {
  it('à vista: uma parcela no mês da compra', () => {
    expect(gerarParcelas('2026-10-15', 4290, 1)).toEqual([
      { numero: 1, valorCentavos: 4290, mesCompetencia: '2026-10' },
    ]);
  });

  it('parcelado: um mês por parcela, resto na 1ª, virando o ano', () => {
    const ps = gerarParcelas('2026-11-30', 10000, 3);
    expect(ps.map((p) => p.valorCentavos)).toEqual([3334, 3333, 3333]);
    expect(ps.map((p) => p.mesCompetencia)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(ps.map((p) => p.numero)).toEqual([1, 2, 3]);
  });

  it('recusa total zero, parcelas fora de 1..24 e data inválida', () => {
    expect(() => gerarParcelas('2026-10-15', 0, 1)).toThrow();
    expect(() => gerarParcelas('2026-10-15', 100, 25)).toThrow();
    expect(() => gerarParcelas('2026-02-30', 100, 1)).toThrow();
  });
});

describe('ciclo de fatura (regras do app atual)', () => {
  const fecha3vence10 = { diaFechamento: 3, diaVencimento: 10 };
  const fecha25vence5 = { diaFechamento: 25, diaVencimento: 5 };

  it('vencimento depois do fechamento: mesmo mês', () => {
    expect(venceNoMesSeguinte(fecha3vence10)).toBe(false);
    expect(mesDaFatura(fecha3vence10, '2026-10-02')).toBe('2026-10');
    // No dia do fechamento ou depois: fatura seguinte.
    expect(mesDaFatura(fecha3vence10, '2026-10-03')).toBe('2026-11');
    expect(mesDaFatura(fecha3vence10, '2026-10-31')).toBe('2026-11');
  });

  it('vencimento antes do fechamento: vence no mês seguinte', () => {
    expect(venceNoMesSeguinte(fecha25vence5)).toBe(true);
    expect(mesDaFatura(fecha25vence5, '2026-10-24')).toBe('2026-11');
    expect(mesDaFatura(fecha25vence5, '2026-10-25')).toBe('2026-12');
    expect(mesDaFatura(fecha25vence5, '2026-12-30')).toBe('2027-02');
  });

  it('vencimento igual ao fechamento conta como mês seguinte', () => {
    expect(mesDaFatura({ diaFechamento: 10, diaVencimento: 10 }, '2026-10-09')).toBe('2026-11');
  });

  it('fechamento 31 em mês curto vale o último dia', () => {
    const c = { diaFechamento: 31, diaVencimento: 10 };
    expect(mesDaFatura(c, '2026-02-27')).toBe('2026-03');
    expect(mesDaFatura(c, '2026-02-28')).toBe('2026-04');
    expect(mesDaFatura(c, '2028-02-28')).toBe('2028-03');
    expect(mesDaFatura(c, '2028-02-29')).toBe('2028-04');
    expect(dataFechamento(c, '2026-03')).toBe('2026-02-28');
  });

  it('parcelas seguem fatura a fatura', () => {
    expect(mesDaFatura(fecha3vence10, '2026-12-05', 0)).toBe('2027-01');
    expect(mesDaFatura(fecha3vence10, '2026-12-05', 2)).toBe('2027-03');
  });

  it('datas de fechamento e vencimento da fatura', () => {
    expect(dataVencimento(fecha3vence10, '2026-11')).toBe('2026-11-10');
    expect(dataFechamento(fecha3vence10, '2026-11')).toBe('2026-11-03');
    expect(dataVencimento(fecha25vence5, '2026-12')).toBe('2026-12-05');
    expect(dataFechamento(fecha25vence5, '2026-12')).toBe('2026-11-25');
    expect(dataVencimento({ diaFechamento: 20, diaVencimento: 31 }, '2026-04')).toBe('2026-04-30');
  });

  it('recusa dias fora de 1..31 e índice negativo', () => {
    expect(() => mesDaFatura({ diaFechamento: 0, diaVencimento: 10 }, '2026-10-01')).toThrow();
    expect(() => mesDaFatura({ diaFechamento: 3, diaVencimento: 32 }, '2026-10-01')).toThrow();
    expect(() => mesDaFatura(fecha3vence10, '2026-10-01', -1)).toThrow();
  });
});

describe('categorias', () => {
  it('lista inicial igual à do app atual', () => {
    expect(CATEGORIAS_PADRAO).toHaveLength(11);
    expect(CATEGORIAS_PADRAO[0]).toBe('Alimentação');
    expect(CATEGORIAS_PADRAO.at(-1)).toBe('Outros');
  });

  it('cores da paleta', () => {
    expect(CORES).toHaveLength(11);
    expect(ehCor('c10')).toBe(true);
    expect(ehCor('c11')).toBe(false);
    expect(ehCor('#fff')).toBe(false);
    expect(corPorPosicao(0)).toBe('c0');
    expect(corPorPosicao(11)).toBe('c0');
    expect(corPorPosicao(13)).toBe('c2');
  });

  it('próxima cor: a primeira livre, ou a menos usada', () => {
    expect(proximaCor([])).toBe('c0');
    expect(proximaCor(['c0', 'c1'])).toBe('c2');
    expect(proximaCor([...CORES])).toBe('c0');
    expect(proximaCor([...CORES, 'c0', 'c1'])).toBe('c2');
    expect(proximaCor(['lixo'])).toBe('c0');
  });

  it('chave de comparação ignora caixa, acentos não, e espaços extras', () => {
    expect(chaveCategoria('  Saúde  ')).toBe('saúde');
    expect(chaveCategoria('SAÚDE')).toBe('saúde');
    expect(chaveCategoria('Contas   da casa')).toBe('contas da casa');
    expect(chaveCategoria('Saude')).not.toBe(chaveCategoria('Saúde'));
  });
});

describe('resumo do mês', () => {
  const l = (data: string, valorCentavos: number, categoriaId = 'a'): LancamentoDoMes => ({
    data,
    valorCentavos,
    categoriaId,
  });

  it('limite: sem limite, ok, alerta (85%) e estourado', () => {
    expect(situacaoLimite(100, null)).toBeNull();
    expect(situacaoLimite(100, 0)).toBeNull();
    expect(situacaoLimite(8400, 10000)).toMatchObject({
      estado: 'ok',
      percentual: 84,
      restanteCentavos: 1600,
    });
    expect(situacaoLimite(8500, 10000)?.estado).toBe('alerta');
    expect(situacaoLimite(10000, 10000)?.estado).toBe('alerta');
    expect(situacaoLimite(10001, 10000)).toMatchObject({
      estado: 'estourado',
      restanteCentavos: -1,
    });
  });

  it('por categoria: soma, ordena e calcula a fatia', () => {
    const r = porCategoria([
      l('2026-10-01', 300, 'a'),
      l('2026-10-02', 700, 'b'),
      l('2026-10-03', 0, 'a'),
    ]);
    expect(r).toEqual([
      { categoriaId: 'b', totalCentavos: 700, quantidade: 1, percentual: 70 },
      { categoriaId: 'a', totalCentavos: 300, quantidade: 2, percentual: 30 },
    ]);
    expect(porCategoria([])).toEqual([]);
  });

  it('acumulado por dia ignora outros meses', () => {
    const a = acumuladoPorDia('2026-02', [
      l('2026-02-01', 100),
      l('2026-02-28', 50),
      l('2026-03-01', 999),
    ]);
    expect(a).toHaveLength(29);
    expect(a[0]).toBe(0);
    expect(a[1]).toBe(100);
    expect(a[27]).toBe(100);
    expect(a[28]).toBe(150);
  });

  it('compara com o mês anterior até o mesmo dia', () => {
    const atual = acumuladoPorDia('2026-10', [l('2026-10-01', 1200), l('2026-10-20', 500)]);
    const anterior = acumuladoPorDia('2026-09', [l('2026-09-05', 1000), l('2026-09-30', 4000)]);
    expect(compararComAnterior(atual, anterior, 15)).toEqual({
      ateDia: 15,
      atualCentavos: 1200,
      anteriorCentavos: 1000,
      diferencaCentavos: 200,
      percentual: 20,
    });
    // Dia 31 num mês anterior de 30 dias usa o dia 30.
    expect(compararComAnterior(atual, anterior, 31)?.anteriorCentavos).toBe(5000);
    // Mês futuro ou mês anterior vazio: sem comparação.
    expect(compararComAnterior(atual, anterior, 0)).toBeNull();
    expect(compararComAnterior(atual, acumuladoPorDia('2026-09', []), 15)).toBeNull();
  });

  it('sem gasto no anterior até o dia, compara com o total dele (como a v3)', () => {
    const atual = acumuladoPorDia('2026-10', [l('2026-10-01', 500)]);
    const anterior = acumuladoPorDia('2026-09', [l('2026-09-30', 1000)]);
    expect(compararComAnterior(atual, anterior, 2)?.percentual).toBe(50);
  });

  it('dia de corte: hoje, fim do mês passado, nada no futuro', () => {
    expect(diaDeCorte('2026-10', '2026-10-15')).toBe(15);
    expect(diaDeCorte('2026-09', '2026-10-15')).toBe(30);
    expect(diaDeCorte('2026-11', '2026-10-15')).toBe(0);
  });

  it('patrimônio líquido: contas, bitcoin e cartões a pagar', () => {
    expect(patrimonioLiquido({ saldosContas: [150000, -2000] })).toBe(148000);
    expect(
      patrimonioLiquido({ saldosContas: [1000], bitcoinCentavos: 500, aPagarCartoesCentavos: 300 }),
    ).toBe(1200);
    expect(patrimonioLiquido({ saldosContas: [] })).toBe(0);
  });
});

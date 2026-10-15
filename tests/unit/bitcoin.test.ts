import { describe, expect, it } from 'vitest';
import {
  calcularEvolucao,
  calcularPosicao,
  centavosParaSats,
  formatarSats,
  MAX_SATS,
  type MovBtc,
  parseSats,
  precoImplicito,
  satsParaCentavos,
  SATS_POR_BTC,
} from '../../src/lib/dominio/bitcoin';

const UM_BTC = SATS_POR_BTC;
/** R$ 300.000,00 por BTC, em centavos. */
const PRECO_300K = 30_000_000;
/** R$ 400.000,00 por BTC. */
const PRECO_400K = 40_000_000;

describe('conversões sats ⇄ centavos', () => {
  it('converte exato quando não há resto', () => {
    expect(satsParaCentavos(UM_BTC, PRECO_300K)).toBe(PRECO_300K);
    expect(satsParaCentavos(150_000_000, PRECO_300K)).toBe(45_000_000); // 1,5 BTC = R$ 450.000,00
    expect(centavosParaSats(45_000_000, PRECO_300K)).toBe(150_000_000);
  });

  it('arredonda meio para cima, uma única vez', () => {
    expect(satsParaCentavos(50_000_000, 1)).toBe(1); // 0,5 centavo sobe
    expect(satsParaCentavos(1, 1)).toBe(0); // 1e-8 centavo some
    expect(centavosParaSats(1, UM_BTC)).toBe(1); // BTC a R$ 1.000.000: 1 centavo compra 1 sat
    expect(centavosParaSats(1, 3)).toBe(33_333_333); // 1 centavo a 3 centavos/BTC: 33.333.333,33 sats
  });

  it('é exato em valores grandes, onde ponto flutuante erraria', () => {
    // 1.999.999.999.999.999 sats * R$ 40.000,00/BTC = 7,99e21 em produto intermediário,
    // bem acima de 2^53. Resultado exato: 79.999.999.999.999,96 centavos -> 80.000.000.000.000
    expect(satsParaCentavos(1_999_999_999_999_999, 4_000_000)).toBe(80_000_000_000_000);
  });

  it('rejeita entradas inválidas', () => {
    expect(() => satsParaCentavos(1.5, PRECO_300K)).toThrow(RangeError);
    expect(() => satsParaCentavos(UM_BTC, -1)).toThrow(RangeError);
    expect(() => centavosParaSats(100, 0)).toThrow(RangeError);
    expect(() => centavosParaSats(100.5, PRECO_300K)).toThrow(RangeError);
  });
});

describe('parseSats', () => {
  it.each([
    ['1500', 1500],
    ['1.500', 1500],
    ['1.234.567', 1_234_567],
    [' 2 500 ', 2500],
    ['1 500', 1500],
    ['0001', 1],
    [String(MAX_SATS), MAX_SATS],
  ])('aceita %j como %i', (texto, esperado) => {
    expect(parseSats(texto)).toBe(esperado);
  });

  it.each([
    [''],
    ['   '],
    ['0'],
    ['-100'],
    ['+100'],
    ['1,5'],
    ['0,001'],
    ['1.23'],
    ['1.5'],
    ['0.001 btc'],
    ['abc'],
    [String(MAX_SATS + 1)],
    [null],
    [undefined],
  ])('rejeita %j', (texto) => {
    expect(parseSats(texto)).toBeNull();
  });
});

describe('formatarSats', () => {
  it('agrupa milhar com ponto', () => {
    expect(formatarSats(0)).toBe('0 sats');
    expect(formatarSats(1500)).toBe('1.500 sats');
    expect(formatarSats(1_234_567)).toBe('1.234.567 sats');
  });

  it('usa sinal de menos tipográfico para negativos', () => {
    expect(formatarSats(-1500)).toBe('−1.500 sats');
  });
});

describe('precoImplicito', () => {
  it('é o preço da compra com valor', () => {
    const m: MovBtc = { sats: UM_BTC, valorCentavos: PRECO_300K, data: '2026-01-10' };
    expect(precoImplicito(m)).toBe(PRECO_300K);
  });

  it('vale também para venda, em módulo', () => {
    const m: MovBtc = { sats: -50_000_000, valorCentavos: 20_000_000, data: '2026-01-10' };
    expect(precoImplicito(m)).toBe(40_000_000);
  });

  it('é null sem valor', () => {
    expect(precoImplicito({ sats: UM_BTC, valorCentavos: 0, data: '2026-01-10' })).toBeNull();
  });
});

describe('calcularPosicao', () => {
  const compra: MovBtc = { sats: UM_BTC, valorCentavos: 30_000_000, data: '2026-01-10' };

  it('compra com valor: custo, preço médio, valor e ganho', () => {
    const p = calcularPosicao([compra], PRECO_400K);
    expect(p).toEqual({
      sats: UM_BTC,
      custoCentavos: 30_000_000,
      precoMedioCentavos: 30_000_000,
      valorAtualCentavos: 40_000_000,
      ganhoCentavos: 10_000_000,
      ganhoPercentual: (10_000_000 / 30_000_000) * 100,
    });
  });

  it('perda aparece como ganho negativo', () => {
    const p = calcularPosicao([compra], 20_000_000);
    expect(p.valorAtualCentavos).toBe(20_000_000);
    expect(p.ganhoCentavos).toBe(-10_000_000);
    expect(p.ganhoPercentual).toBeCloseTo(-33.33, 2);
  });

  it('venda parcial baixa o custo na proporção dos sats vendidos e mantém o preço médio', () => {
    const venda: MovBtc = { sats: -40_000_000, valorCentavos: 16_000_000, data: '2026-02-01' };
    const p = calcularPosicao([compra, venda], PRECO_400K);
    expect(p.sats).toBe(60_000_000);
    expect(p.custoCentavos).toBe(18_000_000); // 30M * 40M / 100M = 12M sai do custo
    expect(p.precoMedioCentavos).toBe(30_000_000);
    expect(p.valorAtualCentavos).toBe(24_000_000);
    expect(p.ganhoCentavos).toBe(6_000_000);
  });

  it('venda total zera a posição', () => {
    const venda: MovBtc = { sats: -UM_BTC, valorCentavos: 40_000_000, data: '2026-02-01' };
    expect(calcularPosicao([compra, venda], PRECO_400K)).toEqual({
      sats: 0,
      custoCentavos: 0,
      precoMedioCentavos: null,
      valorAtualCentavos: 0,
      ganhoCentavos: 0,
      ganhoPercentual: null,
    });
  });

  it('compra sem valor entra nos sats mas fica fora do preço médio', () => {
    const semValor: MovBtc = { sats: 50_000_000, valorCentavos: 0, data: '2026-01-20' };
    const p = calcularPosicao([compra, semValor], PRECO_400K);
    expect(p.sats).toBe(150_000_000);
    expect(p.custoCentavos).toBe(30_000_000);
    expect(p.precoMedioCentavos).toBe(30_000_000);
    expect(p.valorAtualCentavos).toBe(60_000_000);
    expect(p.ganhoCentavos).toBe(30_000_000);
  });

  it('só compra sem valor: sem preço médio e sem custo', () => {
    const semValor: MovBtc = { sats: 1000, valorCentavos: 0, data: '2026-01-20' };
    const p = calcularPosicao([semValor], PRECO_400K);
    expect(p.precoMedioCentavos).toBeNull();
    expect(p.custoCentavos).toBe(0);
    expect(p.ganhoPercentual).toBeNull();
    expect(p.valorAtualCentavos).toBe(satsParaCentavos(1000, PRECO_400K));
  });

  it('venda consome primeiro os sats sem preço, sem mexer no preço médio dos pagos', () => {
    const semValor: MovBtc = { sats: 50_000_000, valorCentavos: 0, data: '2026-01-05' };
    const venda: MovBtc = { sats: -60_000_000, valorCentavos: 0, data: '2026-02-01' };
    const p = calcularPosicao([compra, semValor, venda], null);
    expect(p.sats).toBe(90_000_000);
    // 0,5 BTC sem preço saem primeiro; os 0,1 BTC restantes saem do lote pago: 3M de custo
    expect(p.precoMedioCentavos).toBe(30_000_000);
  });

  it('usa a ordem por data, não a ordem da lista', () => {
    const venda: MovBtc = { sats: -UM_BTC / 2, valorCentavos: 0, data: '2026-03-01' };
    const compraTardia: MovBtc = { sats: UM_BTC, valorCentavos: 50_000_000, data: '2026-02-01' };
    const p = calcularPosicao([venda, compraTardia, compra], null);
    expect(p.sats).toBe(UM_BTC + UM_BTC - UM_BTC / 2);
    // compras de 30M e 50M (custo 80M em 2 BTC); vende 0,5 BTC a 40M/BTC: sai 20M de custo
    expect(p.custoCentavos).toBe(60_000_000);
  });

  it('sem preço atual: valor e ganho são null, mas o custo continua', () => {
    const p = calcularPosicao([compra], null);
    expect(p.valorAtualCentavos).toBeNull();
    expect(p.ganhoCentavos).toBeNull();
    expect(p.ganhoPercentual).toBeNull();
    expect(p.precoMedioCentavos).toBe(30_000_000);
  });

  it('sem movimentos: posição zerada e valor zero mesmo sem preço', () => {
    expect(calcularPosicao([], null)).toEqual({
      sats: 0,
      custoCentavos: 0,
      precoMedioCentavos: null,
      valorAtualCentavos: 0,
      ganhoCentavos: 0,
      ganhoPercentual: null,
    });
  });

  it('venda maior que o saldo falha', () => {
    const venda: MovBtc = { sats: -UM_BTC - 1, valorCentavos: 0, data: '2026-02-01' };
    expect(() => calcularPosicao([compra, venda], PRECO_400K)).toThrow(/excede o saldo/);
  });

  it('venda antes da compra (por data) falha', () => {
    const venda: MovBtc = { sats: -1000, valorCentavos: 0, data: '2025-12-01' };
    expect(() => calcularPosicao([compra, venda], null)).toThrow(/excede o saldo/);
  });

  it('não altera a lista recebida', () => {
    const lista = [{ ...compra }, { sats: -1, valorCentavos: 0, data: '2025-01-01' }];
    const copia = JSON.stringify(lista);
    expect(() => calcularPosicao(lista, null)).toThrow();
    expect(JSON.stringify(lista)).toBe(copia);
  });
});

describe('calcularEvolucao', () => {
  const compra: MovBtc = { sats: UM_BTC, valorCentavos: 30_000_000, data: '2026-01-10' };
  const venda: MovBtc = { sats: -50_000_000, valorCentavos: 20_000_000, data: '2026-01-20' };

  it('um ponto por dia com movimento ou preço, com o último preço conhecido', () => {
    const pontos = calcularEvolucao(
      [compra, venda],
      [{ data: '2026-01-15', precoCentavos: PRECO_400K }],
    );
    expect(pontos).toEqual([
      { data: '2026-01-10', sats: UM_BTC, valorCentavos: null }, // ainda sem preço
      { data: '2026-01-15', sats: UM_BTC, valorCentavos: 40_000_000 }, // dia do preço
      { data: '2026-01-20', sats: 50_000_000, valorCentavos: 20_000_000 }, // venda usa o mesmo preço
    ]);
  });

  it('preço faltando no início: valor null até o primeiro preço', () => {
    const pontos = calcularEvolucao([compra], []);
    expect(pontos).toEqual([{ data: '2026-01-10', sats: UM_BTC, valorCentavos: null }]);
  });

  it('dia só com preço gera ponto com os sats acumulados até ali', () => {
    const pontos = calcularEvolucao(
      [compra],
      [
        { data: '2026-01-05', precoCentavos: PRECO_300K },
        { data: '2026-01-12', precoCentavos: PRECO_400K },
      ],
    );
    expect(pontos).toEqual([
      { data: '2026-01-05', sats: 0, valorCentavos: 0 },
      { data: '2026-01-10', sats: UM_BTC, valorCentavos: 30_000_000 },
      { data: '2026-01-12', sats: UM_BTC, valorCentavos: 40_000_000 },
    ]);
  });

  it('sem movimentos e sem preços: lista vazia', () => {
    expect(calcularEvolucao([], [])).toEqual([]);
  });

  it('sem movimentos mas com preço: sats zero e valor zero', () => {
    expect(calcularEvolucao([], [{ data: '2026-01-05', precoCentavos: PRECO_300K }])).toEqual([
      { data: '2026-01-05', sats: 0, valorCentavos: 0 },
    ]);
  });

  it('é ordenada por data mesmo com a entrada fora de ordem', () => {
    const pontos = calcularEvolucao(
      [venda, compra],
      [{ data: '2026-01-15', precoCentavos: PRECO_400K }],
    );
    expect(pontos.map((p) => p.data)).toEqual(['2026-01-10', '2026-01-15', '2026-01-20']);
  });

  it('venda acima do saldo falha', () => {
    const grande: MovBtc = { sats: -2 * UM_BTC, valorCentavos: 0, data: '2026-01-20' };
    expect(() => calcularEvolucao([compra, grande], [])).toThrow(/excede o saldo/);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Banco } from '../../src/lib/server/db/conexao';
import { btcPrecos } from '../../src/lib/server/db/esquema';
import {
  buscarPrecoAutomatico,
  definirPrecoManual,
  listarMovimentos,
  movimentosNaLixeira,
  painelBitcoin,
  precoAtual,
  registrarMovimento,
  removerMovimento,
  restaurarMovimento,
  salvarPrecoAutomatico,
  valorBitcoinCentavos,
} from '../../src/lib/server/servicos/bitcoin';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import { montarPainel } from '../../src/lib/server/servicos/painel';
import { hoje } from '../../src/lib/dominio/datas';
import { bancoEmMemoria } from './ajuda-banco';

let banco: Banco;
beforeEach(() => {
  banco = bancoEmMemoria();
});
afterEach(() => {
  banco.sqlite.close();
  vi.useRealTimers();
});

const T1 = new Date('2026-10-01T12:00:00Z');
const T2 = new Date('2026-10-02T12:00:00Z');

/** Resposta falsa de fetch, no formato da API pública. */
function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function buscarFalso(fazer: () => Promise<Response> | Response) {
  return vi.fn(async () => fazer()) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

// 0,001 BTC por R$ 500,00 => preço implícito de R$ 500.000,00 por BTC.
const COMPRA_1 = { sats: 100_000, valorCentavos: 50_000, data: '2026-10-01' };

describe('movimentos', () => {
  it('compra soma sats e aparece mais nova primeiro', () => {
    const a = registrarMovimento(banco, COMPRA_1, T1);
    const b = registrarMovimento(banco, { sats: 5_000, valorCentavos: 0, data: '2026-10-02' }, T2);
    expect(listarMovimentos(banco).map((m) => m.id)).toEqual([b.id, a.id]);
    expect(painelBitcoin(banco).posicao.sats).toBe(105_000);
    // Preço implícito de R$ 500.000 por BTC: 105.000 sats valem R$ 525,00.
    expect(valorBitcoinCentavos(banco)).toBe(52_500);
  });

  it('venda maior que o saldo de sats falha com erro de negócio', () => {
    registrarMovimento(banco, COMPRA_1, T1);
    expect(() =>
      registrarMovimento(banco, { sats: -100_001, valorCentavos: 0, data: '2026-10-02' }, T2),
    ).toThrow(ErroDeNegocio);
    expect(listarMovimentos(banco)).toHaveLength(1);
  });

  it('venda dentro do saldo é aceita', () => {
    registrarMovimento(banco, COMPRA_1, T1);
    registrarMovimento(banco, { sats: -40_000, valorCentavos: 20_000, data: '2026-10-02' }, T2);
    expect(painelBitcoin(banco).posicao.sats).toBe(60_000);
  });

  it('rejeita quantidade zero, fracionária ou data inválida', () => {
    expect(() => registrarMovimento(banco, { ...COMPRA_1, sats: 0 })).toThrow(ErroDeNegocio);
    expect(() => registrarMovimento(banco, { ...COMPRA_1, sats: 1.5 })).toThrow(ErroDeNegocio);
    expect(() => registrarMovimento(banco, { ...COMPRA_1, data: '2026-13-01' })).toThrow(
      ErroDeNegocio,
    );
  });

  it('nota vazia vira null', () => {
    const m = registrarMovimento(banco, { ...COMPRA_1, nota: '   ' });
    expect(m.nota).toBeNull();
  });

  it('remover manda para a lixeira e restaurar traz de volta', () => {
    const m = registrarMovimento(banco, COMPRA_1, T1);
    removerMovimento(banco, m.id, T2);
    expect(listarMovimentos(banco)).toHaveLength(0);
    expect(movimentosNaLixeira(banco).map((x) => x.id)).toEqual([m.id]);
    restaurarMovimento(banco, m.id);
    expect(listarMovimentos(banco)).toHaveLength(1);
    expect(movimentosNaLixeira(banco)).toHaveLength(0);
  });

  it('não remove compra que deixaria venda sem saldo', () => {
    const compra = registrarMovimento(banco, COMPRA_1, T1);
    registrarMovimento(banco, { sats: -60_000, valorCentavos: 0, data: '2026-10-02' }, T2);
    expect(() => removerMovimento(banco, compra.id, T2)).toThrow(ErroDeNegocio);
    expect(listarMovimentos(banco)).toHaveLength(2);
  });

  it('não restaura venda que o saldo atual não cobre', () => {
    registrarMovimento(banco, COMPRA_1, T1);
    const venda = registrarMovimento(
      banco,
      { sats: -10, valorCentavos: 0, data: '2026-10-01' },
      T1,
    );
    removerMovimento(banco, venda.id, T2);
    // Consome todo o saldo; restaurar a venda de 10 sats agora deixaria a posição negativa.
    registrarMovimento(banco, { sats: -100_000, valorCentavos: 0, data: '2026-10-02' }, T2);
    expect(() => restaurarMovimento(banco, venda.id)).toThrow(ErroDeNegocio);
    expect(movimentosNaLixeira(banco).map((m) => m.id)).toEqual([venda.id]);
  });
});

describe('preços', () => {
  it('compra com valor grava o preço implícito do dia', () => {
    registrarMovimento(banco, COMPRA_1, T1);
    expect(precoAtual(banco)).toEqual({
      precoCentavos: 50_000_000,
      data: '2026-10-01',
      origem: 'implicito',
    });
  });

  it('compra sem valor não grava preço', () => {
    registrarMovimento(banco, { sats: 1_000, valorCentavos: 0, data: '2026-10-01' }, T1);
    expect(precoAtual(banco)).toBeNull();
  });

  it('preço implícito não sobrescreve manual nem api do mesmo dia', () => {
    definirPrecoManual(banco, '2026-10-01', 40_000_000);
    registrarMovimento(banco, COMPRA_1, T1);
    expect(precoAtual(banco)?.origem).toBe('manual');
    expect(precoAtual(banco)?.precoCentavos).toBe(40_000_000);
  });

  it('manual sobrescreve implícito e api do mesmo dia', () => {
    registrarMovimento(banco, COMPRA_1, T1);
    salvarPrecoAutomatico(banco, '2026-10-01', 45_000_000);
    definirPrecoManual(banco, '2026-10-01', 41_000_000);
    expect(precoAtual(banco)).toEqual({
      precoCentavos: 41_000_000,
      data: '2026-10-01',
      origem: 'manual',
    });
  });

  it('salvar automático não mexe em dia com preço manual', () => {
    definirPrecoManual(banco, '2026-10-01', 40_000_000);
    salvarPrecoAutomatico(banco, '2026-10-01', 99_000_000);
    expect(precoAtual(banco)?.precoCentavos).toBe(40_000_000);
  });

  it('precoAtual usa o dia mais recente e, no mesmo dia, manual > api > implícito', () => {
    registrarMovimento(banco, COMPRA_1, T1);
    salvarPrecoAutomatico(banco, '2026-10-02', 50_000_000);
    definirPrecoManual(banco, '2026-10-01', 42_000_000);
    expect(precoAtual(banco)).toEqual({
      precoCentavos: 50_000_000,
      data: '2026-10-02',
      origem: 'api',
    });
    definirPrecoManual(banco, '2026-10-02', 52_000_000);
    expect(precoAtual(banco)?.origem).toBe('manual');
    expect(banco.db.select().from(btcPrecos).all()).toHaveLength(2);
  });

  it('definir preço manual valida o valor', () => {
    expect(() => definirPrecoManual(banco, '2026-10-01', 0)).toThrow(ErroDeNegocio);
    expect(() => definirPrecoManual(banco, 'ontem', 100)).toThrow(ErroDeNegocio);
  });
});

describe('busca automática do preço', () => {
  it('sucesso grava o preço de hoje como api', async () => {
    const buscar = buscarFalso(() => respostaJson({ bitcoin: { brl: 500000.5 } }));
    const r = await buscarPrecoAutomatico(banco, buscar);
    expect(r.ok).toBe(true);
    expect(r.mensagem).toContain('atualizado');
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(precoAtual(banco)).toEqual({ precoCentavos: 50_000_050, data: hoje(), origem: 'api' });
  });

  it('falha de rede vira ok: false sem lançar e sem gravar nada', async () => {
    const buscar = buscarFalso(() => {
      throw new TypeError('fetch failed');
    });
    const r = await buscarPrecoAutomatico(banco, buscar);
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/Não foi possível/);
    expect(precoAtual(banco)).toBeNull();
  });

  it('HTTP de erro vira ok: false', async () => {
    const buscar = buscarFalso(() => respostaJson({}, 503));
    const r = await buscarPrecoAutomatico(banco, buscar);
    expect(r.ok).toBe(false);
    expect(precoAtual(banco)).toBeNull();
  });

  it('timeout de 5 segundos vira ok: false mesmo se a API nunca responde', async () => {
    vi.useFakeTimers();
    const buscar = buscarFalso(() => new Promise<Response>(() => {}));
    const pendente = buscarPrecoAutomatico(banco, buscar);
    await vi.advanceTimersByTimeAsync(5000);
    const r = await pendente;
    expect(r.ok).toBe(false);
    expect(precoAtual(banco)).toBeNull();
  });

  it('resposta inválida vira ok: false', async () => {
    const formatos: unknown[] = [
      {},
      { bitcoin: {} },
      { bitcoin: { brl: 'muito' } },
      { bitcoin: { brl: -1 } },
      null,
    ];
    for (const corpo of formatos) {
      const r = await buscarPrecoAutomatico(
        banco,
        buscarFalso(() => respostaJson(corpo)),
      );
      expect(r.ok).toBe(false);
    }
    const texto = await buscarPrecoAutomatico(
      banco,
      buscarFalso(() => new Response('<html>oops</html>', { status: 200 })),
    );
    expect(texto.ok).toBe(false);
    expect(precoAtual(banco)).toBeNull();
  });

  it('com preço manual de hoje não chama a API', async () => {
    definirPrecoManual(banco, hoje(), 40_000_000);
    const buscar = buscarFalso(() => respostaJson({ bitcoin: { brl: 1 } }));
    const r = await buscarPrecoAutomatico(banco, buscar);
    expect(r.ok).toBe(true);
    expect(buscar).not.toHaveBeenCalled();
    expect(precoAtual(banco)?.origem).toBe('manual');
  });
});

describe('painel e patrimônio', () => {
  it('painelBitcoin reúne posição, preço, movimentos e evolução', () => {
    registrarMovimento(banco, COMPRA_1, T1);
    definirPrecoManual(banco, '2026-10-02', 60_000_000);
    const p = painelBitcoin(banco);
    expect(p.posicao.sats).toBe(100_000);
    expect(p.posicao.valorAtualCentavos).toBe(60_000);
    expect(p.preco?.origem).toBe('manual');
    expect(p.movimentos).toHaveLength(1);
    expect(p.evolucao.length).toBeGreaterThan(0);
  });

  it('o patrimônio do painel inclui o valor do bitcoin', () => {
    registrarMovimento(banco, COMPRA_1, T1);
    definirPrecoManual(banco, '2026-10-02', 60_000_000);
    const painel = montarPainel(banco, '2026-10', '2026-10-15');
    expect(painel.patrimonio.bitcoinCentavos).toBe(60_000);
    expect(painel.patrimonio.liquidoCentavos).toBe(60_000);
  });
});

describe('ordem cronológica (revisão)', () => {
  it('recusa venda com data anterior à compra', () => {
    registrarMovimento(banco, { sats: 1000, valorCentavos: 0, data: '2026-10-10' }, T1);
    expect(() =>
      registrarMovimento(banco, { sats: -500, valorCentavos: 0, data: '2026-10-01' }, T1),
    ).toThrow(ErroDeNegocio);
    expect(() => painelBitcoin(banco)).not.toThrow();
  });

  it('recusa remover compra anterior a uma venda que dependia dela', () => {
    const compra = registrarMovimento(
      banco,
      { sats: 1000, valorCentavos: 0, data: '2026-10-01' },
      T1,
    );
    registrarMovimento(banco, { sats: -800, valorCentavos: 0, data: '2026-10-02' }, T1);
    registrarMovimento(banco, { sats: 1000, valorCentavos: 0, data: '2026-10-05' }, T1);
    // O total (1200) fecha sem a primeira compra, mas no dia 02 a venda ficaria sem sats.
    expect(() => removerMovimento(banco, compra.id, T2)).toThrow(ErroDeNegocio);
    expect(() => painelBitcoin(banco)).not.toThrow();
  });
});

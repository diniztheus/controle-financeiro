import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hoje } from '../../src/lib/dominio/datas';
import type { Banco } from '../../src/lib/server/db/conexao';
import {
  atualizarPrecoSeLigado,
  definirPrecoManual,
  gravarOpcaoPrecoAutomatico,
  lerOpcaoPrecoAutomatico,
  precoAtual,
  registrarMovimento,
  removerMovimento,
  ultimaBuscaAutomatica,
} from '../../src/lib/server/servicos/bitcoin';
import { bancoEmMemoria } from './ajuda-banco';

let banco: Banco;
beforeEach(() => {
  banco = bancoEmMemoria();
});
afterEach(() => {
  banco.sqlite.close();
});

const AGORA = new Date('2026-10-19T14:05:00Z');
const COMPRA = { sats: 100_000, valorCentavos: 50_000, data: '2026-10-01' };

/** Resposta falsa de fetch, no formato da API pública (sem internet). */
function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** `fetch` falso: nunca toca a internet. */
function buscarFalso(
  fazer: () => Promise<Response> | Response = () => respostaJson({ bitcoin: { brl: 500000 } }),
) {
  return vi.fn(async () => fazer()) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('atualização automática do preço do bitcoin', () => {
  it('vem ligada por padrão', () => {
    expect(lerOpcaoPrecoAutomatico(banco)).toBe(true);
  });

  it('opção desligada não chama buscar', async () => {
    registrarMovimento(banco, COMPRA, AGORA);
    gravarOpcaoPrecoAutomatico(banco, false);
    const buscar = buscarFalso();

    const r = await atualizarPrecoSeLigado(banco, buscar, AGORA);

    expect(r).toEqual({ feito: false, motivo: 'desligado' });
    expect(buscar).not.toHaveBeenCalled();
    expect(ultimaBuscaAutomatica(banco)).toBeNull();
  });

  it('sem movimentos não chama buscar (nem com a opção ligada)', async () => {
    const buscar = buscarFalso();

    const r = await atualizarPrecoSeLigado(banco, buscar, AGORA);

    expect(r).toEqual({ feito: false, motivo: 'sem-movimentos' });
    expect(buscar).not.toHaveBeenCalled();
  });

  it('movimento que está na lixeira não conta como movimento', async () => {
    const mov = registrarMovimento(banco, COMPRA, AGORA);
    removerMovimento(banco, mov.id, AGORA);
    const buscar = buscarFalso();

    const r = await atualizarPrecoSeLigado(banco, buscar, AGORA);

    expect(r).toEqual({ feito: false, motivo: 'sem-movimentos' });
    expect(buscar).not.toHaveBeenCalled();
  });

  it('ligada com movimentos chama a API, grava o preço e a hora da busca', async () => {
    registrarMovimento(banco, COMPRA, AGORA);
    const buscar = buscarFalso(() => respostaJson({ bitcoin: { brl: 500000 } }));

    const r = await atualizarPrecoSeLigado(banco, buscar, AGORA);

    expect(buscar).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ feito: true, ok: true });
    expect(precoAtual(banco)).toMatchObject({
      precoCentavos: 50_000_000,
      data: hoje(),
      origem: 'api',
    });
    expect(ultimaBuscaAutomatica(banco)).toBe(AGORA.toISOString());
  });

  it('falha da API não grava hora e não lança', async () => {
    registrarMovimento(banco, COMPRA, AGORA);
    const buscar = buscarFalso(() => respostaJson({}, 500));

    const r = await atualizarPrecoSeLigado(banco, buscar, AGORA);

    expect(buscar).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ feito: true, ok: false });
    expect(ultimaBuscaAutomatica(banco)).toBeNull();
  });

  it('preço manual do dia prevalece: não busca e mantém o manual', async () => {
    registrarMovimento(banco, COMPRA, AGORA);
    definirPrecoManual(banco, hoje(AGORA), 40_000_000);
    const buscar = buscarFalso();

    const r = await atualizarPrecoSeLigado(banco, buscar, AGORA);

    expect(buscar).not.toHaveBeenCalled();
    expect(r).toEqual({ feito: false, motivo: 'manual-hoje' });
    expect(precoAtual(banco)).toMatchObject({ precoCentavos: 40_000_000, origem: 'manual' });
    // Não houve busca de verdade: a hora da última busca não muda.
    expect(ultimaBuscaAutomatica(banco)).toBeNull();
  });
});

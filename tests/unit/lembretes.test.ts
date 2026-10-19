import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../../src/lib/server/db/conexao';
import {
  contasDesatualizadas as contasDesatualizadasDoDominio,
  diasEntre,
} from '../../src/lib/dominio/lembretes';
import { atualizarSaldo, criarConta, removerConta } from '../../src/lib/server/servicos/contas';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import {
  contasDesatualizadas,
  lerLembreteSaldoDias,
  salvarLembreteSaldoDias,
} from '../../src/lib/server/servicos/lembretes';
import { bancoEmMemoria } from './ajuda-banco';

let banco: Banco;
beforeEach(() => {
  banco = bancoEmMemoria();
});
afterEach(() => {
  banco.sqlite.close();
});

const HOJE = '2026-10-19';

/** Meio-dia UTC: o dia local é o mesmo em qualquer fuso razoável. */
const em = (dia: string) => new Date(`${dia}T12:00:00Z`);

describe('diasEntre e regra pura', () => {
  it('conta dias de calendário, inclusive atravessando meses', () => {
    expect(diasEntre('2026-10-01', '2026-10-19')).toBe(18);
    expect(diasEntre('2026-02-27', '2026-03-01')).toBe(2);
    expect(diasEntre('2026-10-19', '2026-10-19')).toBe(0);
  });

  it('o limite exato não avisa; acima dele avisa', () => {
    const contas = [
      { id: 'a', nome: 'Exato', tipo: 'corrente' as const, ultimaAtualizacao: '2026-10-12' },
      { id: 'b', nome: 'Acima', tipo: 'corrente' as const, ultimaAtualizacao: '2026-10-11' },
    ];
    const r = contasDesatualizadasDoDominio(contas, HOJE, 7);
    expect(r.map((c) => c.nome)).toEqual(['Acima']);
    expect(r[0]!.diasSemAtualizar).toBe(8);
  });

  it('limite 0 desliga', () => {
    const contas = [
      { id: 'a', nome: 'Antiga', tipo: 'corrente' as const, ultimaAtualizacao: '2026-01-01' },
    ];
    expect(contasDesatualizadasDoDominio(contas, HOJE, 0)).toEqual([]);
  });
});

describe('contasDesatualizadas (serviço)', () => {
  it('usa 7 dias por padrão e aceita de 0 a 90', () => {
    expect(lerLembreteSaldoDias(banco)).toBe(7);
    expect(salvarLembreteSaldoDias(banco, 0)).toBe(0);
    expect(lerLembreteSaldoDias(banco)).toBe(0);
    expect(salvarLembreteSaldoDias(banco, 90)).toBe(90);
    expect(() => salvarLembreteSaldoDias(banco, 91)).toThrow(ErroDeNegocio);
    expect(() => salvarLembreteSaldoDias(banco, -1)).toThrow(ErroDeNegocio);
    expect(() => salvarLembreteSaldoDias(banco, 2.5)).toThrow(ErroDeNegocio);
  });

  it('mostra só as contas acima do limite, da mais velha para a mais nova', () => {
    const nubank = criarConta(
      banco,
      { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 100 },
      em('2026-10-01'),
    );
    criarConta(banco, { nome: 'Itaú', tipo: 'corrente', saldoCentavos: 100 }, em('2026-10-15'));
    const poupanca = criarConta(
      banco,
      { nome: 'Poupança', tipo: 'poupanca', saldoCentavos: 100 },
      em('2026-10-02'),
    );
    criarConta(banco, { nome: 'Caixa', tipo: 'corrente', saldoCentavos: 100 }, em('2026-10-12'));
    // Atualizada recentemente, mesmo tendo um registro antigo: vale o mais recente.
    const carteira = criarConta(
      banco,
      { nome: 'Carteira', tipo: 'dinheiro', saldoCentavos: 100 },
      em('2026-09-01'),
    );
    atualizarSaldo(banco, carteira.id, 200, em('2026-10-18'));

    const r = contasDesatualizadas(banco, HOJE);
    expect(r.map((c) => c.id)).toEqual([nubank.id, poupanca.id]);
    expect(r[0]).toMatchObject({
      nome: 'Nubank',
      tipo: 'corrente',
      ultimaAtualizacao: '2026-10-01',
      diasSemAtualizar: 18,
    });
    expect(r[1]!.diasSemAtualizar).toBe(17);
  });

  it('configuração 0 desliga: lista vazia', () => {
    criarConta(banco, { nome: 'Antiga', tipo: 'corrente', saldoCentavos: 0 }, em('2026-01-01'));
    salvarLembreteSaldoDias(banco, 0);
    expect(contasDesatualizadas(banco, HOJE)).toEqual([]);
  });

  it('conta na lixeira não aparece', () => {
    const c = criarConta(
      banco,
      { nome: 'Velha', tipo: 'corrente', saldoCentavos: 0 },
      em('2026-01-01'),
    );
    expect(contasDesatualizadas(banco, HOJE).map((x) => x.id)).toEqual([c.id]);
    removerConta(banco, c.id, em('2026-10-02'));
    expect(contasDesatualizadas(banco, HOJE)).toEqual([]);
  });

  it('sem contas, lista vazia', () => {
    expect(contasDesatualizadas(banco, HOJE)).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  compararCategorias,
  compararComMedia,
  compararTaxa,
  maisCairam,
  maisSubiram,
  mediaArredondada,
  percentualDe,
  type GastoDoMes,
} from '../../src/lib/dominio/resumoMes';
import type { Banco } from '../../src/lib/server/db/conexao';
import { criarCategoria } from '../../src/lib/server/servicos/categorias';
import { lancarGasto } from '../../src/lib/server/servicos/gastos';
import { lancarReceita } from '../../src/lib/server/servicos/receitas';
import { cartaoResumoDoPainel, resumoDoMes } from '../../src/lib/server/servicos/resumoMes';
import { bancoEmMemoria } from './ajuda-banco';

let banco: Banco;
let categorias: Map<string, string>;

beforeEach(() => {
  banco = bancoEmMemoria();
  categorias = new Map();
});
afterEach(() => banco.sqlite.close());

/** Id da categoria pelo nome (cria na primeira vez). */
function categoria(nome: string): string {
  let id = categorias.get(nome);
  if (!id) {
    id = criarCategoria(banco, { nome, cor: null }).id;
    categorias.set(nome, id);
  }
  return id;
}

function gasto(categoriaId: string, valorCentavos: number, data: string) {
  lancarGasto(banco, {
    valorCentavos,
    descricao: `Gasto ${data}`,
    categoriaId,
    data,
    contaId: null,
    meio: 'conta',
  });
}

describe('dominio: médias e percentuais', () => {
  it('média arredonda meio para cima e ignora meses sem dados', () => {
    expect(mediaArredondada(1000, 3)).toBe(333);
    expect(mediaArredondada(1001, 2)).toBe(501);
    expect(mediaArredondada(1000, 0)).toBeNull();
  });

  it('percentual sem referência é null; com sinal quando é negativo', () => {
    expect(percentualDe(50, 0)).toBeNull();
    expect(percentualDe(150, 100)).toBe(150);
    expect(percentualDe(-300, 600)).toBe(-50);
  });

  it('comparação sem meses de referência é null', () => {
    expect(compararComMedia(500, 0, 0)).toBeNull();
    expect(compararComMedia(500, 900, 3)).toMatchObject({
      mediaCentavos: 300,
      diferencaCentavos: 200,
      percentual: 67,
    });
  });

  it('taxa média é a taxa agregada e a diferença vem em pontos', () => {
    // Meses anteriores: sobra 200 de entradas 1000 (20%).
    expect(compararTaxa(25, 200, 1000, 2)).toEqual({
      atualPercentual: 25,
      mediaPercentual: 20,
      diferencaPontos: 5,
      meses: 2,
    });
    expect(compararTaxa(10, 0, 0, 2)).toBeNull();
  });
});

describe('dominio: categorias que mais subiram e caíram', () => {
  const g = (id: string, nome: string, valorCentavos: number): GastoDoMes => ({
    data: '2026-09-01',
    descricao: null,
    valorCentavos,
    categoriaId: id,
    categoriaNome: nome,
    categoriaCor: null,
  });

  it('top 3 que mais subiram em reais (só os que subiram), ordenado do maior aumento', () => {
    // Os três meses anteriores iguais: a média de cada categoria é o valor de um mês.
    const anteriores = [1, 2, 3].flatMap(() => [
      g('m', 'Mercado', 500),
      g('l', 'Lazer', 100),
      g('t', 'Transporte', 200),
      g('r', 'Restaurante', 200),
      g('c', 'Casa', 300),
    ]);
    const atuais = [
      g('m', 'Mercado', 1000),
      g('l', 'Lazer', 900),
      g('t', 'Transporte', 300),
      g('r', 'Restaurante', 250),
      g('c', 'Casa', 0),
    ];
    const cats = compararCategorias(atuais, anteriores, 3);
    expect(maisSubiram(cats).map((c) => c.nome)).toEqual(['Lazer', 'Mercado', 'Transporte']);
    expect(maisSubiram(cats)[0]).toMatchObject({ diferencaCentavos: 800, percentual: 800 });
    expect(maisCairam(cats).map((c) => c.nome)).toEqual(['Casa']);
  });

  it('sem histórico, nenhuma categoria entra em subiu nem em caiu', () => {
    const cats = compararCategorias([g('m', 'Mercado', 1000)], [], 0);
    expect(cats[0]!.diferencaCentavos).toBeNull();
    expect(maisSubiram(cats)).toEqual([]);
    expect(maisCairam(cats)).toEqual([]);
  });
});

describe('resumoDoMes', () => {
  it('entradas contam só as confirmadas; a prevista vai para o aviso', () => {
    const salario = lancarReceita(banco, {
      categoria: 'Salário',
      data: '2026-10-05',
      valorCentavos: 500_000,
    });
    expect(salario.confirmadaEm).not.toBeNull();
    lancarReceita(banco, {
      categoria: 'Freelance',
      data: '2026-10-20',
      valorCentavos: 80_000,
      recebida: false,
    });
    gasto(categoria('Mercado'), 120_000, '2026-10-07');

    const r = resumoDoMes(banco, '2026-10');
    expect(r.entradasCentavos).toBe(500_000);
    expect(r.saidasCentavos).toBe(120_000);
    expect(r.sobraCentavos).toBe(380_000);
    expect(r.taxaPoupancaPercentual).toBe(76);
    expect(r.previstas).toEqual({ quantidade: 1, totalCentavos: 80_000 });
    expect(r.maiorGasto).toMatchObject({ valorCentavos: 120_000, data: '2026-10-07' });
  });

  it('mês sem histórico: zeros, sem comparação e sem categorias', () => {
    const r = resumoDoMes(banco, '2017-03');
    expect(r.entradasCentavos).toBe(0);
    expect(r.saidasCentavos).toBe(0);
    expect(r.sobraCentavos).toBe(0);
    expect(r.taxaPoupancaPercentual).toBeNull();
    expect(r.quantidadeLancamentos).toBe(0);
    expect(r.comparacao).toEqual({ entradas: null, saidas: null, sobra: null, taxa: null });
    expect(r.categorias).toEqual([]);
    expect(r.maisSubiram).toEqual([]);
    expect(r.maisCairam).toEqual([]);
    expect(r.maiorGasto).toBeNull();
    expect(r.previstas).toEqual({ quantidade: 0, totalCentavos: 0 });
  });

  it('compara com a média só dos meses anteriores que tinham dados', () => {
    // Só agosto tem gasto (1000); julho e junho ficam vazios e não puxam a média.
    gasto(categoria('Mercado'), 100_000, '2026-08-15');
    gasto(categoria('Mercado'), 150_000, '2026-10-15');
    const r = resumoDoMes(banco, '2026-10');
    expect(r.comparacao.saidas).toMatchObject({
      atualCentavos: 150_000,
      mediaCentavos: 100_000,
      meses: 1,
      diferencaCentavos: 50_000,
      percentual: 50,
    });
    expect(r.comparacao.entradas).toBeNull();
  });
});

describe('cartaoResumoDoPainel', () => {
  beforeEach(() => {
    const mercado = categoria('Mercado');
    lancarReceita(banco, { categoria: 'Salário', data: '2026-09-05', valorCentavos: 400_000 });
    gasto(mercado, 90_000, '2026-09-10');
  });

  it('dia 5 devolve o resumo do mês anterior', () => {
    expect(cartaoResumoDoPainel(banco, '2026-10-05')).toEqual({
      mes: '2026-09',
      entradasCentavos: 400_000,
      saidasCentavos: 90_000,
      sobraCentavos: 310_000,
      maisSubiu: null,
    });
  });

  it('dia 15 devolve null', () => {
    expect(cartaoResumoDoPainel(banco, '2026-10-15')).toBeNull();
  });

  it('dia 5 sem nada no mês anterior devolve null', () => {
    expect(cartaoResumoDoPainel(banco, '2026-11-05')).toBeNull();
  });
});

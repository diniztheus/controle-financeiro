import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../../src/lib/server/db/conexao';
import { criarCategoria } from '../../src/lib/server/servicos/categorias';
import { atualizarSaldo, criarConta, obterConta } from '../../src/lib/server/servicos/contas';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import { lancarGasto } from '../../src/lib/server/servicos/gastos';
import { montarPainel } from '../../src/lib/server/servicos/painel';
import { fluxoDeCaixa } from '../../src/lib/server/servicos/relatorios';
import {
  editarReceita,
  lancarReceita,
  obterReceita,
  receitasDoMes,
  receitasNaLixeira,
  removerReceita,
  restaurarReceita,
  totalReceitasDoMes,
  ultimaCategoriaReceitaUsada,
} from '../../src/lib/server/servicos/receitas';
import { bancoEmMemoria } from './ajuda-banco';

let banco: Banco;
beforeEach(() => {
  banco = bancoEmMemoria();
});
afterEach(() => {
  banco.sqlite.close();
});

const T1 = new Date('2026-10-01T12:00:00Z');
const T2 = new Date('2026-10-02T12:00:00Z');
const AGORA = new Date('2026-10-15T12:00:00Z');

function receita(over: Partial<Parameters<typeof lancarReceita>[1]> = {}) {
  return {
    descricao: 'Salário de outubro',
    categoria: 'Salário',
    data: '2026-10-05',
    valorCentavos: 300000,
    contaId: null,
    observacao: null,
    ...over,
  };
}

describe('receitas: lançamento', () => {
  it('lançar registra a receita e não altera o saldo da conta', () => {
    const conta = criarConta(
      banco,
      { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 150000 },
      T1,
    );
    const r = lancarReceita(banco, receita({ contaId: conta.id }), T1);
    expect(obterReceita(banco, r.id)?.valorCentavos).toBe(300000);
    expect(obterConta(banco, conta.id)?.saldoCentavos).toBe(150000);
  });

  it('descrição e observação vazias viram null; campos opcionais ficam de fora', () => {
    const r = lancarReceita(
      banco,
      { categoria: 'Outros', data: '2026-10-03', valorCentavos: 500, descricao: '   ' },
      T1,
    );
    expect(r.descricao).toBeNull();
    expect(r.observacao).toBeNull();
    expect(r.contaId).toBeNull();
  });

  it('recusa categoria fora da lista, data inválida, valor não positivo e conta inexistente', () => {
    expect(() => lancarReceita(banco, receita({ categoria: 'Loteria' }), T1)).toThrow(
      ErroDeNegocio,
    );
    expect(() => lancarReceita(banco, receita({ data: '2026-02-30' }), T1)).toThrow(ErroDeNegocio);
    expect(() => lancarReceita(banco, receita({ valorCentavos: 0 }), T1)).toThrow(ErroDeNegocio);
    expect(() => lancarReceita(banco, receita({ valorCentavos: -5 }), T1)).toThrow(ErroDeNegocio);
    expect(() => lancarReceita(banco, receita({ valorCentavos: 1.5 }), T1)).toThrow(ErroDeNegocio);
    expect(() => lancarReceita(banco, receita({ contaId: 'nao-existe' }), T1)).toThrow(
      ErroDeNegocio,
    );
  });

  it('recusa conta que está na lixeira', () => {
    const conta = criarConta(banco, { nome: 'Carteira', tipo: 'dinheiro', saldoCentavos: 0 }, T1);
    banco.sqlite
      .prepare("UPDATE contas SET removido_em = '2026-10-01T13:00:00.000Z' WHERE id = ?")
      .run(conta.id);
    expect(() => lancarReceita(banco, receita({ contaId: conta.id }), T1)).toThrow(ErroDeNegocio);
  });
});

describe('receitas: mês, edição e lixeira', () => {
  it('lista do mês mais recente primeiro, com a conta e o total', () => {
    const conta = criarConta(banco, { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 0 }, T1);
    const a = lancarReceita(banco, receita({ data: '2026-10-03', valorCentavos: 1000 }), T1);
    const b = lancarReceita(
      banco,
      receita({ data: '2026-10-09', valorCentavos: 2500, contaId: conta.id }),
      T2,
    );
    lancarReceita(banco, receita({ data: '2026-09-30', valorCentavos: 9999 }), T2);

    const lista = receitasDoMes(banco, '2026-10');
    expect(lista.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(lista[0]).toMatchObject({ contaNome: 'Nubank', contaRemovida: false });
    expect(lista[1]).toMatchObject({ contaNome: null, contaRemovida: false });
    expect(totalReceitasDoMes(banco, '2026-10')).toBe(3500);
    expect(totalReceitasDoMes(banco, '2026-11')).toBe(0);
  });

  it('editar troca valor e data (inclusive de mês) e registra a alteração', () => {
    const r = lancarReceita(banco, receita(), T1);
    const editada = editarReceita(
      banco,
      r.id,
      receita({ data: '2026-09-20', valorCentavos: 12345, categoria: 'Freelance' }),
      T2,
    );
    expect(editada).toMatchObject({
      valorCentavos: 12345,
      data: '2026-09-20',
      categoria: 'Freelance',
    });
    expect(editada.atualizadoEm).toBe(T2.toISOString());
    expect(totalReceitasDoMes(banco, '2026-10')).toBe(0);
    expect(totalReceitasDoMes(banco, '2026-09')).toBe(12345);
  });

  it('editar receita inexistente ou na lixeira recusa', () => {
    const r = lancarReceita(banco, receita(), T1);
    removerReceita(banco, r.id, T1);
    expect(() => editarReceita(banco, r.id, receita(), T2)).toThrow(ErroDeNegocio);
    expect(() => editarReceita(banco, 'nao-existe', receita(), T2)).toThrow(ErroDeNegocio);
  });

  it('lixeira: some do mês, aparece na lixeira e volta ao restaurar', () => {
    const r = lancarReceita(banco, receita(), T1);
    removerReceita(banco, r.id, T2);
    expect(receitasDoMes(banco, '2026-10')).toEqual([]);
    expect(receitasNaLixeira(banco).map((x) => [x.id, x.valorCentavos, x.removidoEm])).toEqual([
      [r.id, 300000, T2.toISOString()],
    ]);
    expect(() => removerReceita(banco, r.id, T2)).toThrow(ErroDeNegocio);

    restaurarReceita(banco, r.id);
    expect(receitasNaLixeira(banco)).toEqual([]);
    expect(totalReceitasDoMes(banco, '2026-10')).toBe(300000);
    // Restaurar de novo só devolve a receita, sem erro.
    expect(restaurarReceita(banco, r.id).id).toBe(r.id);
    expect(() => restaurarReceita(banco, 'nao-existe')).toThrow(ErroDeNegocio);
  });

  it('última categoria usada ignora receitas na lixeira', () => {
    expect(ultimaCategoriaReceitaUsada(banco)).toBeNull();
    lancarReceita(banco, receita({ categoria: 'Presente' }), T1);
    const b = lancarReceita(banco, receita({ categoria: 'Reembolso' }), T2);
    expect(ultimaCategoriaReceitaUsada(banco)).toBe('Reembolso');
    removerReceita(banco, b.id, T2);
    expect(ultimaCategoriaReceitaUsada(banco)).toBe('Presente');
  });
});

describe('receitas no painel e no fluxo', () => {
  it('painel sem receitas: entradas zero, saídas são os gastos do mês', () => {
    const cat = criarCategoria(banco, { nome: 'Mercado', cor: null }, T1);
    lancarGasto(
      banco,
      {
        valorCentavos: 50000,
        descricao: null,
        categoriaId: cat.id,
        data: '2026-10-05',
        contaId: null,
      },
      T1,
    );
    const p = montarPainel(banco, '2026-10', '2026-10-15');
    expect(p.fluxo).toEqual({
      entradasCentavos: 0,
      saidasCentavos: 50000,
      saldoCentavos: -50000,
      taxaPoupancaPercentual: null,
      quantidadeReceitas: 0,
    });
  });

  it('painel com receitas: sobra e taxa de poupança do mês', () => {
    const cat = criarCategoria(banco, { nome: 'Mercado', cor: null }, T1);
    lancarGasto(
      banco,
      {
        valorCentavos: 50000,
        descricao: null,
        categoriaId: cat.id,
        data: '2026-10-05',
        contaId: null,
      },
      T1,
    );
    lancarReceita(banco, receita({ data: '2026-10-03', valorCentavos: 300000 }), T1);
    lancarReceita(banco, receita({ data: '2026-10-04', valorCentavos: 100000 }), T1);
    lancarReceita(banco, receita({ data: '2026-09-04', valorCentavos: 777777 }), T1);

    const p = montarPainel(banco, '2026-10', '2026-10-15');
    expect(p.fluxo).toMatchObject({
      entradasCentavos: 400000,
      saidasCentavos: 50000,
      saldoCentavos: 350000,
      taxaPoupancaPercentual: 87.5,
      quantidadeReceitas: 2,
    });
    // O resto do painel continua igual: o gasto do mês não muda por causa das receitas.
    expect(p.totalMesCentavos).toBe(50000);
  });
});

describe('fluxo de caixa', () => {
  it('meses vazios aparecem com zero e sem taxa de poupança', () => {
    const f = fluxoDeCaixa(banco, 3, AGORA);
    expect(f.meses.map((m) => m.mes)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(f.meses.every((m) => m.entradasCentavos === 0 && m.saidasCentavos === 0)).toBe(true);
    expect(f.meses.every((m) => m.taxaPoupancaPercentual === null)).toBe(true);
    expect(f.totais).toEqual({
      entradasCentavos: 0,
      saidasCentavos: 0,
      saldoCentavos: 0,
      taxaPoupancaPercentual: null,
    });
    expect(f.receitasPorCategoria).toEqual([]);
  });

  it('soma entradas e saídas por mês, com totais e receitas por categoria', () => {
    const cat = criarCategoria(banco, { nome: 'Mercado', cor: null }, T1);
    lancarReceita(banco, receita({ data: '2026-09-10', valorCentavos: 100000 }), T1);
    lancarGasto(
      banco,
      {
        valorCentavos: 40000,
        descricao: null,
        categoriaId: cat.id,
        data: '2026-09-12',
        contaId: null,
      },
      T1,
    );
    lancarGasto(
      banco,
      {
        valorCentavos: 10000,
        descricao: null,
        categoriaId: cat.id,
        data: '2026-10-02',
        contaId: null,
      },
      T1,
    );
    const removida = lancarReceita(banco, receita({ data: '2026-10-02', valorCentavos: 8000 }), T1);
    removerReceita(banco, removida.id, T2);

    const f = fluxoDeCaixa(banco, 3, AGORA);
    expect(f.meses[1]).toMatchObject({
      mes: '2026-09',
      entradasCentavos: 100000,
      saidasCentavos: 40000,
      saldoCentavos: 60000,
      taxaPoupancaPercentual: 60,
    });
    expect(f.meses[2]).toMatchObject({
      mes: '2026-10',
      entradasCentavos: 0,
      saidasCentavos: 10000,
    });
    expect(f.totais).toEqual({
      entradasCentavos: 100000,
      saidasCentavos: 50000,
      saldoCentavos: 50000,
      taxaPoupancaPercentual: 50,
    });
    expect(f.receitasPorCategoria).toEqual([
      { categoria: 'Salário', totalCentavos: 100000, percentual: 100 },
    ]);
  });

  it('recusa períodos fora de 1 a 60 meses', () => {
    expect(() => fluxoDeCaixa(banco, 0, AGORA)).toThrow(ErroDeNegocio);
    expect(() => fluxoDeCaixa(banco, 61, AGORA)).toThrow(ErroDeNegocio);
    expect(fluxoDeCaixa(banco, 60, AGORA).meses).toHaveLength(60);
  });
});

describe('receitas e saldo das contas', () => {
  it('atualizar o saldo informado não é afetado pelas receitas lançadas', () => {
    const conta = criarConta(
      banco,
      { nome: 'Poupança', tipo: 'poupanca', saldoCentavos: 1000 },
      T1,
    );
    lancarReceita(banco, receita({ contaId: conta.id, valorCentavos: 5000 }), T1);
    atualizarSaldo(banco, conta.id, 2000, T2);
    expect(obterConta(banco, conta.id)?.saldoCentavos).toBe(2000);
  });
});

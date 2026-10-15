import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../../src/lib/server/db/conexao';
import { compras, contas, parcelas } from '../../src/lib/server/db/esquema';
import {
  arquivarCategoria,
  criarCategoria,
  editarCategoria,
  garantirCategoriasPadrao,
  listarCategorias,
  moverCategoria,
} from '../../src/lib/server/servicos/categorias';
import {
  atualizarSaldo,
  contasNaLixeira,
  criarConta,
  editarConta,
  historicoDeSaldos,
  listarContas,
  moverConta,
  removerConta,
  restaurarConta,
  totalDasContas,
} from '../../src/lib/server/servicos/contas';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import {
  editarGasto,
  gastosNaLixeira,
  lancamentosDoMes,
  lancarGasto,
  removerGasto,
  restaurarGasto,
  ultimaCategoriaUsada,
} from '../../src/lib/server/servicos/gastos';
import { definirLimitePadrao, limiteDoMes } from '../../src/lib/server/servicos/limite';
import { montarPainel } from '../../src/lib/server/servicos/painel';
import { bancoEmMemoria } from './ajuda-banco';

let banco: Banco;
beforeEach(() => {
  banco = bancoEmMemoria();
});
afterEach(() => banco.sqlite.close());

const T1 = new Date('2026-10-01T12:00:00Z');
const T2 = new Date('2026-10-02T12:00:00Z');
const T3 = new Date('2026-10-03T12:00:00Z');

function categoria(nome = 'Mercado') {
  return criarCategoria(banco, { nome, cor: null });
}

describe('contas', () => {
  it('criar grava o saldo no histórico e respeita a ordem de criação', () => {
    const a = criarConta(banco, { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 150000 }, T1);
    const b = criarConta(banco, { nome: 'Carteira', tipo: 'dinheiro', saldoCentavos: 5000 }, T2);
    expect(listarContas(banco).map((c) => c.id)).toEqual([a.id, b.id]);
    expect(historicoDeSaldos(banco, a.id).map((h) => h.saldoCentavos)).toEqual([150000]);
    expect(totalDasContas(banco)).toEqual({
      totalCentavos: 155000,
      quantidade: 2,
      atualizadoEm: T2.toISOString(),
    });
  });

  it('atualizar saldo guarda o anterior; editar sem mudar saldo não duplica histórico', () => {
    const a = criarConta(banco, { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 100 }, T1);
    atualizarSaldo(banco, a.id, -2550, T2);
    editarConta(banco, a.id, { nome: 'Nu', tipo: 'poupanca', saldoCentavos: -2550 }, T3);
    const h = historicoDeSaldos(banco, a.id);
    expect(h.map((x) => x.saldoCentavos)).toEqual([-2550, 100]);
    expect(listarContas(banco)[0]).toMatchObject({ nome: 'Nu', tipo: 'poupanca' });
  });

  it('nome repetido é recusado (sem diferenciar maiúsculas)', () => {
    criarConta(banco, { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 0 });
    expect(() =>
      criarConta(banco, { nome: ' nubank ', tipo: 'corrente', saldoCentavos: 0 }),
    ).toThrow(ErroDeNegocio);
  });

  it('lixeira: remover esconde, restaurar devolve, sem apagar histórico', () => {
    const a = criarConta(banco, { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 100 });
    removerConta(banco, a.id);
    expect(listarContas(banco)).toHaveLength(0);
    expect(contasNaLixeira(banco).map((c) => c.id)).toEqual([a.id]);
    expect(totalDasContas(banco).totalCentavos).toBe(0);
    restaurarConta(banco, a.id);
    expect(listarContas(banco)).toHaveLength(1);
    expect(historicoDeSaldos(banco, a.id)).toHaveLength(1);
    expect(() => removerConta(banco, 'nao-existe')).toThrow(ErroDeNegocio);
  });

  it('restaurar recusa se outra conta já usa o nome', () => {
    const a = criarConta(banco, { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 0 });
    removerConta(banco, a.id);
    criarConta(banco, { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 0 });
    expect(() => restaurarConta(banco, a.id)).toThrow(/Renomeie/);
  });

  it('mover troca de posição e para nas pontas', () => {
    const a = criarConta(banco, { nome: 'A', tipo: 'corrente', saldoCentavos: 0 }, T1);
    const b = criarConta(banco, { nome: 'B', tipo: 'corrente', saldoCentavos: 0 }, T2);
    moverConta(banco, b.id, -1);
    expect(listarContas(banco).map((c) => c.nome)).toEqual(['B', 'A']);
    moverConta(banco, b.id, -1);
    expect(listarContas(banco).map((c) => c.nome)).toEqual(['B', 'A']);
    moverConta(banco, b.id, 1);
    expect(listarContas(banco).map((c) => c.id)).toEqual([a.id, b.id]);
  });
});

describe('categorias', () => {
  it('padrão só na primeira vez, com cores da paleta', () => {
    garantirCategoriasPadrao(banco);
    garantirCategoriasPadrao(banco);
    const cats = listarCategorias(banco);
    expect(cats).toHaveLength(11);
    expect(cats[0]).toMatchObject({ nome: 'Alimentação', cor: 'c0', ordem: 0 });
    expect(cats[10]).toMatchObject({ nome: 'Outros', cor: 'c10' });
  });

  it('nome único sem diferenciar maiúsculas nem acentos maiúsculos', () => {
    criarCategoria(banco, { nome: 'Saúde', cor: null });
    expect(() => criarCategoria(banco, { nome: 'SAÚDE', cor: null })).toThrow(/Já existe/);
    expect(() => criarCategoria(banco, { nome: '  saúde ', cor: null })).toThrow(/Já existe/);
  });

  it('cor automática pega a próxima livre', () => {
    expect(categoria('A').cor).toBe('c0');
    expect(categoria('B').cor).toBe('c1');
    expect(criarCategoria(banco, { nome: 'C', cor: 'c7' }).cor).toBe('c7');
  });

  it('renomear e trocar a cor', () => {
    const c = categoria('Mercado');
    const e = editarCategoria(banco, c.id, { nome: 'Supermercado', cor: 'c4' });
    expect(e).toMatchObject({ nome: 'Supermercado', cor: 'c4' });
    categoria('Feira');
    expect(() => editarCategoria(banco, c.id, { nome: 'feira', cor: null })).toThrow(/Já existe/);
  });

  it('arquivar tira da lista, mas não a última ativa; criar arquivada avisa', () => {
    const a = categoria('A');
    const b = categoria('B');
    arquivarCategoria(banco, a.id, true);
    expect(listarCategorias(banco).map((c) => c.nome)).toEqual(['B']);
    expect(listarCategorias(banco, { incluirArquivadas: true }).map((c) => c.nome)).toEqual([
      'B',
      'A',
    ]);
    expect(() => arquivarCategoria(banco, b.id, true)).toThrow(/pelo menos uma/);
    expect(() => criarCategoria(banco, { nome: 'a', cor: null })).toThrow(/arquivada/);
    arquivarCategoria(banco, a.id, false);
    expect(listarCategorias(banco).map((c) => c.nome)).toEqual(['B', 'A']);
  });

  it('mover entre as ativas', () => {
    categoria('A');
    const b = categoria('B');
    moverCategoria(banco, b.id, -1);
    expect(listarCategorias(banco).map((c) => c.nome)).toEqual(['B', 'A']);
  });
});

describe('gastos', () => {
  it('lançar cria compra à vista com uma parcela no mês, sem mexer no saldo', () => {
    const conta = criarConta(banco, { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 100000 });
    const cat = categoria();
    const g = lancarGasto(banco, {
      valorCentavos: 4290,
      descricao: 'Feira',
      categoriaId: cat.id,
      data: '2026-10-15',
      contaId: conta.id,
    });
    expect(g).toMatchObject({ meio: 'conta', numParcelas: 1, valorTotalCentavos: 4290 });
    const ps = banco.db.select().from(parcelas).all();
    expect(ps).toMatchObject([
      { compraId: g.id, numero: 1, valorCentavos: 4290, mesCompetencia: '2026-10' },
    ]);
    expect(banco.db.select().from(contas).get()?.saldoCentavos).toBe(100000);
  });

  it('sem conta e sem descrição, como no app atual', () => {
    const cat = categoria();
    const g = lancarGasto(banco, {
      valorCentavos: 100,
      descricao: null,
      categoriaId: cat.id,
      data: '2026-10-15',
      contaId: null,
    });
    expect(g.contaId).toBeNull();
    expect(lancamentosDoMes(banco, '2026-10')[0]).toMatchObject({
      descricao: null,
      categoriaNome: 'Mercado',
      contaNome: null,
    });
  });

  it('recusa categoria arquivada, inexistente e conta na lixeira', () => {
    const cat = categoria('A');
    categoria('B');
    const conta = criarConta(banco, { nome: 'X', tipo: 'corrente', saldoCentavos: 0 });
    const base = { valorCentavos: 1, descricao: null, data: '2026-10-15', contaId: null };
    expect(() => lancarGasto(banco, { ...base, categoriaId: 'nada' })).toThrow(ErroDeNegocio);
    removerConta(banco, conta.id);
    expect(() => lancarGasto(banco, { ...base, categoriaId: cat.id, contaId: conta.id })).toThrow(
      /lixeira/,
    );
    arquivarCategoria(banco, cat.id, true);
    expect(() => lancarGasto(banco, { ...base, categoriaId: cat.id })).toThrow(/arquivada/);
    expect(banco.db.select().from(compras).all()).toHaveLength(0);
  });

  it('editar refaz a parcela no novo mês e aceita manter categoria arquivada', () => {
    const cat = categoria('A');
    categoria('B');
    const g = lancarGasto(banco, {
      valorCentavos: 1000,
      descricao: 'x',
      categoriaId: cat.id,
      data: '2026-10-31',
      contaId: null,
    });
    arquivarCategoria(banco, cat.id, true);
    editarGasto(banco, g.id, {
      valorCentavos: 2000,
      descricao: 'y',
      categoriaId: cat.id,
      data: '2026-11-01',
      contaId: null,
    });
    expect(lancamentosDoMes(banco, '2026-10')).toHaveLength(0);
    expect(lancamentosDoMes(banco, '2026-11')).toMatchObject([
      { valorCentavos: 2000, descricao: 'y', data: '2026-11-01' },
    ]);
    expect(banco.db.select().from(parcelas).all()).toHaveLength(1);
  });

  it('lixeira de gastos: some do mês e volta ao restaurar', () => {
    const cat = categoria();
    const g = lancarGasto(banco, {
      valorCentavos: 500,
      descricao: 'Pão',
      categoriaId: cat.id,
      data: '2026-10-10',
      contaId: null,
    });
    removerGasto(banco, g.id);
    expect(lancamentosDoMes(banco, '2026-10')).toHaveLength(0);
    expect(gastosNaLixeira(banco)).toMatchObject([{ id: g.id, descricao: 'Pão' }]);
    expect(() =>
      editarGasto(banco, g.id, {
        valorCentavos: 1,
        descricao: null,
        categoriaId: cat.id,
        data: '2026-10-10',
        contaId: null,
      }),
    ).toThrow(ErroDeNegocio);
    restaurarGasto(banco, g.id);
    expect(lancamentosDoMes(banco, '2026-10')).toHaveLength(1);
    expect(gastosNaLixeira(banco)).toHaveLength(0);
  });

  it('última categoria usada', () => {
    const a = categoria('A');
    const b = categoria('B');
    expect(ultimaCategoriaUsada(banco)).toBeNull();
    const base = { valorCentavos: 1, descricao: null, data: '2026-10-15', contaId: null };
    lancarGasto(banco, { ...base, categoriaId: a.id }, T1);
    lancarGasto(banco, { ...base, categoriaId: b.id }, T2);
    expect(ultimaCategoriaUsada(banco)).toBe(b.id);
    arquivarCategoria(banco, b.id, true);
    expect(ultimaCategoriaUsada(banco)).toBeNull();
  });

  it('compra parcelada (importada) aparece uma parcela por mês, com dia limitado ao mês', () => {
    const cat = categoria();
    const k = banco.sqlite;
    k.exec(
      `INSERT INTO cartoes (id, nome, limite_centavos, dia_fechamento, dia_vencimento) VALUES ('k', 'Visa', 0, 3, 10)`,
    );
    k.prepare(
      `INSERT INTO compras (id, descricao, categoria_id, data_compra, valor_total_centavos, meio, cartao_id, num_parcelas) VALUES ('c', 'TV', ?, '2026-01-31', 10000, 'cartao', 'k', 3)`,
    ).run(cat.id);
    for (const [n, v, m] of [
      [1, 3334, '2026-01'],
      [2, 3333, '2026-02'],
      [3, 3333, '2026-03'],
    ] as const) {
      k.prepare(
        `INSERT INTO parcelas (id, compra_id, numero, valor_centavos, mes_competencia) VALUES (?, 'c', ?, ?, ?)`,
      ).run(`p${n}`, n, v, m);
    }
    expect(lancamentosDoMes(banco, '2026-02')).toMatchObject([
      { data: '2026-02-28', parcela: 2, numParcelas: 3, valorCentavos: 3333, cartaoNome: 'Visa' },
    ]);
  });
});

describe('limite', () => {
  it('padrão vale para todo mês; zero remove', () => {
    expect(limiteDoMes(banco, '2026-10')).toBeNull();
    definirLimitePadrao(banco, 300000);
    expect(limiteDoMes(banco, '2026-10')).toBe(300000);
    definirLimitePadrao(banco, 250000);
    expect(limiteDoMes(banco, '2027-01')).toBe(250000);
    definirLimitePadrao(banco, 0);
    expect(limiteDoMes(banco, '2026-10')).toBeNull();
    expect(() => definirLimitePadrao(banco, -1)).toThrow(ErroDeNegocio);
  });
});

describe('painel do mês', () => {
  it('total, limite, categorias, dias e patrimônio só com contas', () => {
    criarConta(banco, { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 200000 });
    const a = categoria('Mercado');
    const b = categoria('Lazer');
    definirLimitePadrao(banco, 10000);
    const base = { descricao: null, contaId: null };
    lancarGasto(banco, { ...base, valorCentavos: 3000, categoriaId: a.id, data: '2026-10-02' });
    lancarGasto(banco, { ...base, valorCentavos: 6000, categoriaId: b.id, data: '2026-10-05' });
    lancarGasto(banco, { ...base, valorCentavos: 1000, categoriaId: a.id, data: '2026-10-05' });
    lancarGasto(banco, { ...base, valorCentavos: 4000, categoriaId: a.id, data: '2026-09-03' });

    const p = montarPainel(banco, '2026-10', '2026-10-15');
    expect(p.totalMesCentavos).toBe(10000);
    expect(p.quantidade).toBe(3);
    expect(p.limite).toMatchObject({ estado: 'alerta', restanteCentavos: 0, percentual: 100 });
    expect(p.categorias.map((c) => [c.nome, c.totalCentavos, c.percentual])).toEqual([
      ['Lazer', 6000, 60],
      ['Mercado', 4000, 40],
    ]);
    expect(p.dias.map((d) => [d.data, d.totalCentavos, d.itens.length])).toEqual([
      ['2026-10-05', 7000, 2],
      ['2026-10-02', 3000, 1],
    ]);
    expect(p.comparacao).toMatchObject({ atualCentavos: 10000, anteriorCentavos: 4000 });
    expect(p.patrimonio.liquidoCentavos).toBe(200000);
    expect(p.ateDia).toBe(15);
  });
});

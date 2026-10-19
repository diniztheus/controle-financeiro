import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../../src/lib/server/db/conexao';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import {
  criarMeta,
  editarMeta,
  listarMetas,
  metasNaLixeira,
  movimentarMeta,
  obterMeta,
  obterMetaDetalhada,
  removerMeta,
  removerMovimentoMeta,
  restaurarMeta,
  totalGuardadoMetas,
} from '../../src/lib/server/servicos/metas';
import { bancoEmMemoria } from './ajuda-banco';

const HOJE = '2026-10-19';
const dados = (nome: string, alvo = 300000, prazo: string | null = '2027-07-31') => ({
  nome,
  alvoCentavos: alvo,
  prazo,
  cor: null,
});
const guardar = (banco: Banco, id: string, valor: number, data = '2026-10-19') =>
  movimentarMeta(banco, id, { tipo: 'guardar', valorCentavos: valor, data, nota: null });
const retirar = (banco: Banco, id: string, valor: number) =>
  movimentarMeta(banco, id, { tipo: 'retirar', valorCentavos: valor, data: HOJE, nota: null });

let banco: Banco;

beforeEach(() => {
  banco = bancoEmMemoria();
});
afterEach(() => {
  banco.sqlite.close();
});

describe('cadastro', () => {
  it('cria com nome, alvo, prazo e cor', () => {
    const m = criarMeta(banco, { ...dados('  Viagem  '), cor: 'c3' });
    expect(m.nome).toBe('Viagem');
    expect(m.alvoCentavos).toBe(300000);
    expect(m.prazo).toBe('2027-07-31');
    expect(m.cor).toBe('c3');
    expect(m.removidoEm).toBeNull();
  });

  it('nome é obrigatório e tem limite de 60 caracteres', () => {
    expect(() => criarMeta(banco, dados('   '))).toThrow(ErroDeNegocio);
    expect(() => criarMeta(banco, dados('x'.repeat(61)))).toThrow(ErroDeNegocio);
  });

  it('alvo precisa ser maior que zero', () => {
    expect(() => criarMeta(banco, dados('Zero', 0))).toThrow(ErroDeNegocio);
    expect(() => criarMeta(banco, dados('Neg', -100))).toThrow(ErroDeNegocio);
    expect(() => criarMeta(banco, dados('Frac', 10.5))).toThrow(ErroDeNegocio);
  });

  it('prazo inválido e cor inválida são recusados', () => {
    expect(() => criarMeta(banco, dados('Prazo', 100, '2026-02-31'))).toThrow(ErroDeNegocio);
    expect(() => criarMeta(banco, { ...dados('Cor'), cor: 'azul' as never })).toThrow(
      ErroDeNegocio,
    );
  });

  it('nome repetido não diferencia maiúsculas', () => {
    criarMeta(banco, dados('Viagem'));
    expect(() => criarMeta(banco, dados('viagem'))).toThrow(/Já existe a meta/);
  });

  it('editar pode manter o próprio nome e trocar o alvo', () => {
    const m = criarMeta(banco, dados('Carro'));
    const e = editarMeta(banco, m.id, dados('CARRO', 900000, null));
    expect(e.alvoCentavos).toBe(900000);
    expect(e.prazo).toBeNull();
  });
});

describe('movimentos', () => {
  it('guardar soma, retirar subtrai', () => {
    const m = criarMeta(banco, dados('Viagem'));
    guardar(banco, m.id, 100000);
    retirar(banco, m.id, 40000);
    const d = obterMetaDetalhada(banco, m.id, HOJE);
    expect(d.guardadoCentavos).toBe(60000);
    expect(d.movimentos).toHaveLength(2);
    expect(d.calculo.faltaCentavos).toBe(240000);
  });

  it('retirar mais do que está guardado é recusado', () => {
    const m = criarMeta(banco, dados('Viagem'));
    guardar(banco, m.id, 1000);
    expect(() => retirar(banco, m.id, 1001)).toThrow(ErroDeNegocio);
    expect(obterMetaDetalhada(banco, m.id, HOJE).guardadoCentavos).toBe(1000);
  });

  it('valor precisa ser positivo e data válida', () => {
    const m = criarMeta(banco, dados('Viagem'));
    expect(() => guardar(banco, m.id, 0)).toThrow(ErroDeNegocio);
    expect(() => guardar(banco, m.id, 100, '2026-13-01')).toThrow(ErroDeNegocio);
  });

  it('nota vazia vira nula e nota longa é recusada', () => {
    const m = criarMeta(banco, dados('Viagem'));
    const mov = movimentarMeta(banco, m.id, {
      tipo: 'guardar',
      valorCentavos: 500,
      data: HOJE,
      nota: '   ',
    });
    expect(mov.nota).toBeNull();
    expect(() =>
      movimentarMeta(banco, m.id, {
        tipo: 'guardar',
        valorCentavos: 500,
        data: HOJE,
        nota: 'x'.repeat(121),
      }),
    ).toThrow(ErroDeNegocio);
  });

  it('remover movimento tira do total; não deixa o guardado negativo', () => {
    const m = criarMeta(banco, dados('Viagem'));
    const entrada = guardar(banco, m.id, 10000);
    retirar(banco, m.id, 4000);
    expect(() => removerMovimentoMeta(banco, entrada.id)).toThrow(ErroDeNegocio);
    const saida = obterMetaDetalhada(banco, m.id, HOJE).movimentos.find(
      (x) => x.valorCentavos < 0,
    )!;
    removerMovimentoMeta(banco, saida.id);
    expect(obterMetaDetalhada(banco, m.id, HOJE).guardadoCentavos).toBe(10000);
  });

  it('movimento de meta removida não é aceito', () => {
    const m = criarMeta(banco, dados('Viagem'));
    removerMeta(banco, m.id);
    expect(() => guardar(banco, m.id, 100)).toThrow(ErroDeNegocio);
  });
});

describe('lista, total e lixeira', () => {
  it('total guardado soma só metas fora da lixeira', () => {
    const a = criarMeta(banco, dados('A'));
    const b = criarMeta(banco, dados('B'));
    guardar(banco, a.id, 5000);
    guardar(banco, b.id, 7000);
    expect(totalGuardadoMetas(banco)).toBe(12000);
    removerMeta(banco, b.id);
    expect(totalGuardadoMetas(banco)).toBe(5000);
  });

  it('remover manda para a lixeira; restaurar tira de lá', () => {
    const m = criarMeta(banco, dados('Viagem'));
    removerMeta(banco, m.id);
    expect(obterMeta(banco, m.id)).toBeUndefined();
    expect(listarMetas(banco, HOJE)).toHaveLength(0);
    expect(metasNaLixeira(banco).map((x) => x.id)).toEqual([m.id]);
    restaurarMeta(banco, m.id);
    expect(listarMetas(banco, HOJE).map((x) => x.id)).toEqual([m.id]);
    expect(metasNaLixeira(banco)).toHaveLength(0);
  });

  it('restaurar recusa se já existe outra meta com o mesmo nome', () => {
    const m = criarMeta(banco, dados('Viagem'));
    removerMeta(banco, m.id);
    criarMeta(banco, dados('VIAGEM'));
    expect(() => restaurarMeta(banco, m.id)).toThrow(/Já existe outra meta/);
  });

  it('concluídas vão para o fim da lista', () => {
    const a = criarMeta(banco, dados('Primeira', 1000));
    criarMeta(banco, dados('Segunda', 100000));
    guardar(banco, a.id, 1000);
    expect(listarMetas(banco, HOJE).map((m) => m.nome)).toEqual(['Segunda', 'Primeira']);
  });

  it('obter meta removida ou inexistente lança "não existe mais"', () => {
    const m = criarMeta(banco, dados('Viagem'));
    removerMeta(banco, m.id);
    expect(() => obterMetaDetalhada(banco, m.id, HOJE)).toThrow(/não existe mais/);
    expect(() => removerMeta(banco, 'nao-existe')).toThrow(ErroDeNegocio);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../../src/lib/server/db/conexao';
import { parcelas } from '../../src/lib/server/db/esquema';
import { criarCategoria } from '../../src/lib/server/servicos/categorias';
import {
  aPagarCartoes,
  aPagarDoCartao,
  arquivarCartao,
  cartoesNaLixeira,
  criarCartao,
  desarquivarCartao,
  desfazerPagamentoFatura,
  editarCartao,
  listarCartoes,
  listarFaturasDoCartao,
  nomeDoCartao,
  obterCartao,
  obterFatura,
  pagarFatura,
  removerCartao,
  restaurarCartao,
  type Cartao,
} from '../../src/lib/server/servicos/cartoes';
import { criarConta, listarContas } from '../../src/lib/server/servicos/contas';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import {
  editarGasto,
  lancamentosDoMes,
  lancarGasto,
  removerGasto,
  restaurarGasto,
} from '../../src/lib/server/servicos/gastos';
import { evolucaoPatrimonioMensal } from '../../src/lib/server/servicos/relatorios';
import { montarPainel } from '../../src/lib/server/servicos/painel';
import { bancoEmMemoria } from './ajuda-banco';

let banco: Banco;
let categoriaId: string;

beforeEach(() => {
  banco = bancoEmMemoria();
  categoriaId = criarCategoria(banco, { nome: 'Mercado', cor: null }).id;
});
afterEach(() => banco.sqlite.close());

const T = new Date('2026-10-01T12:00:00Z');
const HOJE = new Date('2026-10-20T12:00:00Z');

/** Fechamento dia 10, vencimento dia 20 (vence depois do fechamento, no mesmo mês). */
function cartao(d: Partial<Omit<Cartao, 'id'>> & { nome?: string } = {}): Cartao {
  return criarCartao(
    banco,
    {
      nome: d.nome ?? 'Nubank',
      limiteCentavos: d.limiteCentavos ?? 0,
      diaFechamento: d.diaFechamento ?? 10,
      diaVencimento: d.diaVencimento ?? 20,
    },
    T,
  );
}

function compra(c: Cartao, data: string, valorCentavos: number, numParcelas = 1, agora = T) {
  return lancarGasto(
    banco,
    {
      valorCentavos,
      descricao: 'Compra',
      categoriaId,
      data,
      contaId: null,
      meio: 'cartao',
      cartaoId: c.id,
      numParcelas,
    },
    agora,
  );
}

function meses(c: Cartao) {
  return listarFaturasDoCartao(banco, c.id, '2026-10-15').map((f) => ({
    mes: f.mes,
    total: f.totalCentavos,
  }));
}

describe('cadastro de cartões', () => {
  it('cria, edita e lista; nome repetido não diferencia maiúsculas', () => {
    const c = cartao({ nome: '  Nubank  ', limiteCentavos: 500_000 });
    expect(c.nome).toBe('Nubank');
    expect(() => cartao({ nome: 'nubank' })).toThrow(ErroDeNegocio);
    expect(() => cartao({ nome: 'nubank' })).toThrow(/Já existe/);
    editarCartao(
      banco,
      c.id,
      { nome: 'Nu', limiteCentavos: 700_000, diaFechamento: 5, diaVencimento: 15 },
      T,
    );
    expect(nomeDoCartao(banco, c.id)).toBe('Nu');
    expect(obterCartao(banco, c.id)).toMatchObject({ limiteCentavos: 700_000, diaFechamento: 5 });
  });

  it('recusa limite negativo e dias fora de 1 a 31', () => {
    expect(() => cartao({ limiteCentavos: -1 })).toThrow(/limite/);
    expect(() => cartao({ diaFechamento: 0 })).toThrow(/fechamento/);
    expect(() => cartao({ diaVencimento: 32 })).toThrow(/vencimento/);
  });

  it('arquivar some da lista comum e mantém o histórico; desarquivar devolve', () => {
    const c = cartao();
    arquivarCartao(banco, c.id, T);
    expect(listarCartoes(banco)).toHaveLength(0);
    expect(listarCartoes(banco, { incluirArquivados: true })).toMatchObject([
      { id: c.id, ativo: false },
    ]);
    desarquivarCartao(banco, c.id, T);
    expect(listarCartoes(banco)).toHaveLength(1);
  });

  it('remover manda para a lixeira; restaurar traz de volta; nome livre na restauração', () => {
    const c = cartao();
    removerCartao(banco, c.id, T);
    expect(listarCartoes(banco, { incluirArquivados: true })).toHaveLength(0);
    expect(obterCartao(banco, c.id)).toBeUndefined();
    expect(cartoesNaLixeira(banco).map((x) => x.id)).toEqual([c.id]);
    expect(() => removerCartao(banco, c.id, T)).toThrow(ErroDeNegocio);

    // Outro cartão com o mesmo nome (o removido não conta): a restauração é recusada.
    const outro = cartao({ nome: 'Nubank' });
    expect(() => restaurarCartao(banco, c.id)).toThrow(/Já existe/);
    editarCartao(
      banco,
      outro.id,
      { nome: 'Inter', limiteCentavos: 0, diaFechamento: 10, diaVencimento: 20 },
      T,
    );
    restaurarCartao(banco, c.id);
    expect(listarCartoes(banco).map((x) => x.nome)).toEqual(['Nubank', 'Inter']);
  });

  it('limite vazio (0) deixa o disponível em null', () => {
    cartao({ nome: 'Sem limite' });
    expect(listarCartoes(banco)[0]!.disponivelCentavos).toBeNull();
  });

  it('limite disponível desconta o que está a pagar', () => {
    const c = cartao({ limiteCentavos: 500_000 });
    compra(c, '2026-10-05', 120_000);
    const [item] = listarCartoes(banco);
    expect(item).toMatchObject({ aPagarCentavos: 120_000, disponivelCentavos: 380_000 });
    expect(item!.proximaFatura).toEqual({
      mes: '2026-10',
      vencimento: '2026-10-20',
      totalCentavos: 120_000,
    });
  });
});

describe('compras parceladas e faturas', () => {
  it('10x gera 10 parcelas em 10 faturas seguidas, a partir da fatura da 1ª parcela', () => {
    const c = cartao();
    compra(c, '2026-10-05', 100_000, 10);
    const ps = banco.db.select().from(parcelas).all();
    expect(ps).toHaveLength(10);
    const f = meses(c);
    expect(f.map((x) => x.mes)).toEqual([
      '2027-07',
      '2027-06',
      '2027-05',
      '2027-04',
      '2027-03',
      '2027-02',
      '2027-01',
      '2026-12',
      '2026-11',
      '2026-10',
    ]);
    expect(f.every((x) => x.total === 10_000)).toBe(true);
    expect(aPagarDoCartao(banco, c.id)).toBe(100_000);
  });

  it('a 1ª parcela leva o resto dos centavos (100,00 em 3x)', () => {
    const c = cartao();
    compra(c, '2026-10-05', 10_000, 3);
    expect(meses(c)).toEqual([
      { mes: '2026-12', total: 3333 },
      { mes: '2026-11', total: 3333 },
      { mes: '2026-10', total: 3334 },
    ]);
  });

  it('compra no dia do fechamento cai na fatura seguinte; um dia antes fica na atual', () => {
    const c = cartao();
    compra(c, '2026-10-09', 1000);
    compra(c, '2026-10-10', 2000);
    expect(
      obterFatura(banco, c.id, '2026-10', '2026-10-15').itens.map((i) => i.valorCentavos),
    ).toEqual([1000]);
    expect(
      obterFatura(banco, c.id, '2026-11', '2026-10-15').itens.map((i) => i.valorCentavos),
    ).toEqual([2000]);
  });

  it('fechamento 31 em fevereiro vale o último dia do mês', () => {
    const c = cartao({ diaFechamento: 31, diaVencimento: 5 });
    compra(c, '2027-02-27', 1000);
    compra(c, '2027-02-28', 2000);
    // Vencimento (5) antes do fechamento: a fatura vence no mês seguinte ao fechamento.
    const f = obterFatura(banco, c.id, '2027-03', '2027-02-01');
    expect(f.itens.map((i) => i.valorCentavos)).toEqual([1000]);
    expect(f.dataFechamento).toBe('2027-02-28');
    expect(f.dataVencimento).toBe('2027-03-05');
    expect(
      obterFatura(banco, c.id, '2027-04', '2027-02-01').itens.map((i) => i.valorCentavos),
    ).toEqual([2000]);
  });

  it('a fatura de um mês sem parcelas aparece vazia, sem linha', () => {
    const c = cartao();
    const f = obterFatura(banco, c.id, '2026-12', '2026-10-15');
    expect(f).toMatchObject({ fatura: null, itens: [], totalCentavos: 0, situacao: 'aberta' });
    expect(f.dataVencimento).toBe('2026-12-20');
  });

  it('editar regera as parcelas (valor, data e número)', () => {
    const c = cartao();
    const g = compra(c, '2026-10-05', 10_000, 2);
    editarGasto(
      banco,
      g.id,
      {
        valorCentavos: 3000,
        descricao: 'Outra',
        categoriaId,
        data: '2026-11-05',
        contaId: null,
        meio: 'cartao',
        cartaoId: c.id,
        numParcelas: 3,
      },
      T,
    );
    expect(banco.db.select().from(parcelas).all()).toHaveLength(3);
    expect(meses(c)).toEqual([
      { mes: '2027-01', total: 1000 },
      { mes: '2026-12', total: 1000 },
      { mes: '2026-11', total: 1000 },
    ]);
  });

  it('editar o cartão não re-liga parcelas já lançadas', () => {
    const c = cartao();
    compra(c, '2026-10-05', 1000);
    editarCartao(
      banco,
      c.id,
      { nome: 'Nubank', limiteCentavos: 0, diaFechamento: 25, diaVencimento: 28 },
      T,
    );
    expect(meses(c)).toEqual([{ mes: '2026-10', total: 1000 }]);
  });

  it('valor menor que o número de parcelas é recusado', () => {
    const c = cartao();
    expect(() => compra(c, '2026-10-05', 2, 3)).toThrow(/pequeno demais/);
    expect(banco.db.select().from(parcelas).all()).toHaveLength(0);
  });

  it('cartão arquivado não recebe compra nova, mas a compra existente pode ser editada', () => {
    const c = cartao();
    const g = compra(c, '2026-10-05', 1000);
    arquivarCartao(banco, c.id, T);
    expect(() => compra(c, '2026-10-06', 1000)).toThrow(/arquivado/);
    expect(() =>
      editarGasto(
        banco,
        g.id,
        {
          valorCentavos: 1500,
          descricao: null,
          categoriaId,
          data: '2026-10-05',
          contaId: null,
          meio: 'cartao',
          cartaoId: c.id,
        },
        T,
      ),
    ).not.toThrow();
  });
});

describe('pagar e desfazer fatura', () => {
  it('pagar não mexe no saldo das contas e desfazer volta a dívida', () => {
    criarConta(banco, { nome: 'Nubank conta', tipo: 'corrente', saldoCentavos: 100_000 }, T);
    const c = cartao();
    compra(c, '2026-10-05', 30_000);
    pagarFatura(banco, c.id, '2026-10', {}, HOJE);
    expect(listarContas(banco)[0]!.saldoCentavos).toBe(100_000);
    expect(obterFatura(banco, c.id, '2026-10', '2026-10-20')).toMatchObject({
      situacao: 'paga',
      pagaEm: '2026-10-20',
      valorPagoCentavos: 30_000,
    });
    expect(aPagarCartoes(banco)).toBe(0);

    desfazerPagamentoFatura(banco, c.id, '2026-10', HOJE);
    expect(obterFatura(banco, c.id, '2026-10', '2026-10-20')).toMatchObject({
      pagaEm: null,
      valorPagoCentavos: null,
    });
    expect(aPagarCartoes(banco)).toBe(30_000);
  });

  it('pagamento com data e valor informados', () => {
    const c = cartao();
    compra(c, '2026-10-05', 30_000);
    pagarFatura(banco, c.id, '2026-10', { pagaEm: '2026-10-18', valorPagoCentavos: 25_000 }, HOJE);
    expect(obterFatura(banco, c.id, '2026-10', '2026-10-20')).toMatchObject({
      pagaEm: '2026-10-18',
      valorPagoCentavos: 25_000,
    });
  });

  it('recusa data de pagamento no futuro (campo pagaEm)', () => {
    const c = cartao();
    compra(c, '2026-10-05', 30_000);
    expect(() => pagarFatura(banco, c.id, '2026-10', { pagaEm: '2026-10-21' }, HOJE)).toThrow(
      /no futuro/,
    );
    expect(() => pagarFatura(banco, c.id, '2026-10', { pagaEm: '2026-10-20' }, HOJE)).not.toThrow();
  });

  it('recusa pagar fatura sem compras e fatura já paga; desfazer fatura não paga é recusado', () => {
    const c = cartao();
    expect(() => pagarFatura(banco, c.id, '2026-10', {}, HOJE)).toThrow(/não tem compras/);
    compra(c, '2026-10-05', 1000);
    pagarFatura(banco, c.id, '2026-10', {}, HOJE);
    expect(() => pagarFatura(banco, c.id, '2026-10', {}, HOJE)).toThrow(/já está paga/);
    expect(() => desfazerPagamentoFatura(banco, c.id, '2026-11', HOJE)).toThrow(/não está paga/);
  });

  it('editar, remover ou lançar na fatura paga é recusado com a mensagem certa', () => {
    const c = cartao();
    const g = compra(c, '2026-10-05', 1000);
    pagarFatura(banco, c.id, '2026-10', {}, HOJE);
    const d = {
      valorCentavos: 500,
      descricao: null,
      categoriaId,
      data: '2026-10-05',
      contaId: null,
      meio: 'cartao' as const,
      cartaoId: c.id,
    };
    expect(() => editarGasto(banco, g.id, d, T)).toThrow(
      /Desfaça o pagamento da fatura de 10\/2026/,
    );
    expect(() => removerGasto(banco, g.id, T)).toThrow(/Desfaça o pagamento da fatura de 10\/2026/);
    expect(() => compra(c, '2026-10-06', 500)).toThrow(/Desfaça o pagamento da fatura de 10\/2026/);
    // Compra em outra fatura continua livre.
    expect(() => compra(c, '2026-10-11', 500)).not.toThrow();
  });
});

describe('dívida, lixeira e patrimônio', () => {
  it('a dívida entra no patrimônio líquido e cai ao pagar', () => {
    criarConta(banco, { nome: 'Conta', tipo: 'corrente', saldoCentavos: 100_000 }, T);
    const c = cartao();
    compra(c, '2026-10-05', 30_000, 3);
    const painel = () => montarPainel(banco, '2026-10', '2026-10-15').patrimonio;
    expect(painel()).toMatchObject({ aPagarCartoesCentavos: 30_000, liquidoCentavos: 70_000 });
    pagarFatura(banco, c.id, '2026-10', {}, HOJE);
    expect(painel()).toMatchObject({ aPagarCartoesCentavos: 20_000, liquidoCentavos: 80_000 });
  });

  it('compra na lixeira sai das somas e das listas; restaurar devolve', () => {
    const c = cartao();
    const g = compra(c, '2026-10-05', 5_000);
    removerGasto(banco, g.id, T);
    expect(aPagarCartoes(banco)).toBe(0);
    expect(lancamentosDoMes(banco, '2026-10')).toHaveLength(0);
    restaurarGasto(banco, g.id);
    expect(aPagarCartoes(banco)).toBe(5_000);
  });

  it('cartão na lixeira sai das somas; restaurar compra de cartão na lixeira é recusado', () => {
    const c = cartao();
    const g = compra(c, '2026-10-05', 5_000);
    removerCartao(banco, c.id, T);
    expect(aPagarCartoes(banco)).toBe(0);
    expect(lancamentosDoMes(banco, '2026-10')).toHaveLength(0);
    removerGasto(banco, g.id, T);
    expect(() => restaurarGasto(banco, g.id)).toThrow(/lixeira/);
    restaurarCartao(banco, c.id);
    expect(aPagarCartoes(banco)).toBe(0);
    restaurarGasto(banco, g.id);
    expect(aPagarCartoes(banco)).toBe(5_000);
  });

  it('evolução do patrimônio desconta a dívida de cada fim de mês até a fatura ser paga', () => {
    criarConta(
      banco,
      { nome: 'Conta', tipo: 'corrente', saldoCentavos: 100_000 },
      new Date('2026-01-01T12:00:00Z'),
    );
    const c = cartao();
    compra(c, '2026-09-05', 5_000, 1, new Date('2026-09-05T12:00:00Z'));
    // Fatura de setembro vence em 20/09 (fechamento 10): paga em 02/10.
    pagarFatura(banco, c.id, '2026-09', { pagaEm: '2026-10-02' }, new Date('2026-10-03T12:00:00Z'));
    const pontos = evolucaoPatrimonioMensal(banco, 3, new Date('2026-10-15T12:00:00Z'));
    expect(pontos.map((p) => [p.mes, p.dividaCartaoCentavos, p.totalCentavos])).toEqual([
      ['2026-08', 0, 100_000],
      ['2026-09', 5_000, 95_000],
      ['2026-10', 0, 100_000],
    ]);
  });
});

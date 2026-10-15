import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Banco } from '../../src/lib/server/db/conexao';
import { receitas } from '../../src/lib/server/db/esquema';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import { montarPainel } from '../../src/lib/server/servicos/painel';
import {
  criarRecorrente,
  gerarReceitasRecorrentes,
} from '../../src/lib/server/servicos/recorrentes';
import {
  aReceberDoMes,
  confirmarRecebimento,
  desfazerConfirmacao,
  lancarReceita,
  receitasAReceber,
  receitasDoMes,
  removerReceita,
  totalReceitasDoMes,
} from '../../src/lib/server/servicos/receitas';
import { fluxoDeCaixa } from '../../src/lib/server/servicos/relatorios';
import { confirmarRecebimentoForm } from '../../src/lib/validacao/nucleo';
import { bancoEmMemoria } from './ajuda-banco';

let banco: Banco;
beforeEach(() => {
  banco = bancoEmMemoria();
});
afterEach(() => {
  banco.sqlite.close();
});

const T1 = new Date('2026-10-01T12:00:00Z');
const AGORA = new Date('2026-10-15T12:00:00Z');

/** Recorrente de salário de agosto a outubro de 2026, dia 5: gera 3 previstas até hoje. */
function criarSalario(inicio = '2026-08-01') {
  return criarRecorrente(
    banco,
    {
      descricao: 'Salário',
      categoria: 'Salário',
      valorCentavos: 300000,
      diaDoMes: 5,
      inicio,
      fim: null,
      contaId: null,
      observacao: null,
    },
    AGORA,
  );
}

/** Id da prevista de um mês (a única receita do mês gerada pelo modelo). */
function idDoMes(mes: string): string {
  const r = receitasDoMes(banco, mes)[0];
  if (!r) throw new Error(`sem receita em ${mes}`);
  return r.id;
}

describe('confirmação: lançamento à mão e previstas', () => {
  it('receita lançada à mão nasce confirmada', () => {
    const r = lancarReceita(
      banco,
      { categoria: 'Freelance', data: '2026-10-03', valorCentavos: 50000 },
      T1,
    );
    expect(r.confirmadaEm).toBe(T1.toISOString());
    expect(receitasDoMes(banco, '2026-10')[0]).toMatchObject({ id: r.id, confirmada: true });
    expect(totalReceitasDoMes(banco, '2026-10')).toBe(50000);
  });

  it('receita gerada por recorrente nasce prevista e fica fora dos totais', () => {
    criarSalario('2026-10-01');
    const [prevista] = receitasDoMes(banco, '2026-10');
    expect(prevista).toMatchObject({ recorrente: true, confirmada: false });
    expect(totalReceitasDoMes(banco, '2026-10')).toBe(0);
    expect(aReceberDoMes(banco, '2026-10')).toEqual({ quantidade: 1, totalCentavos: 300000 });

    const p = montarPainel(banco, '2026-10', '2026-10-15');
    expect(p.fluxo).toMatchObject({ entradasCentavos: 0, quantidadeReceitas: 0 });
    expect(p.aReceber).toEqual({ quantidade: 1, totalCentavos: 300000 });

    const f = fluxoDeCaixa(banco, 3, AGORA);
    expect(f.totais.entradasCentavos).toBe(0);
    expect(f.receitasPorCategoria).toEqual([]);
  });

  it('gerar de novo não confirma nem altera a prevista', () => {
    criarSalario();
    const id = idDoMes('2026-09');
    expect(gerarReceitasRecorrentes(banco, '2026-10-15', AGORA)).toBe(0);
    expect(receitasDoMes(banco, '2026-09')[0]).toMatchObject({ id, confirmada: false });
  });
});

describe('receitas a receber', () => {
  it('lista as previstas que já venceram, da mais antiga para a mais nova', () => {
    criarSalario();
    const lista = receitasAReceber(banco, '2026-10-15');
    expect(lista.map((r) => r.data)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
    expect(lista[0]).toMatchObject({
      categoria: 'Salário',
      valorCentavos: 300000,
      recorrente: true,
    });
  });

  it('o limite "ate" deixa de fora as previstas com data depois dele', () => {
    criarSalario();
    expect(receitasAReceber(banco, '2026-09-30').map((r) => r.data)).toEqual([
      '2026-08-05',
      '2026-09-05',
    ]);
  });

  it('sem "ate" vale hoje: previstas de anos passados aparecem como atrasadas', () => {
    criarRecorrente(
      banco,
      {
        categoria: 'Bolsa',
        valorCentavos: 100000,
        diaDoMes: 10,
        inicio: '2019-03-01',
        fim: '2019-03-31',
      },
      AGORA,
    );
    const lista = receitasAReceber(banco);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ data: '2019-03-10', atrasada: true });
  });

  it('não inclui confirmadas nem as que estão na lixeira', () => {
    criarSalario();
    confirmarRecebimento(banco, idDoMes('2026-08'), {}, T1);
    removerReceita(banco, idDoMes('2026-09'), T1);
    expect(receitasAReceber(banco, '2026-10-15').map((r) => r.data)).toEqual(['2026-10-05']);
  });
});

describe('confirmar recebimento', () => {
  it('confirmar grava a data da confirmação e muda os totais', () => {
    criarSalario();
    const id = idDoMes('2026-08');
    const r = confirmarRecebimento(banco, id, {}, T1);
    expect(r.confirmadaEm).toBe(T1.toISOString());
    expect(totalReceitasDoMes(banco, '2026-08')).toBe(300000);
    expect(aReceberDoMes(banco, '2026-08')).toEqual({ quantidade: 0, totalCentavos: 0 });

    const p = montarPainel(banco, '2026-08', '2026-10-15');
    expect(p.fluxo).toMatchObject({ entradasCentavos: 300000, quantidadeReceitas: 1 });
    expect(fluxoDeCaixa(banco, 3, AGORA).totais.entradasCentavos).toBe(300000);
    expect(fluxoDeCaixa(banco, 3, AGORA).receitasPorCategoria).toEqual([
      { categoria: 'Salário', totalCentavos: 300000, percentual: 100 },
    ]);
  });

  it('ajusta valor e data reais dentro do mês da previsão', () => {
    criarSalario();
    const id = idDoMes('2026-09');
    confirmarRecebimento(banco, id, { valorCentavos: 312345, data: '2026-09-28' }, T1);

    const setembro = receitasDoMes(banco, '2026-09').find((r) => r.id === id);
    expect(setembro).toMatchObject({ data: '2026-09-28', valorCentavos: 312345, confirmada: true });
    expect(totalReceitasDoMes(banco, '2026-09')).toBe(312345);
  });

  it('recusa mudar a data de uma receita de recorrente para outro mês', () => {
    criarSalario();
    const id = idDoMes('2026-09');
    // O mês vizinho já tem a sua própria receita (outubro) e também não pode "roubar" a data.
    expect(() => confirmarRecebimento(banco, id, { data: '2026-10-20' }, T1)).toThrow(
      /precisa ficar nesse mês/,
    );
    expect(() => confirmarRecebimento(banco, id, { data: '2026-10-05' }, T1)).toThrow(
      ErroDeNegocio,
    );
    expect(receitasDoMes(banco, '2026-09')[0]).toMatchObject({ id, confirmada: false });
  });

  it('confirmar com atraso não impede o mês seguinte de ser lançado', () => {
    // Salário do dia 5; hoje é 02/11: a receita de 05/11 ainda não foi gerada.
    const r = criarRecorrente(
      banco,
      {
        descricao: 'Salário',
        categoria: 'Salário',
        valorCentavos: 300000,
        diaDoMes: 5,
        inicio: '2026-09-01',
        fim: null,
      },
      new Date('2026-10-20T12:00:00Z'),
    );
    const id = idDoMes('2026-10');
    expect(() => confirmarRecebimento(banco, id, { data: '2026-11-01' }, T1)).toThrow(
      ErroDeNegocio,
    );
    gerarReceitasRecorrentes(banco, '2026-11-06', new Date('2026-11-06T12:00:00Z'));
    expect(receitasDoMes(banco, '2026-11')).toHaveLength(1);
    expect(
      banco.db.select().from(receitas).where(eq(receitas.recorrenteId, r.id)).all(),
    ).toHaveLength(3);
  });

  it('recusa valor não positivo e data inválida', () => {
    criarSalario();
    const id = idDoMes('2026-08');
    expect(() => confirmarRecebimento(banco, id, { valorCentavos: 0 }, T1)).toThrow(ErroDeNegocio);
    expect(() => confirmarRecebimento(banco, id, { valorCentavos: 1.5 }, T1)).toThrow(
      ErroDeNegocio,
    );
    expect(() => confirmarRecebimento(banco, id, { data: '2026-02-30' }, T1)).toThrow(
      ErroDeNegocio,
    );
    expect(receitasDoMes(banco, '2026-08')[0]?.confirmada).toBe(false);
  });

  it('confirmar de novo falha com mensagem clara', () => {
    criarSalario();
    const id = idDoMes('2026-08');
    confirmarRecebimento(banco, id, {}, T1);
    expect(() => confirmarRecebimento(banco, id, {}, T1)).toThrow(/já foi confirmada/);
  });

  it('confirmar receita na lixeira ou inexistente falha', () => {
    criarSalario();
    const id = idDoMes('2026-08');
    removerReceita(banco, id, T1);
    expect(() => confirmarRecebimento(banco, id, {}, T1)).toThrow(ErroDeNegocio);
    expect(() => confirmarRecebimento(banco, 'nao-existe', {}, T1)).toThrow(ErroDeNegocio);
  });

  it('"não recebi" manda para a lixeira e a prevista não volta a ser gerada', () => {
    criarSalario();
    const id = idDoMes('2026-08');
    removerReceita(banco, id, T1);
    expect(gerarReceitasRecorrentes(banco, '2026-10-15', AGORA)).toBe(0);
    expect(receitasDoMes(banco, '2026-08')).toEqual([]);
    const linha = banco.db.select().from(receitas).where(eq(receitas.id, id)).get();
    expect(linha?.removidoEm).not.toBeNull();
  });
});

describe('desfazer confirmação', () => {
  it('volta a prevista e tira o valor dos totais', () => {
    criarSalario();
    const id = idDoMes('2026-08');
    confirmarRecebimento(banco, id, {}, T1);
    const r = desfazerConfirmacao(banco, id, T1);
    expect(r.confirmadaEm).toBeNull();
    expect(receitasDoMes(banco, '2026-08')[0]).toMatchObject({ confirmada: false });
    expect(totalReceitasDoMes(banco, '2026-08')).toBe(0);
    expect(receitasAReceber(banco, '2026-10-15').map((x) => x.id)).toContain(id);
  });

  it('receita já prevista ou lançada à mão não pode voltar a prevista', () => {
    criarSalario();
    expect(() => desfazerConfirmacao(banco, idDoMes('2026-08'), T1)).toThrow(/ainda está prevista/);
    const manual = lancarReceita(
      banco,
      { categoria: 'Outros', data: '2026-10-03', valorCentavos: 900 },
      T1,
    );
    expect(() => desfazerConfirmacao(banco, manual.id, T1)).toThrow(
      /Só receitas previstas de recorrentes/,
    );
  });
});

describe('lançamento manual continua valendo como recebido', () => {
  it('editar uma receita manual não a torna prevista', () => {
    const r = lancarReceita(
      banco,
      { categoria: 'Presente', data: '2026-10-02', valorCentavos: 4000 },
      T1,
    );
    expect(receitasDoMes(banco, '2026-10')[0]).toMatchObject({ id: r.id, confirmada: true });
    expect(totalReceitasDoMes(banco, '2026-10')).toBe(4000);
  });
});

describe('migração 0005: backfill', () => {
  it('receita antiga sem confirmação vira confirmada na data de criação', () => {
    banco.sqlite
      .prepare(
        `INSERT INTO receitas (id, categoria, data, valor_centavos, criado_em, atualizado_em)
         VALUES ('antiga', 'Outros', '2026-10-03', 1000, '2026-10-04T10:00:00.000Z', '2026-10-04T10:00:00.000Z')`,
      )
      .run();
    const sql = readFileSync(
      resolve(__dirname, '../../drizzle/0005_receitas_confirmacao.sql'),
      'utf8',
    );
    const update = sql.split('\n').find((l) => l.startsWith('UPDATE'));
    expect(update).toBeDefined();
    banco.sqlite.exec(update!);
    expect(
      banco.db.select().from(receitas).where(eq(receitas.id, 'antiga')).get()?.confirmadaEm,
    ).toBe('2026-10-04T10:00:00.000Z');
  });
});

describe('formulário de confirmação', () => {
  it('campos vazios significam manter o que já está', () => {
    const r = confirmarRecebimentoForm.safeParse({ valor: '', data: '' });
    expect(r.success).toBe(true);
    expect(r.success && r.data).toEqual({ valorCentavos: undefined, data: undefined });
  });

  it('converte valor em reais e aceita a data', () => {
    const r = confirmarRecebimentoForm.safeParse({ valor: '1.234,56', data: '2026-08-07' });
    expect(r.success && r.data).toEqual({ valorCentavos: 123456, data: '2026-08-07' });
  });

  it('recusa valor zero ou inválido e data inexistente', () => {
    expect(confirmarRecebimentoForm.safeParse({ valor: '0' }).success).toBe(false);
    expect(confirmarRecebimentoForm.safeParse({ valor: 'abc' }).success).toBe(false);
    expect(confirmarRecebimentoForm.safeParse({ data: '2026-02-30' }).success).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Banco } from '../../src/lib/server/db/conexao';
import { receitas, receitasRecorrentes } from '../../src/lib/server/db/esquema';
import {
  atualizarSaldo,
  criarConta,
  obterConta,
  removerConta,
} from '../../src/lib/server/servicos/contas';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import {
  criarRecorrente,
  editarRecorrente,
  gerarReceitasRecorrentes,
  listarRecorrentes,
  obterRecorrente,
  pausarRecorrente,
  recorrentesNaLixeira,
  removerRecorrente,
  restaurarRecorrente,
  retomarRecorrente,
  type DadosRecorrente,
} from '../../src/lib/server/servicos/recorrentes';
import {
  lancarReceita,
  receitasDoMes,
  removerReceita,
} from '../../src/lib/server/servicos/receitas';
import { receitaRecorrenteForm } from '../../src/lib/validacao/nucleo';
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

function modelo(over: Partial<DadosRecorrente> = {}): DadosRecorrente {
  return {
    descricao: 'Salário',
    categoria: 'Salário',
    valorCentavos: 300000,
    diaDoMes: 5,
    inicio: '2026-08-01',
    fim: null,
    contaId: null,
    observacao: null,
    ...over,
  };
}

/** Datas das receitas geradas por um modelo, em ordem. */
function datasGeradas(id: string): string[] {
  return banco.db
    .select({ data: receitas.data })
    .from(receitas)
    .where(eq(receitas.recorrenteId, id))
    .all()
    .map((r) => r.data)
    .sort();
}

function totalModelos(): number {
  return banco.db.select().from(receitasRecorrentes).all().length;
}

describe('receitas recorrentes: geração', () => {
  it('criar gera uma receita por mês desde o início até hoje', () => {
    const r = criarRecorrente(banco, modelo(), AGORA);
    expect(datasGeradas(r.id)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
    const outubro = receitasDoMes(banco, '2026-10');
    expect(outubro).toHaveLength(1);
    expect(outubro[0]).toMatchObject({
      valorCentavos: 300000,
      categoria: 'Salário',
      recorrente: true,
    });
  });

  it('receita gerada nasce prevista (confirmadaEm vazio) e conta em "geradas"', () => {
    const r = criarRecorrente(banco, modelo(), AGORA);
    const linhas = banco.db.select().from(receitas).where(eq(receitas.recorrenteId, r.id)).all();
    expect(linhas).toHaveLength(3);
    expect(linhas.every((x) => x.confirmadaEm === null)).toBe(true);
    expect(listarRecorrentes(banco, AGORA).find((x) => x.id === r.id)?.geradas).toBe(3);
  });

  it('é idempotente: gerar de novo não cria nada', () => {
    const r = criarRecorrente(banco, modelo(), AGORA);
    expect(gerarReceitasRecorrentes(banco, '2026-10-15', AGORA)).toBe(0);
    expect(gerarReceitasRecorrentes(banco, '2026-10-15', AGORA)).toBe(0);
    expect(gerarReceitasRecorrentes(banco, '2026-10-15', AGORA)).toBe(0);
    expect(datasGeradas(r.id)).toHaveLength(3);
  });

  it('não gera datas depois de hoje, e gera a seguinte quando o dia chega', () => {
    const r = criarRecorrente(banco, modelo(), AGORA);
    expect(gerarReceitasRecorrentes(banco, '2026-11-04', AGORA)).toBe(0);
    expect(gerarReceitasRecorrentes(banco, '2026-11-05', AGORA)).toBe(1);
    expect(datasGeradas(r.id)).toContain('2026-11-05');
  });

  it('início no meio do mês pula o mês do início quando o dia já passou', () => {
    const r = criarRecorrente(banco, modelo({ inicio: '2026-08-20' }), AGORA);
    expect(datasGeradas(r.id)).toEqual(['2026-09-05', '2026-10-05']);
  });

  it('início no futuro não gera nada', () => {
    const r = criarRecorrente(banco, modelo({ inicio: '2026-12-01' }), AGORA);
    expect(datasGeradas(r.id)).toEqual([]);
    expect(gerarReceitasRecorrentes(banco, '2026-11-30', AGORA)).toBe(0);
  });

  it('fim passado para de gerar', () => {
    const r = criarRecorrente(banco, modelo({ inicio: '2026-01-01', fim: '2026-03-31' }), AGORA);
    expect(datasGeradas(r.id)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
    expect(gerarReceitasRecorrentes(banco, '2026-12-01', AGORA)).toBe(0);
    expect(datasGeradas(r.id)).toHaveLength(3);
  });

  it('dia 31 cai no último dia dos meses curtos (fevereiro bissexto e não bissexto)', () => {
    const r = criarRecorrente(
      banco,
      modelo({ diaDoMes: 31, inicio: '2024-01-01', fim: '2024-03-31' }),
      AGORA,
    );
    expect(datasGeradas(r.id)).toEqual(['2024-01-31', '2024-02-29', '2024-03-31']);

    const s = criarRecorrente(
      banco,
      modelo({ diaDoMes: 31, inicio: '2026-01-01', fim: '2026-06-30' }),
      AGORA,
    );
    expect(datasGeradas(s.id)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ]);
  });

  it('gera uma receita por mês mesmo quando o dia do modelo muda (sem duplicar o mês)', () => {
    const r = criarRecorrente(banco, modelo(), AGORA);
    editarRecorrente(banco, r.id, modelo({ diaDoMes: 20 }), AGORA);
    expect(gerarReceitasRecorrentes(banco, '2026-10-25', AGORA)).toBe(0);
    expect(datasGeradas(r.id).filter((d) => d.startsWith('2026-10'))).toEqual(['2026-10-05']);
    expect(gerarReceitasRecorrentes(banco, '2026-11-25', AGORA)).toBe(1);
    expect(datasGeradas(r.id)).toContain('2026-11-20');
  });

  it('modelo com dado ruim é ignorado e não impede os outros', () => {
    const bom = criarRecorrente(banco, modelo({ inicio: '2026-09-01' }), AGORA);
    // Dado fora da regra do domínio (categoria que não existe), gravado direto no banco.
    banco.db
      .insert(receitasRecorrentes)
      .values({
        descricao: 'Ruim',
        categoria: 'Loteria',
        valorCentavos: 100,
        diaDoMes: 1,
        inicio: '2026-01-01',
        criadoEm: AGORA.toISOString(),
        atualizadoEm: AGORA.toISOString(),
      })
      .run();
    expect(gerarReceitasRecorrentes(banco, '2026-11-05', AGORA)).toBe(1);
    expect(datasGeradas(bom.id)).toContain('2026-11-05');
  });
});

describe('receitas recorrentes: lixeira, pausa e edição', () => {
  it('uma receita gerada mandada para a lixeira NÃO volta a ser gerada', () => {
    const r = criarRecorrente(banco, modelo({ inicio: '2026-08-01' }), AGORA);
    const setembro = receitasDoMes(banco, '2026-09')[0]!;
    removerReceita(banco, setembro.id, AGORA);
    expect(gerarReceitasRecorrentes(banco, '2026-10-15', AGORA)).toBe(0);
    expect(datasGeradas(r.id)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
  });

  it('pausar impede novas receitas; retomar não gera os meses pausados', () => {
    const r = criarRecorrente(banco, modelo({ inicio: '2026-08-01' }), AGORA);
    pausarRecorrente(banco, r.id, AGORA);
    expect(gerarReceitasRecorrentes(banco, '2026-12-20', AGORA)).toBe(0);
    expect(obterRecorrente(banco, r.id)?.ativa).toBe(false);

    retomarRecorrente(banco, r.id, AGORA);
    expect(obterRecorrente(banco, r.id)?.inicio).toBe('2026-10-15');
    expect(gerarReceitasRecorrentes(banco, '2026-10-15', AGORA)).toBe(0);
    // Novembro e dezembro, já com o modelo ativo.
    expect(gerarReceitasRecorrentes(banco, '2026-12-20', AGORA)).toBe(2);
    expect(datasGeradas(r.id)).toEqual([
      '2026-08-05',
      '2026-09-05',
      '2026-10-05',
      '2026-11-05',
      '2026-12-05',
    ]);
  });

  it('retomar um modelo cujo fim já passou é recusado', () => {
    const r = criarRecorrente(banco, modelo({ inicio: '2026-01-01', fim: '2026-03-31' }), AGORA);
    pausarRecorrente(banco, r.id, AGORA);
    expect(() => retomarRecorrente(banco, r.id, AGORA)).toThrow(ErroDeNegocio);
    expect(obterRecorrente(banco, r.id)?.ativa).toBe(false);
  });

  it('editar o valor não muda as receitas já geradas, só as próximas', () => {
    const r = criarRecorrente(banco, modelo({ inicio: '2026-08-01' }), AGORA);
    editarRecorrente(banco, r.id, modelo({ inicio: '2026-08-01', valorCentavos: 999900 }), AGORA);
    const valores = banco.db
      .select({ valor: receitas.valorCentavos })
      .from(receitas)
      .where(eq(receitas.recorrenteId, r.id))
      .all()
      .map((x) => x.valor);
    expect(valores).toEqual([300000, 300000, 300000]);

    expect(gerarReceitasRecorrentes(banco, '2026-11-06', AGORA)).toBe(1);
    expect(receitasDoMes(banco, '2026-11')[0]?.valorCentavos).toBe(999900);
  });

  it('recorrente removida (lixeira) não gera e some da lista ativa', () => {
    const r = criarRecorrente(banco, modelo({ inicio: '2026-08-01' }), AGORA);
    removerRecorrente(banco, r.id, AGORA);
    expect(gerarReceitasRecorrentes(banco, '2026-12-20', AGORA)).toBe(0);
    expect(listarRecorrentes(banco, AGORA)).toEqual([]);
    expect(recorrentesNaLixeira(banco).map((x) => x.id)).toEqual([r.id]);
    // As geradas continuam.
    expect(datasGeradas(r.id)).toHaveLength(3);

    restaurarRecorrente(banco, r.id);
    expect(recorrentesNaLixeira(banco)).toEqual([]);
    expect(listarRecorrentes(banco, AGORA).map((x) => x.id)).toEqual([r.id]);
  });

  it('editar uma recorrente na lixeira é recusado', () => {
    const r = criarRecorrente(banco, modelo(), AGORA);
    removerRecorrente(banco, r.id, AGORA);
    expect(() => editarRecorrente(banco, r.id, modelo({ valorCentavos: 1 }), AGORA)).toThrow(
      ErroDeNegocio,
    );
  });

  it('conta removida: as próximas receitas são gravadas sem conta', () => {
    const conta = criarConta(banco, { nome: 'Nubank', tipo: 'corrente', saldoCentavos: 0 }, T1);
    const r = criarRecorrente(banco, modelo({ inicio: '2026-08-01', contaId: conta.id }), AGORA);
    removerConta(banco, conta.id, AGORA);
    expect(gerarReceitasRecorrentes(banco, '2026-11-06', AGORA)).toBe(1);
    const nova = banco.db
      .select()
      .from(receitas)
      .where(eq(receitas.recorrenteId, r.id))
      .all()
      .find((x) => x.data === '2026-11-05');
    expect(nova?.contaId).toBeNull();
  });
});

describe('receitas recorrentes: contas e listagem', () => {
  it('gerar não altera o saldo de nenhuma conta', () => {
    const conta = criarConta(banco, { nome: 'Itaú', tipo: 'corrente', saldoCentavos: 150000 }, T1);
    criarRecorrente(banco, modelo({ inicio: '2026-08-01', contaId: conta.id }), AGORA);
    expect(obterConta(banco, conta.id)?.saldoCentavos).toBe(150000);
    atualizarSaldo(banco, conta.id, 200000, AGORA);
    gerarReceitasRecorrentes(banco, '2026-11-06', AGORA);
    expect(obterConta(banco, conta.id)?.saldoCentavos).toBe(200000);
  });

  it('receita avulsa não é marcada como recorrente', () => {
    criarRecorrente(banco, modelo({ inicio: '2026-10-01' }), AGORA);
    lancarReceita(banco, { categoria: 'Freelance', data: '2026-10-03', valorCentavos: 50000 }, T1);
    const marcadas = receitasDoMes(banco, '2026-10').map((r) => r.recorrente);
    expect(marcadas.sort()).toEqual([false, true]);
  });

  it('listarRecorrentes traz próxima data e quantas já foram geradas', () => {
    const r = criarRecorrente(banco, modelo({ inicio: '2026-08-01' }), AGORA);
    const linha = listarRecorrentes(banco, AGORA).find((x) => x.id === r.id);
    expect(linha).toMatchObject({ proxima: '2026-11-05', geradas: 3 });

    const encerrada = criarRecorrente(
      banco,
      modelo({ descricao: 'Bolsa', categoria: 'Bolsa', inicio: '2026-08-01', fim: '2026-10-31' }),
      AGORA,
    );
    const lista = listarRecorrentes(banco, AGORA);
    const achada = lista.find((x) => x.id === encerrada.id);
    expect(achada).toMatchObject({ proxima: null, geradas: 3 });
  });

  it('listarRecorrentes põe as ativas antes das pausadas', () => {
    const pausada = criarRecorrente(banco, modelo({ descricao: 'Pausada' }), AGORA);
    const ativa = criarRecorrente(banco, modelo({ descricao: 'Ativa' }), AGORA);
    pausarRecorrente(banco, pausada.id, AGORA);
    expect(listarRecorrentes(banco, AGORA).map((x) => x.id)).toEqual([ativa.id, pausada.id]);
  });
});

describe('receitas recorrentes: validação', () => {
  it('recusa categoria fora da lista, valor zero, dia fora de 1..31 e conta inexistente', () => {
    expect(() => criarRecorrente(banco, modelo({ categoria: 'Loteria' }), AGORA)).toThrow(
      ErroDeNegocio,
    );
    expect(() => criarRecorrente(banco, modelo({ valorCentavos: 0 }), AGORA)).toThrow(
      ErroDeNegocio,
    );
    expect(() => criarRecorrente(banco, modelo({ diaDoMes: 0 }), AGORA)).toThrow(ErroDeNegocio);
    expect(() => criarRecorrente(banco, modelo({ diaDoMes: 32 }), AGORA)).toThrow(ErroDeNegocio);
    expect(() => criarRecorrente(banco, modelo({ contaId: 'nao-existe' }), AGORA)).toThrow(
      ErroDeNegocio,
    );
    expect(totalModelos()).toBe(0);
  });

  it('recusa fim antes do início', () => {
    expect(() =>
      criarRecorrente(banco, modelo({ inicio: '2026-08-01', fim: '2026-07-31' }), AGORA),
    ).toThrow(ErroDeNegocio);
  });

  it('formulário: lê os campos de texto e devolve os dados do modelo', () => {
    const r = receitaRecorrenteForm.safeParse({
      valor: '1.000,00',
      categoria: 'Bolsa',
      dia: '5',
      inicio: '2026-03-10',
      fim: '',
      descricao: '  Bolsa de pesquisa ',
      conta: '',
      observacao: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({
        valorCentavos: 100000,
        categoria: 'Bolsa',
        diaDoMes: 5,
        inicio: '2026-03-10',
        fim: null,
        descricao: 'Bolsa de pesquisa',
        contaId: null,
        observacao: null,
      });
    }
  });

  it('formulário: fim antes do início e data inválida viram erro no campo', () => {
    const base = {
      valor: '10,00',
      categoria: 'Salário',
      dia: '5',
      inicio: '2026-03-10',
      descricao: '',
      conta: '',
      observacao: '',
    };
    const antes = receitaRecorrenteForm.safeParse({ ...base, fim: '2026-03-09' });
    expect(antes.success).toBe(false);
    expect(antes.error?.issues[0]?.path).toEqual(['fim']);

    const invalida = receitaRecorrenteForm.safeParse({ ...base, fim: '2026-02-30' });
    expect(invalida.success).toBe(false);
    expect(invalida.error?.issues[0]?.path).toEqual(['fim']);
  });
});

describe('revisão: restaurar e modelos ruins', () => {
  it('restaurar da lixeira não lança os meses em que o modelo ficou lá', () => {
    const r = criarRecorrente(
      banco,
      modelo({ inicio: '2026-08-01' }),
      new Date('2026-08-10T12:00:00Z'),
    );
    // Em agosto gerou 1 (dia 5). Fica na lixeira até outubro.
    removerRecorrente(banco, r.id, new Date('2026-08-20T12:00:00Z'));
    gerarReceitasRecorrentes(banco, '2026-10-15');
    expect(
      banco.db.select().from(receitas).where(eq(receitas.recorrenteId, r.id)).all(),
    ).toHaveLength(1);

    const volta = restaurarRecorrente(banco, r.id, AGORA);
    expect(volta.inicio).toBe('2026-10-15');
    gerarReceitasRecorrentes(banco, '2026-10-15', AGORA);
    // Setembro e outubro (dia 5) não foram lançados retroativamente.
    expect(
      banco.db.select().from(receitas).where(eq(receitas.recorrenteId, r.id)).all(),
    ).toHaveLength(1);
    // Em novembro volta a gerar.
    gerarReceitasRecorrentes(banco, '2026-11-06', AGORA);
    expect(
      banco.db.select().from(receitas).where(eq(receitas.recorrenteId, r.id)).all(),
    ).toHaveLength(2);
  });

  it('restaurar modelo cujo fim já passou volta pausado e não gera nada', () => {
    const r = criarRecorrente(
      banco,
      modelo({ inicio: '2026-01-01', fim: '2026-03-31' }),
      new Date('2026-02-10T12:00:00Z'),
    );
    removerRecorrente(banco, r.id, new Date('2026-02-11T12:00:00Z'));
    expect(() => restaurarRecorrente(banco, r.id, AGORA)).not.toThrow();
    expect(obterRecorrente(banco, r.id)?.inicio).toBe('2026-01-01');
    expect(obterRecorrente(banco, r.id)?.ativa).toBe(false);
    expect(gerarReceitasRecorrentes(banco, '2026-10-15', AGORA)).toBe(0);
  });

  it('modelo que passa da trava de ocorrências é ignorado e não derruba os outros', () => {
    banco.db
      .insert(receitasRecorrentes)
      .values({ categoria: 'Salário', valorCentavos: 100, diaDoMes: 1, inicio: '1900-01-01' })
      .run();
    const ok = criarRecorrente(banco, modelo({ inicio: '2026-09-01' }), AGORA);
    expect(() => gerarReceitasRecorrentes(banco, '2026-10-15', AGORA)).not.toThrow();
    expect(
      banco.db.select().from(receitas).where(eq(receitas.recorrenteId, ok.id)).all().length,
    ).toBeGreaterThan(0);
  });
});

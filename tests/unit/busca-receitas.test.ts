import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../../src/lib/server/db/conexao';
import { receitas } from '../../src/lib/server/db/esquema';
import { criarConta } from '../../src/lib/server/servicos/contas';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import { lancarReceita } from '../../src/lib/server/servicos/receitas';
import { buscarReceitas, exportarReceitas } from '../../src/lib/server/servicos/relatorios';
import { filtrarReceitas, type ReceitaDoMes } from '../../src/lib/dominio/receitas';
import { receitasParaCsv, receitasParaJson } from '../../src/lib/dominio/relatorios';
import { filtroReceitasForm } from '../../src/lib/validacao/nucleo';
import { bancoEmMemoria } from './ajuda-banco';

let banco: Banco;
beforeEach(() => {
  banco = bancoEmMemoria();
});
afterEach(() => {
  banco.sqlite.close();
});

/** "Hoje" fixo dos testes: outubro de 2026. */
const AGORA = new Date('2026-10-15T12:00:00');

function receita(extra: Partial<ReceitaDoMes> = {}): ReceitaDoMes {
  return {
    id: 'r1',
    data: '2026-03-10',
    descricao: 'Salário de março',
    categoria: 'Salário',
    valorCentavos: 300000,
    contaNome: 'Nubank',
    contaRemovida: false,
    recorrente: false,
    confirmada: true,
    ...extra,
  };
}

const LISTA: ReceitaDoMes[] = [
  receita({ id: 'a', data: '2026-03-05', descricao: 'Salário', valorCentavos: 300000 }),
  receita({
    id: 'b',
    data: '2026-03-20',
    descricao: 'Freela site',
    categoria: 'Freelance',
    contaNome: 'Caixa',
    valorCentavos: 45050,
    confirmada: false,
  }),
  receita({
    id: 'c',
    data: '2026-04-01',
    descricao: 'Reembolso médico',
    categoria: 'Reembolso',
    contaNome: null,
    valorCentavos: 12000,
    recorrente: true,
  }),
];

/** Insere uma receita prevista (sem confirmação), como a gerada por recorrente. */
function prevista(data: string, valorCentavos: number, descricao = 'Bolsa') {
  banco.db
    .insert(receitas)
    .values({ descricao, categoria: 'Bolsa', data, valorCentavos, confirmadaEm: null })
    .run();
}

describe('filtrarReceitas (domínio)', () => {
  it('sem critérios devolve tudo, em array novo', () => {
    const r = filtrarReceitas(LISTA, {});
    expect(r).toHaveLength(3);
    expect(r).not.toBe(LISTA);
  });

  it('texto ignora maiúsculas e acentos e procura em descrição, categoria e conta', () => {
    expect(filtrarReceitas(LISTA, { texto: 'SALARIO' }).map((x) => x.id)).toEqual(['a']);
    expect(filtrarReceitas(LISTA, { texto: 'freelance' }).map((x) => x.id)).toEqual(['b']);
    expect(filtrarReceitas(LISTA, { texto: 'caixa' }).map((x) => x.id)).toEqual(['b']);
    expect(filtrarReceitas(LISTA, { texto: '   ' })).toHaveLength(3);
  });

  it('situação: recebida exclui previstas, prevista só as previstas', () => {
    expect(filtrarReceitas(LISTA, { situacao: 'recebida' }).map((x) => x.id)).toEqual(['a', 'c']);
    expect(filtrarReceitas(LISTA, { situacao: 'prevista' }).map((x) => x.id)).toEqual(['b']);
    expect(filtrarReceitas(LISTA, { situacao: 'todas' })).toHaveLength(3);
  });

  it('período é inclusivo, e categoria e conta são nomes exatos', () => {
    expect(
      filtrarReceitas(LISTA, { de: '2026-03-20', ate: '2026-04-01' }).map((x) => x.id),
    ).toEqual(['b', 'c']);
    expect(filtrarReceitas(LISTA, { categoria: 'Salário' }).map((x) => x.id)).toEqual(['a']);
    expect(filtrarReceitas(LISTA, { categoria: 'Salario' })).toEqual([]);
    expect(filtrarReceitas(LISTA, { contaNome: 'Caixa' }).map((x) => x.id)).toEqual(['b']);
  });

  it('valor mínimo e máximo são inclusivos, em centavos', () => {
    expect(filtrarReceitas(LISTA, { minCentavos: 45050, maxCentavos: 45050 })).toHaveLength(1);
    expect(filtrarReceitas(LISTA, { minCentavos: 100000 }).map((x) => x.id)).toEqual(['a']);
  });

  it('dia, situação ou valor inválidos lançam RangeError', () => {
    expect(() => filtrarReceitas(LISTA, { de: '2026-02-30' })).toThrow(RangeError);
    expect(() => filtrarReceitas(LISTA, { minCentavos: 10.5 })).toThrow(RangeError);
    expect(() => filtrarReceitas(LISTA, { situacao: 'talvez' as 'todas' })).toThrow(RangeError);
  });
});

describe('receitasParaCsv e receitasParaJson (domínio)', () => {
  it('CSV: cabeçalho, ponto e vírgula, vírgula decimal e fim de linha \\r\\n, sem BOM', () => {
    const csv = receitasParaCsv([LISTA[0]!, LISTA[1]!]);
    expect(csv).toBe(
      [
        'Data;Descrição;Categoria;Valor;Conta;Situação;Recorrente',
        '2026-03-05;Salário;Salário;3000,00;Nubank;Recebida;Não',
        '2026-03-20;Freela site;Freelance;450,50;Caixa;Prevista;Não',
        '',
      ].join('\r\n'),
    );
  });

  it('CSV: protege fórmula, aspas e ponto e vírgula; recorrente aparece como Sim', () => {
    const csv = receitasParaCsv([
      receita({ descricao: '=HYPERLINK("x")', recorrente: true, contaNome: 'Conta; "B"' }),
    ]);
    const linha = csv.split('\r\n')[1]!;
    // Fórmula ganha apóstrofo; aspas dobram e o campo vai entre aspas.
    expect(linha.startsWith('2026-03-10;"\'=HYPERLINK(""x"")";Salário;')).toBe(true);
    expect(linha.endsWith(';"Conta; ""B""";Recebida;Sim')).toBe(true);
  });

  it('JSON: valor em centavos e como texto, situação e recorrente', () => {
    const json = JSON.parse(receitasParaJson([LISTA[1]!, LISTA[2]!]));
    expect(json[0]).toMatchObject({
      data: '2026-03-20',
      categoria: 'Freelance',
      valorCentavos: 45050,
      valor: '450.50',
      conta: 'Caixa',
      situacao: 'prevista',
      recorrente: false,
    });
    expect(json[1]).toMatchObject({ conta: null, situacao: 'recebida', recorrente: true });
  });
});

describe('buscarReceitas (serviço)', () => {
  it('separa o total recebido do previsto e não soma previstas como entradas', () => {
    const conta = criarConta(
      banco,
      { nome: 'Conta busca receitas', tipo: 'corrente', saldoCentavos: 0 },
      AGORA,
    ).id;
    lancarReceita(
      banco,
      {
        descricao: 'Salário teste',
        categoria: 'Salário',
        data: '2026-09-05',
        valorCentavos: 100000,
        contaId: conta,
      },
      AGORA,
    );
    lancarReceita(
      banco,
      {
        descricao: 'Presente teste',
        categoria: 'Presente',
        data: '2026-09-20',
        valorCentavos: 2550,
      },
      AGORA,
    );
    prevista('2026-09-25', 30000, 'Bolsa teste');

    const r = buscarReceitas(banco, { texto: 'teste' }, AGORA);
    expect(r.totalRecebidoCentavos).toBe(102550);
    expect(r.totalPrevistoCentavos).toBe(30000);
    expect(r.receitas.map((x) => x.data)).toEqual(['2026-09-25', '2026-09-20', '2026-09-05']);
    expect(r.truncado).toBe(false);
  });

  it('filtra por situação e por período de datas', () => {
    prevista('2026-09-28', 5000, 'Bolsa situacao');
    const previstas = buscarReceitas(banco, { situacao: 'prevista', texto: 'situacao' }, AGORA);
    expect(previstas.receitas).toHaveLength(1);
    expect(previstas.totalPrevistoCentavos).toBe(5000);
    expect(previstas.totalRecebidoCentavos).toBe(0);

    const fora = buscarReceitas(
      banco,
      { texto: 'situacao', de: '2026-01-01', ate: '2026-02-28' },
      AGORA,
    );
    expect(fora.receitas).toEqual([]);
  });

  it('sem datas vale os últimos 12 meses; com datas, elas valem também para os dias', () => {
    lancarReceita(
      banco,
      { descricao: 'Antiga', categoria: 'Outros', data: '2014-01-10', valorCentavos: 100 },
      AGORA,
    );
    lancarReceita(
      banco,
      { descricao: 'Recente', categoria: 'Outros', data: '2026-06-10', valorCentavos: 200 },
      AGORA,
    );
    const padrao = buscarReceitas(banco, {}, AGORA);
    expect(padrao.receitas.map((x) => x.descricao)).toEqual(['Recente']);

    const comDatas = buscarReceitas(banco, { de: '2026-06-11', ate: '2026-06-30' }, AGORA);
    expect(comDatas.receitas).toEqual([]);
  });

  it('limita a 500 linhas, mas os totais contam tudo', () => {
    for (let i = 0; i < 501; i++) {
      banco.db
        .insert(receitas)
        .values({
          descricao: 'Lote',
          categoria: 'Outros',
          data: '2026-05-10',
          valorCentavos: 1,
          confirmadaEm: AGORA.toISOString(),
        })
        .run();
    }
    const r = buscarReceitas(banco, { texto: 'lote' }, AGORA);
    expect(r.receitas).toHaveLength(500);
    expect(r.truncado).toBe(true);
    expect(r.totalRecebidoCentavos).toBe(501);
  });
});

describe('exportarReceitas (serviço)', () => {
  beforeEach(() => {
    lancarReceita(
      banco,
      {
        descricao: 'Bolsa de estudo',
        categoria: 'Bolsa',
        data: '2026-02-10',
        valorCentavos: 80000,
      },
      AGORA,
    );
    prevista('2026-01-05', 1500, 'Previsão');
  });

  it('CSV: nome pelo período, BOM no começo, do mais antigo para o mais novo', () => {
    const arquivo = exportarReceitas(banco, { de: '2026-01', ate: '2026-02', formato: 'csv' });
    expect(arquivo.nome).toBe('receitas-2026-01-a-2026-02.csv');
    expect(arquivo.tipo).toBe('text/csv; charset=utf-8');
    expect(arquivo.conteudo.startsWith('﻿')).toBe(true);
    const linhas = arquivo.conteudo.slice(1).split('\r\n');
    expect(linhas[1]!.startsWith('2026-01-05;Previsão;Bolsa;15,00;')).toBe(true);
    expect(linhas[2]!.startsWith('2026-02-10;Bolsa de estudo;Bolsa;800,00;')).toBe(true);
  });

  it('JSON e formato inválido', () => {
    const arquivo = exportarReceitas(banco, { de: '2026-01', ate: '2026-02', formato: 'json' });
    expect(arquivo.nome).toBe('receitas-2026-01-a-2026-02.json');
    expect(JSON.parse(arquivo.conteudo)).toHaveLength(2);
    expect(() =>
      exportarReceitas(banco, { de: '2026-01', ate: '2026-02', formato: 'xml' as 'csv' }),
    ).toThrow(ErroDeNegocio);
  });
});

describe('filtroReceitasForm (validação da busca)', () => {
  it('campos vazios viram ausentes e situação vazia vira todas (undefined)', () => {
    const f = filtroReceitasForm.parse({ q: '  ', situacao: '', origem: 'Caixa', min: '10,50' });
    expect(f.texto).toBeUndefined();
    expect(f.situacao).toBeUndefined();
    expect(f.contaNome).toBe('Caixa');
    expect(f.minCentavos).toBe(1050);
  });

  it('recusa situação desconhecida, valor mínimo acima do máximo e data final antes da inicial', () => {
    const erro = (g: Record<string, string>) => filtroReceitasForm.safeParse(g);
    expect(erro({ situacao: 'talvez' }).success).toBe(false);
    expect(erro({ min: '100', max: '10' }).success).toBe(false);
    expect(erro({ de: '2026-10-20', ate: '2026-10-01' }).success).toBe(false);
    expect(erro({ min: 'abc' }).success).toBe(false);
  });
});

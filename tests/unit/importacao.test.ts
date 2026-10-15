import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../../src/lib/server/db/conexao';
import { lerExportacao } from '../../src/lib/server/importacao/formato';
import {
  bancoSemDados,
  ErroImportacao,
  importarDoApp,
} from '../../src/lib/server/importacao/importar';
import {
  garantirCategoriasPadrao,
  listarCategorias,
} from '../../src/lib/server/servicos/categorias';
import { criarConta, historicoDeSaldos, listarContas } from '../../src/lib/server/servicos/contas';
import { lancamentosDoMes } from '../../src/lib/server/servicos/gastos';
import { limiteDoMes } from '../../src/lib/server/servicos/limite';
import { montarPainel } from '../../src/lib/server/servicos/painel';
import { bancoEmMemoria } from './ajuda-banco';

/** Dados fictícios no formato do botão "Exportar dados" do app atual. */
const EXEMPLO = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/app-v3-exemplo.json'), 'utf8'),
) as { colecoes: Record<string, unknown[]> };

let banco: Banco;
beforeEach(() => {
  banco = bancoEmMemoria();
});
afterEach(() => banco.sqlite.close());

const contar = (t: string) =>
  (banco.sqlite.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;

describe('importar do app atual', () => {
  it('importa tudo e a conferência com as regras do app bate', () => {
    garantirCategoriasPadrao(banco); // o site já abriu uma vez: categorias padrão existem
    const r = importarDoApp(banco, lerExportacao(EXEMPLO));
    expect(r.conferencia.diferencas).toEqual([]);
    expect(r.importados).toMatchObject({
      contas: 2,
      cartoes: 1,
      gastos: 5,
      gastosNoCartao: 2,
      parcelas: 7,
      faturas: 3,
      faturasPagas: 1,
      movimentosBitcoin: 2,
      precosBitcoin: 2,
      limite: 300000,
      categoriasArquivadas: 1,
    });
    expect(r.conferencia.saldoContas).toEqual({ noApp: 252590, noBanco: 252590 });
    expect(r.conferencia.sats).toEqual({ noApp: 130000, noBanco: 130000 });
    expect(r.avisos.join('\n')).toMatch(/conta não existe mais/);
  });

  it('contas com histórico e datas do app; categorias na ordem e cores do app', () => {
    importarDoApp(banco, lerExportacao(EXEMPLO));
    const contas = listarContas(banco);
    expect(contas.map((c) => [c.nome, c.saldoCentavos])).toEqual([
      ['Banco Exemplo', 254090],
      ['Carteira', -1500],
    ]);
    expect(historicoDeSaldos(banco, contas[0]!.id)[0]?.registradoEm).toBe(
      '2026-10-10T10:00:00.000Z',
    );
    const cats = listarCategorias(banco, { incluirArquivadas: true });
    expect(cats.slice(0, 5).map((c) => [c.nome, c.cor])).toEqual([
      ['Mercado', 'c0'],
      ['Transporte', 'c1'],
      ['Alimentação', 'c2'],
      ['Compras', 'c3'],
      ['Pets', 'c4'],
    ]);
    expect(cats.find((c) => c.nome === 'Restaurantes')?.arquivada).toBe(true);
    expect(limiteDoMes(banco, '2026-10')).toBe(300000);
  });

  it('compra parcelada no cartão: competência e faturas certas; fatura paga', () => {
    importarDoApp(banco, lerExportacao(EXEMPLO));
    const faturas = banco.sqlite
      .prepare(
        `SELECT f.mes_vencimento AS mes, f.data_fechamento AS fecha, f.data_vencimento AS vence,
                f.paga_em AS paga, f.valor_pago_centavos AS pago, sum(p.valor_centavos) AS total
           FROM faturas f LEFT JOIN parcelas p ON p.fatura_id = f.id
          GROUP BY f.id ORDER BY f.mes_vencimento`,
      )
      .all();
    expect(faturas).toEqual([
      {
        mes: '2026-10',
        fecha: '2026-10-03',
        vence: '2026-10-10',
        paga: '2026-10-09',
        pago: 39324,
        total: 39324,
      },
      {
        mes: '2026-11',
        fecha: '2026-11-03',
        vence: '2026-11-10',
        paga: null,
        pago: null,
        total: 33333,
      },
      {
        mes: '2026-12',
        fecha: '2026-12-03',
        vence: '2026-12-10',
        paga: null,
        pago: null,
        total: 33333,
      },
    ]);
    // Competência: mês da compra + i (setembro, outubro, novembro).
    expect(
      lancamentosDoMes(banco, '2026-09').find((l) => l.descricao === 'Notebook'),
    ).toMatchObject({
      parcela: 1,
      numParcelas: 3,
      valorCentavos: 33334,
      cartaoNome: 'Cartão Exemplo',
    });
    expect(montarPainel(banco, '2026-10', '2026-10-15').totalMesCentavos).toBe(
      1200 + 33333 + 5990 + 800,
    );
  });

  it('gasto sem descrição e conta inexistente entram sem elas', () => {
    importarDoApp(banco, lerExportacao(EXEMPLO));
    const out = lancamentosDoMes(banco, '2026-10');
    expect(out.find((l) => l.categoriaNome === 'Transporte')).toMatchObject({
      descricao: null,
      contaNome: null,
    });
    expect(out.find((l) => l.descricao === 'Café')?.contaNome).toBeNull();
  });

  it('aceita também o conteúdo cru do navegador (sem o envelope)', () => {
    const r = importarDoApp(banco, lerExportacao(EXEMPLO.colecoes));
    expect(r.importados.gastos).toBe(5);
  });

  it('simular não grava nada', () => {
    const r = importarDoApp(banco, lerExportacao(EXEMPLO), { simular: true });
    expect(r.simulado).toBe(true);
    expect(r.importados.contas).toBe(2);
    expect(bancoSemDados(banco)).toBe(true);
    expect(contar('compras')).toBe(0);
  });

  it('recusa banco que já tem dados (nunca duplica)', () => {
    criarConta(banco, { nome: 'Já existe', tipo: 'corrente', saldoCentavos: 0 });
    expect(() => importarDoApp(banco, lerExportacao(EXEMPLO))).toThrow(ErroImportacao);
    expect(contar('contas')).toBe(1);
  });

  it('qualquer problema cancela tudo (transação única)', () => {
    const ruim = structuredClone(EXEMPLO);
    (ruim.colecoes.gastos as { parcelas: number }[])[2]!.parcelas = 30;
    (ruim.colecoes.gastos as { data: string }[])[0]!.data = '2026-02-30';
    expect(() => importarDoApp(banco, lerExportacao(ruim))).toThrow(
      /30 parcelas[\s\S]*|data inválida/,
    );
    try {
      importarDoApp(banco, lerExportacao(ruim));
    } catch (e) {
      expect((e as ErroImportacao).problemas).toHaveLength(2);
    }
    expect(bancoSemDados(banco)).toBe(true);
    expect(contar('categorias')).toBe(0);
  });

  it('formato errado: mensagem com o caminho do campo', () => {
    expect(() => lerExportacao({ contas: [{ id: 'x', nome: 'A', saldo: 10.5 }] })).toThrow(
      /contas\.0\.saldo/,
    );
    expect(() => lerExportacao({ gastos: 'nada' })).toThrow(/gastos/);
  });

  it('nomes de conta repetidos ganham sufixo', () => {
    const r = importarDoApp(
      banco,
      lerExportacao({
        contas: [
          { id: 'a', nome: 'Nubank', saldo: 1 },
          { id: 'b', nome: 'nubank', saldo: 2 },
        ],
      }),
    );
    expect(listarContas(banco).map((c) => c.nome)).toEqual(['Nubank', 'nubank (2)']);
    expect(r.avisos[0]).toMatch(/repetida/);
  });
});

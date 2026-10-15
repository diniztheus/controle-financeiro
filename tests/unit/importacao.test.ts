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
import { aPagarCartoes, listarCartoes } from '../../src/lib/server/servicos/cartoes';
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

describe('importar: casos da auditoria final', () => {
  const comDados = (f: (c: Record<string, unknown[]>) => void) => {
    const c = structuredClone(EXEMPLO.colecoes);
    f(c);
    return lerExportacao(c);
  };

  it('site já aberto (categorias padrão criadas): lista igual à do app, sem cores repetidas', () => {
    garantirCategoriasPadrao(banco);
    const r = importarDoApp(banco, lerExportacao(EXEMPLO));
    const todas = listarCategorias(banco, { incluirArquivadas: true });
    const ativas = todas.filter((c) => !c.arquivada).map((c) => c.nome);
    expect(ativas).toEqual(['Mercado', 'Transporte', 'Alimentação', 'Compras', 'Pets']);
    expect(new Set(todas.map((c) => c.ordem)).size).toBe(todas.length);
    expect(new Set(todas.slice(0, 11).map((c) => c.cor)).size).toBe(11);
    // 11 padrão − 4 que o app tinha = 7 arquivadas do site, mais Restaurantes (só em gastos).
    expect(r.importados.categoriasDoSiteArquivadas).toBe(7);
    expect(todas.filter((c) => c.arquivada)).toHaveLength(8);
  });

  it('diferença na conferência cancela tudo, a menos que seja aceita', () => {
    const forcar = (c: { diferencas: unknown[] }) =>
      c.diferencas.push({ item: 'teste', noApp: 1, noBanco: 2 });
    expect(() => importarDoApp(banco, lerExportacao(EXEMPLO), { aoConferir: forcar })).toThrow(
      /não bateram/,
    );
    expect(bancoSemDados(banco)).toBe(true);
    const r = importarDoApp(banco, lerExportacao(EXEMPLO), {
      aoConferir: forcar,
      aceitarDiferencas: true,
    });
    expect(r.conferencia.diferencas).toHaveLength(1);
    expect(bancoSemDados(banco)).toBe(false);
  });

  it('compra de cartão que não existe mais entra num cartão na lixeira, sem cancelar', () => {
    const r = importarDoApp(
      banco,
      comDados((c) => {
        (c.gastos as { cartaoId: string }[])[3]!.cartaoId = 'apagado';
      }),
    );
    expect(r.importados.cartoesRemovidos).toBe(1);
    expect(r.conferencia.diferencas).toEqual([]);
    const k = banco.sqlite
      .prepare('SELECT ativo, removido_em AS r, dia_fechamento AS f FROM cartoes WHERE ativo = 0')
      .get() as { ativo: number; r: string | null; f: number };
    expect(k).toMatchObject({ ativo: 0, f: 1 });
    expect(k.r).not.toBeNull();
  });

  it('limite já definido no site e preço repetido não quebram', () => {
    banco.sqlite.exec(`INSERT INTO limites_mensais (mes, valor_centavos) VALUES ('padrao', 100)`);
    const r = importarDoApp(
      banco,
      comDados((c) => {
        (c.btcPrecos as unknown[]).push({ id: '2026-10-14', valor: 37000000 });
      }),
    );
    expect(limiteDoMes(banco, '2026-10')).toBe(300000);
    expect(r.avisos.join('\n')).toMatch(/limite do mês definido no site/);
    expect(r.avisos.join('\n')).toMatch(/repetido: ficou o último/);
    expect(
      banco.sqlite
        .prepare("SELECT preco_centavos AS p FROM btc_precos WHERE data = '2026-10-14'")
        .get(),
    ).toEqual({ p: 37000000 });
  });

  it('valor negativo no bitcoin é guardado positivo, com aviso, e conferido', () => {
    const r = importarDoApp(
      banco,
      comDados((c) => {
        (c.bitcoin as { valor: number }[])[1]!.valor = -9000;
      }),
    );
    expect(r.avisos.join('\n')).toMatch(/negativo/);
    expect(r.conferencia.diferencas).toEqual([]);
  });

  it('dois cartões com o mesmo nome não geram falso alarme', () => {
    const r = importarDoApp(
      banco,
      comDados((c) => {
        (c.cartoes as unknown[]).push({
          id: 'k2',
          nome: 'Cartão Exemplo',
          fechamento: 20,
          vencimento: 1,
        });
        (c.gastos as { cartaoId: string }[])[3]!.cartaoId = 'k2';
      }),
    );
    expect(r.conferencia.diferencas).toEqual([]);
  });

  it('fatura sem data de pagamento entra como não paga; id de cartão com "__"', () => {
    const r = importarDoApp(
      banco,
      comDados((c) => {
        (c.faturas as { pagaEm: string | null }[])[0]!.pagaEm = null;
        (c.faturas as unknown[]).push({ id: 'k1__2026-11', pagaEm: '2026-11-08' });
      }),
    );
    expect(r.importados.faturasPagas).toBe(1);
    expect(r.avisos.join('\n')).toMatch(/não paga/);
    const pagas = banco.sqlite
      .prepare('SELECT mes_vencimento AS m FROM faturas WHERE paga_em IS NOT NULL')
      .all();
    expect(pagas).toEqual([{ m: '2026-11' }]);
  });

  it('data com hora é aceita com aviso; parcelas não inteiras cancelam com mensagem própria', () => {
    const r = importarDoApp(
      banco,
      comDados((c) => {
        (c.gastos as { data: string }[])[0]!.data = '2026-09-05T12:00:00.000Z';
      }),
    );
    expect(r.avisos.join('\n')).toMatch(/data com hora; ficou 2026-09-05/);
    expect(r.conferencia.diferencas).toEqual([]);

    const outro = bancoEmMemoria();
    try {
      expect(() =>
        importarDoApp(
          outro,
          comDados((c) => {
            (c.gastos as { parcelas: string }[])[2]!.parcelas = '2.5';
          }),
        ),
      ).toThrow(/não é inteiro/);
    } finally {
      outro.sqlite.close();
    }
  });

  it('fechamento acima de 31 vale como 31 (como o app), com aviso', () => {
    const r = importarDoApp(
      banco,
      comDados((c) => {
        (c.cartoes as { fechamento: number }[])[0]!.fechamento = 35;
      }),
    );
    expect(r.avisos.join('\n')).toMatch(/virou 31/);
    expect(r.conferencia.diferencas).toEqual([]);
  });
});

describe('importar: última revisão', () => {
  it('movimento de 0 sats com valor não gera diferença falsa', () => {
    const c = structuredClone(EXEMPLO.colecoes);
    (c.bitcoin as unknown[]).push({ id: 'b0', sats: 0, valor: 1000, data: '2026-10-02' });
    const r = importarDoApp(banco, lerExportacao(c));
    expect(r.conferencia.diferencas).toEqual([]);
    expect(r.avisos.join('\n')).toMatch(/0 sats ignorado/);
  });

  it('campos e coleções desconhecidos viram aviso; fatura com paga:false não entra paga', () => {
    const c = structuredClone(EXEMPLO.colecoes) as Record<string, unknown>;
    (c.gastos as Record<string, unknown>[])[0]!.observacao = 'algo';
    c.extras = [{ id: 'x' }];
    (c.faturas as Record<string, unknown>[])[0]!.paga = false;
    const r = importarDoApp(banco, lerExportacao(c));
    const avisos = r.avisos.join('\n');
    expect(avisos).toMatch(/Campo "observacao" em gastos foi ignorado \(1 documento/);
    expect(avisos).toMatch(/Coleção "extras" do arquivo foi ignorada/);
    expect(r.importados.faturasPagas).toBe(0);
  });

  it('preço repetido conta uma vez no relatório', () => {
    const c = structuredClone(EXEMPLO.colecoes);
    (c.btcPrecos as unknown[]).push({ id: '2026-10-14', valor: 1 });
    expect(importarDoApp(banco, lerExportacao(c)).importados.precosBitcoin).toBe(2);
  });
});

describe('onda 2: números do cartão e patrimônio batem com o app atual', () => {
  it('dívida, limite disponível e patrimônio depois de importar', () => {
    importarDoApp(banco, lerExportacao(EXEMPLO));
    // Faturas de nov e dez (33.333 cada) estão abertas; a de outubro foi paga no app.
    expect(aPagarCartoes(banco)).toBe(66666);
    const [cartao] = listarCartoes(banco);
    expect(cartao).toMatchObject({
      nome: 'Cartão Exemplo',
      aPagarCentavos: 66666,
      disponivelCentavos: 500000 - 66666,
    });
    expect(cartao?.proximaFatura).toMatchObject({ mes: '2026-11', totalCentavos: 33333 });

    const painel = montarPainel(banco, '2026-10', '2026-10-15');
    expect(painel.patrimonio.aPagarCartoesCentavos).toBe(66666);
    expect(painel.patrimonio.liquidoCentavos).toBe(
      painel.patrimonio.contasCentavos + painel.patrimonio.bitcoinCentavos - 66666,
    );
  });
});

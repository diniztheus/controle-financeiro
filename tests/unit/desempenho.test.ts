import { describe, expect, it } from 'vitest';
import { diferencaMeses, somarMeses } from '../../src/lib/dominio/datas';
import {
  gerarDadosDeTeste,
  type ResumoDadosDeTeste,
} from '../../src/lib/server/importacao/dadosDeTeste';
import type { Banco } from '../../src/lib/server/db/conexao';
import {
  relatorioCategorias,
  buscarLancamentos,
  buscarReceitas,
  evolucaoPatrimonioMensal,
  exportar,
  fluxoDeCaixa,
} from '../../src/lib/server/servicos/relatorios';
import { aPagarCartoes, listarCartoes, obterFatura } from '../../src/lib/server/servicos/cartoes';
import { lancamentosDoMes } from '../../src/lib/server/servicos/gastos';
import { montarPainel } from '../../src/lib/server/servicos/painel';
import { painelBitcoin } from '../../src/lib/server/servicos/bitcoin';
import { gerarReceitasRecorrentes } from '../../src/lib/server/servicos/recorrentes';
import { verificarIntegridade } from '../../src/lib/server/servicos/integridade';
import { bancoEmMemoria } from './ajuda-banco';

/*
 * Desempenho com 10 anos de dados. O gerador é determinístico e a data final é fixa, então o
 * teste sempre confere o mesmo histórico. Os orçamentos de tempo são GENEROSOS (1,5 s por operação):
 * a meta real (abaixo de 300 ms na tela) é medida por `pnpm desempenho`, não aqui, para o teste
 * não dar falso positivo em máquina lenta.
 */

const FIM = '2026-10-17';
const AGORA = new Date('2026-10-17T12:00:00');
const MES = '2026-10';
const ORCAMENTO_MS = 1500;

function um(banco: Banco, sql: string, ...params: unknown[]): number {
  const r = banco.sqlite.prepare(sql).get(...params) as Record<string, number>;
  return Object.values(r)[0]!;
}

/** Cronometra uma operação e confere o orçamento de tempo. Devolve o resultado. */
function medido<T>(nome: string, operacao: () => T): T {
  const t0 = performance.now();
  const resultado = operacao();
  const ms = performance.now() - t0;
  expect(ms, `${nome} levou ${ms.toFixed(0)} ms`).toBeLessThan(ORCAMENTO_MS);
  return resultado;
}

describe('dados de teste de 10 anos', () => {
  it('gera o histórico com as contagens esperadas', () => {
    const banco = bancoEmMemoria();
    const r: ResumoDadosDeTeste = gerarDadosDeTeste(banco, { anos: 10, fim: FIM });

    expect(r.meses).toBe(120);
    expect(r.inicio).toBe('2016-11-01');
    expect(r.fim).toBe(FIM);

    // Cadastros: 3 contas (3 * 120 saldos mensais), 11 categorias padrão, 3 cartões (1 arquivado).
    expect(um(banco, 'SELECT COUNT(*) FROM contas')).toBe(3);
    expect(r.saldos).toBe(3 * 120);
    expect(um(banco, 'SELECT COUNT(*) FROM saldos_historico')).toBe(3 * 120);
    expect(um(banco, 'SELECT COUNT(*) FROM categorias')).toBe(11);
    expect(um(banco, 'SELECT COUNT(*) FROM cartoes')).toBe(3);
    expect(um(banco, 'SELECT COUNT(*) FROM cartoes WHERE ativo = 0')).toBe(1);
    expect(um(banco, 'SELECT COUNT(*) FROM receitas_recorrentes')).toBe(2);

    // Gastos: 36 a 44 à vista por mês e 10 a 14 no cartão por mês.
    expect(r.comprasAVista).toBeGreaterThanOrEqual(36 * 120);
    expect(r.comprasAVista).toBeLessThanOrEqual(44 * 120);
    expect(r.comprasCartao).toBeGreaterThanOrEqual(10 * 120);
    expect(r.comprasCartao).toBeLessThanOrEqual(14 * 120);
    expect(um(banco, 'SELECT COUNT(*) FROM compras')).toBe(r.comprasAVista + r.comprasCartao);
    expect(um(banco, 'SELECT COUNT(*) FROM parcelas')).toBe(r.parcelas);
    expect(r.parcelas).toBeGreaterThan(r.comprasAVista + r.comprasCartao);

    // Bitcoin: uma compra por mês (a do último mês pode cair depois de hoje) e um preço por dia.
    expect(r.movimentosBtc).toBeGreaterThanOrEqual(118);
    expect(r.movimentosBtc).toBeLessThanOrEqual(120);
    const dias =
      Math.round(
        (Date.parse(`${FIM}T00:00:00Z`) - Date.parse('2016-11-01T00:00:00Z')) / 86_400_000,
      ) + 1;
    expect(r.precosBtc).toBe(dias);
    expect(um(banco, 'SELECT COUNT(*) FROM btc_precos')).toBe(dias);

    banco.sqlite.close();
  }, 60_000);

  it('é determinístico: a mesma data final gera exatamente o mesmo histórico', () => {
    const a = bancoEmMemoria();
    const b = bancoEmMemoria();
    const ra = gerarDadosDeTeste(a, { anos: 10, fim: FIM });
    const rb = gerarDadosDeTeste(b, { anos: 10, fim: FIM });
    expect(rb).toEqual(ra);
    const soma = (banco: Banco) =>
      um(banco, 'SELECT SUM(valor_centavos) FROM parcelas') +
      um(banco, 'SELECT SUM(valor_centavos) FROM receitas') +
      um(banco, 'SELECT SUM(sats) FROM btc_movimentos');
    expect(soma(b)).toBe(soma(a));
    a.sqlite.close();
    b.sqlite.close();
  }, 60_000);

  it('recusa gravar em banco que já tem dados', () => {
    const banco = bancoEmMemoria();
    gerarDadosDeTeste(banco, { anos: 1, fim: FIM });
    expect(() => gerarDadosDeTeste(banco, { anos: 1, fim: FIM })).toThrow(/já tem dados/);
    banco.sqlite.close();
  }, 60_000);
});

describe('desempenho e coerência com 10 anos de dados', () => {
  // Um banco só para o bloco: gerar uma vez é o caro.
  let banco: Banco;
  const hojeFim = '2026-10-17';

  it('prepara o banco de 10 anos', () => {
    banco = bancoEmMemoria();
    gerarDadosDeTeste(banco, { anos: 10, fim: hojeFim });
  }, 60_000);

  it('cada operação de tela fica dentro do orçamento', () => {
    const cartao = listarCartoes(banco, { incluirArquivados: true }).find(
      (c) => c.nome === 'Cartão principal',
    )!;
    medido('montarPainel', () => montarPainel(banco, MES, hojeFim));
    medido('lancamentosDoMes', () => lancamentosDoMes(banco, MES));
    medido('relatorioCategorias', () => relatorioCategorias(banco, 60, AGORA));
    medido('evolucaoPatrimonioMensal', () => evolucaoPatrimonioMensal(banco, 120, AGORA));
    medido('fluxoDeCaixa', () => fluxoDeCaixa(banco, 60, AGORA));
    medido('buscarLancamentos', () =>
      buscarLancamentos(
        banco,
        { texto: 'padaria', deMes: somarMeses(MES, -119), ateMes: MES },
        AGORA,
      ),
    );
    medido('buscarReceitas', () =>
      buscarReceitas(banco, { deMes: somarMeses(MES, -119), ateMes: MES }, AGORA),
    );
    medido('listarCartoes', () => listarCartoes(banco, { incluirArquivados: true }));
    medido('obterFatura', () => obterFatura(banco, cartao.id, MES, hojeFim));
    medido('aPagarCartoes', () => aPagarCartoes(banco));
    medido('gerarReceitasRecorrentes', () => gerarReceitasRecorrentes(banco, hojeFim, AGORA));
    medido('exportar CSV', () =>
      exportar(banco, { de: somarMeses(MES, -119), ate: MES, formato: 'csv' }),
    );
    medido('painelBitcoin', () => painelBitcoin(banco));
    medido('verificarIntegridade', () => verificarIntegridade(banco));
  });

  it('a dívida dos cartões bate com as parcelas em faturas não pagas', () => {
    // Soma direta das parcelas ligadas a faturas em aberto (sem pagaEm).
    const emAberto = um(
      banco,
      `SELECT COALESCE(SUM(p.valor_centavos), 0) FROM parcelas p
         JOIN faturas f ON f.id = p.fatura_id
         JOIN compras c ON c.id = p.compra_id
        WHERE f.paga_em IS NULL AND c.removido_em IS NULL`,
    );
    expect(aPagarCartoes(banco)).toBe(emAberto);
    const somaCartoes = listarCartoes(banco, { incluirArquivados: true }).reduce(
      (s, c) => s + c.aPagarCentavos,
      0,
    );
    expect(somaCartoes).toBe(emAberto);
    expect(emAberto).toBeGreaterThan(0);
  });

  it('cada fatura paga tem o valor pago igual à soma das suas parcelas', () => {
    const divergentes = um(
      banco,
      `SELECT COUNT(*) FROM faturas f
        WHERE f.paga_em IS NOT NULL
          AND f.valor_pago_centavos <>
              (SELECT COALESCE(SUM(p.valor_centavos), 0) FROM parcelas p WHERE p.fatura_id = f.id)`,
    );
    expect(divergentes).toBe(0);
  });

  it('a fatura do mês atual soma as parcelas que mostra', () => {
    const cartao = listarCartoes(banco, { incluirArquivados: true }).find(
      (c) => c.nome === 'Cartão principal',
    )!;
    const f = obterFatura(banco, cartao.id, MES, hojeFim);
    const soma = f.itens.reduce((s, i) => s + i.valorCentavos, 0);
    expect(f.totalCentavos).toBe(soma);
    expect(f.itens.length).toBeGreaterThan(0);
  });

  it('o painel do mês bate com a lista de lançamentos e com o fluxo', () => {
    const painel = montarPainel(banco, MES, hojeFim);
    const lista = lancamentosDoMes(banco, MES);
    const somaLista = lista.reduce((s, l) => s + l.valorCentavos, 0);
    expect(painel.totalMesCentavos).toBe(somaLista);
    expect(painel.quantidade).toBe(lista.length);
    expect(painel.fluxo.saidasCentavos).toBe(somaLista);

    // Entradas do mês = receitas recebidas (confirmadas) no mês.
    const entradas = um(
      banco,
      `SELECT COALESCE(SUM(valor_centavos), 0) FROM receitas
        WHERE removido_em IS NULL AND confirmada_em IS NOT NULL
          AND data >= '2026-10-01' AND data <= '2026-10-31'`,
    );
    expect(painel.fluxo.entradasCentavos).toBe(entradas);
    expect(painel.fluxo.saldoCentavos).toBe(entradas - somaLista);
  });

  it('o fluxo de caixa de 60 meses é entradas menos saídas, e bate com o banco', () => {
    const f = fluxoDeCaixa(banco, 60, AGORA);
    expect(f.totais.saldoCentavos).toBe(f.totais.entradasCentavos - f.totais.saidasCentavos);
    expect(f.meses).toHaveLength(60);
    const de = somarMeses(MES, -59);
    const saidas = um(
      banco,
      `SELECT COALESCE(SUM(p.valor_centavos), 0) FROM parcelas p
         JOIN compras c ON c.id = p.compra_id
        WHERE c.removido_em IS NULL AND p.mes_competencia >= ? AND p.mes_competencia <= ?`,
      de,
      MES,
    );
    expect(f.totais.saidasCentavos).toBe(saidas);
    const entradas = um(
      banco,
      `SELECT COALESCE(SUM(valor_centavos), 0) FROM receitas
        WHERE removido_em IS NULL AND confirmada_em IS NOT NULL
          AND data >= ? AND data <= '2026-10-31'`,
      `${de}-01`,
    );
    expect(f.totais.entradasCentavos).toBe(entradas);
  });

  it('a busca sem filtro traz o total de todas as parcelas do período', () => {
    const de = somarMeses(MES, -119);
    const r = buscarLancamentos(banco, { deMes: de, ateMes: MES }, AGORA);
    const total = um(
      banco,
      `SELECT COALESCE(SUM(p.valor_centavos), 0) FROM parcelas p
         JOIN compras c ON c.id = p.compra_id
        WHERE c.removido_em IS NULL AND p.mes_competencia >= ? AND p.mes_competencia <= ?`,
      de,
      MES,
    );
    expect(r.totalCentavos).toBe(total);
    expect(r.truncado).toBe(true); // mais de 500 linhas em 10 anos
    expect(r.lancamentos).toHaveLength(500);
  });

  it('a evolução do patrimônio fecha: total = contas + bitcoin - dívida dos cartões', () => {
    const pontos = evolucaoPatrimonioMensal(banco, 120, AGORA);
    expect(pontos).toHaveLength(120);
    for (const p of pontos) {
      expect(p.totalCentavos).toBe(
        p.contasCentavos + p.bitcoinCentavos - (p.dividaCartaoCentavos ?? 0),
      );
    }
    // No último mês, as contas valem a soma dos saldos atuais.
    const saldos = um(banco, 'SELECT SUM(saldo_centavos) FROM contas WHERE removido_em IS NULL');
    expect(pontos.at(-1)!.contasCentavos).toBe(saldos);
  });

  it('a busca de receitas separa recebidas e previstas', () => {
    const r = buscarReceitas(banco, { deMes: somarMeses(MES, -119), ateMes: MES }, AGORA);
    const previstas = um(
      banco,
      `SELECT COALESCE(SUM(valor_centavos), 0) FROM receitas
        WHERE removido_em IS NULL AND confirmada_em IS NULL
          AND data >= ? AND data <= ?`,
      `${somarMeses(MES, -119)}-01`,
      '2026-10-17',
    );
    expect(r.totalPrevistoCentavos).toBe(previstas);
    expect(previstas).toBeGreaterThan(0);
  });

  it('exportação de 120 meses tem uma linha por lançamento (mais o cabeçalho)', () => {
    const de = somarMeses(MES, -119);
    const csv = exportar(banco, { de, ate: MES, formato: 'csv' }).conteudo;
    // Tira o BOM (\uFEFF) do começo: o Excel precisa dele, o teste não.
    const linhas = csv
      .replace(/^\uFEFF/, '')
      .split('\r\n')
      .filter((l) => l.length > 0);
    const total = um(
      banco,
      `SELECT COUNT(*) FROM parcelas p JOIN compras c ON c.id = p.compra_id
        WHERE c.removido_em IS NULL AND p.mes_competencia >= ? AND p.mes_competencia <= ?`,
      de,
      MES,
    );
    expect(linhas).toHaveLength(total + 1);
    expect(diferencaMeses(de, MES)).toBe(119);
  });

  it('o banco continua íntegro depois de tudo', () => {
    expect(verificarIntegridade(banco).ok).toBe(true);
    banco.sqlite.close();
  });
});

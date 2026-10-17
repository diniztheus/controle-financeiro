/**
 * Relatórios: busca de lançamentos, gastos por categoria, comparativo mês a mês, maiores gastos,
 * evolução do patrimônio e exportação (CSV/JSON).
 *
 * Só leitura: nada aqui grava no banco. Os dados vêm dos serviços de gastos, contas e bitcoin
 * (que já deixam a lixeira de fora) e o cálculo fica no domínio (relatorios.ts).
 */
import { and, eq, isNull } from 'drizzle-orm';
import {
  comparativoMensal,
  evolucaoPatrimonio,
  filtrarLancamentos,
  gastosPorCategoriaEmMeses,
  lancamentosParaCsv,
  lancamentosParaJson,
  maioresGastos,
  receitasParaCsv,
  receitasParaJson,
  type FiltroLancamentos,
  type PontoPatrimonio,
  type RegistroSaldo,
} from '../../dominio/relatorios.ts';
import {
  diferencaMeses,
  mesAtual,
  mesDe,
  mesesEntre,
  somarMeses,
  ultimoDiaDoMes,
  type Mes,
} from '../../dominio/datas.ts';
import { dividaCartaoEmData } from '../../dominio/cartoes.ts';
import { parcelasDeCartoes } from './cartoes.ts';
import { somar } from '../../dominio/dinheiro.ts';
import type { Lancamento } from '../../dominio/lancamentos.ts';
import type { Banco } from '../db/conexao.ts';
import { btcPrecos, contas, saldosHistorico } from '../db/esquema.ts';
import { lancamentosDoMes } from './gastos.ts';
import { ErroDeNegocio } from './erros.ts';
import { listarMovimentos } from './bitcoin.ts';
import { receitasDoMes } from './receitas.ts';
import {
  filtrarReceitas,
  fluxoMensal,
  porCategoriaReceita,
  resumoFluxo,
  type FatiaReceita,
  type FiltroReceitas,
  type FluxoMes,
  type ReceitaDoMes,
  type ResumoFluxo,
} from '../../dominio/receitas.ts';

/** Máximo de meses em qualquer consulta de período. */
export const MAX_MESES = 120;
/** Máximo de linhas devolvidas pela busca; acima disso a lista vem truncada. */
const MAX_LINHAS_BUSCA = 500;
/** Marca de ordem de bytes: o Excel só abre CSV UTF-8 com acentos certos se ela vier no começo. */
const BOM_UTF8 = '\uFEFF';
/** Quantos gastos aparecem em "Maiores gastos". */
const TOP_MAIORES = 10;

/** Lista de meses de `de` até `ate`, inclusive. Lança erro de negócio se for inválido ou longo. */
export function intervaloDeMeses(de: Mes, ate: Mes): Mes[] {
  const n = diferencaMeses(de, ate);
  if (n < 0) throw new ErroDeNegocio('O mês inicial é depois do mês final.', 'ate');
  if (n + 1 > MAX_MESES) {
    throw new ErroDeNegocio(`O período não pode passar de ${MAX_MESES} meses.`, 'de');
  }
  return mesesEntre(de, ate);
}

/** Lançamentos de cada mês do período (todos os meses aparecem, mesmo sem gasto). */
export function lancamentosNoPeriodo(banco: Banco, de: Mes, ate: Mes): Record<Mes, Lancamento[]> {
  const porMes: Record<Mes, Lancamento[]> = {};
  for (const mes of intervaloDeMeses(de, ate)) porMes[mes] = lancamentosDoMes(banco, mes);
  return porMes;
}

/** Mais recente primeiro: data, depois criação, depois parcela. */
function ordenarMaisRecentes(l: Lancamento[]): Lancamento[] {
  return [...l].sort(
    (a, b) =>
      b.data.localeCompare(a.data) ||
      b.criadoEm.localeCompare(a.criadoEm) ||
      a.compraId.localeCompare(b.compraId) ||
      a.parcela - b.parcela,
  );
}

function todosOsLancamentos(porMes: Readonly<Record<Mes, readonly Lancamento[]>>): Lancamento[] {
  return Object.values(porMes).flat();
}

/**
 * Busca com filtros. Sem período, vale os últimos 12 meses até o mês atual. Se vierem datas
 * (`de`/`ate`), elas definem os meses consultados e também filtram os dias.
 */
export function buscarLancamentos(
  banco: Banco,
  f: FiltroLancamentos & { deMes?: Mes; ateMes?: Mes },
  agora: Date = new Date(),
): { lancamentos: Lancamento[]; totalCentavos: number; truncado: boolean } {
  const { deMes, ateMes, ...filtro } = f;
  const ate = ateMes ?? (f.ate ? mesDe(f.ate) : mesAtual(agora));
  const de = deMes ?? (f.de ? mesDe(f.de) : somarMeses(ate, -11));
  const encontrados = ordenarMaisRecentes(
    filtrarLancamentos(todosOsLancamentos(lancamentosNoPeriodo(banco, de, ate)), filtro),
  );
  const totalCentavos = somar(encontrados.map((l) => l.valorCentavos));
  return {
    lancamentos: encontrados.slice(0, MAX_LINHAS_BUSCA),
    totalCentavos,
    truncado: encontrados.length > MAX_LINHAS_BUSCA,
  };
}

function exigirUltimosMeses(ultimosMeses: number, max: number, rotulo: string): void {
  if (!Number.isInteger(ultimosMeses) || ultimosMeses < 1 || ultimosMeses > max) {
    throw new ErroDeNegocio(`${rotulo}: escolha de 1 a ${max} meses.`, 'meses');
  }
}

/** Gastos por categoria nos últimos N meses, com comparativo mês a mês e os maiores gastos. */
export function relatorioCategorias(
  banco: Banco,
  ultimosMeses = 6,
  agora: Date = new Date(),
): ReturnType<typeof gastosPorCategoriaEmMeses> & {
  comparativo: ReturnType<typeof comparativoMensal>;
  maiores: Lancamento[];
} {
  exigirUltimosMeses(ultimosMeses, 60, 'Relatório de categorias');
  const ate = mesAtual(agora);
  const de = somarMeses(ate, -(ultimosMeses - 1));
  const porMes = lancamentosNoPeriodo(banco, de, ate);
  const meses = intervaloDeMeses(de, ate);
  const gastos = gastosPorCategoriaEmMeses(meses, porMes);
  return {
    ...gastos,
    comparativo: comparativoMensal(gastos.meses, gastos.totaisPorMes),
    maiores: maioresGastos(todosOsLancamentos(porMes), TOP_MAIORES),
  };
}

/**
 * Patrimônio mês a mês (contas fora da lixeira + bitcoin fora da lixeira).
 * Lê todo o histórico de saldos porque cada mês usa o último saldo até o fim dele.
 */
export function evolucaoPatrimonioMensal(
  banco: Banco,
  ultimosMeses = 12,
  agora: Date = new Date(),
): PontoPatrimonio[] {
  exigirUltimosMeses(ultimosMeses, MAX_MESES, 'Evolução do patrimônio');
  const ate = mesAtual(agora);
  const meses = intervaloDeMeses(somarMeses(ate, -(ultimosMeses - 1)), ate);

  const saldos: RegistroSaldo[] = banco.db
    .select({
      contaId: saldosHistorico.contaId,
      saldoCentavos: saldosHistorico.saldoCentavos,
      registradoEm: saldosHistorico.registradoEm,
    })
    .from(saldosHistorico)
    .innerJoin(contas, and(eq(contas.id, saldosHistorico.contaId), isNull(contas.removidoEm)))
    .all();

  const btcMovs = listarMovimentos(banco).map((m) => ({ sats: m.sats, data: m.data }));
  const precos = banco.db
    .select({ data: btcPrecos.data, precoCentavos: btcPrecos.precoCentavos })
    .from(btcPrecos)
    .all();

  // Dívida de cartões: parcelas de compras feitas até o fim do mês cuja fatura ainda não estava
  // paga naquele dia (pagaEm da fatura ligada à parcela).
  const parcelasCartao = parcelasDeCartoes(banco);
  return evolucaoPatrimonio(meses, saldos, btcMovs, precos).map((p) => {
    const divida = dividaCartaoEmData(parcelasCartao, ultimoDiaDoMes(p.mes));
    return { ...p, totalCentavos: p.totalCentavos - divida, dividaCartaoCentavos: divida };
  });
}

/**
 * Receitas e despesas por mês (entradas, saídas, saldo e taxa de poupança), com o total do
 * período e as receitas por categoria. Saídas são os gastos já lançados em cada mês.
 */
export function fluxoDeCaixa(
  banco: Banco,
  ultimosMeses = 6,
  agora: Date = new Date(),
): { meses: FluxoMes[]; totais: ResumoFluxo; receitasPorCategoria: FatiaReceita[] } {
  exigirUltimosMeses(ultimosMeses, 60, 'Fluxo de caixa');
  const ate = mesAtual(agora);
  const de = somarMeses(ate, -(ultimosMeses - 1));
  const meses = intervaloDeMeses(de, ate);
  const gastos = lancamentosNoPeriodo(banco, de, ate);

  const entradasPorMes: Record<Mes, number> = {};
  const saidasPorMes: Record<Mes, number> = {};
  const receitas: ReceitaDoMes[] = [];
  for (const mes of meses) {
    // Só receitas recebidas entram no fluxo e na composição por categoria (previstas não).
    const doMes = receitasDoMes(banco, mes).filter((r) => r.confirmada !== false);
    receitas.push(...doMes);
    entradasPorMes[mes] = somar(doMes.map((r) => r.valorCentavos));
    saidasPorMes[mes] = somar((gastos[mes] ?? []).map((l) => l.valorCentavos));
  }

  const fluxo = fluxoMensal(meses, entradasPorMes, saidasPorMes);
  const entradas = meses.map((m) => entradasPorMes[m] ?? 0);
  const saidas = meses.map((m) => saidasPorMes[m] ?? 0);
  return {
    meses: fluxo,
    totais: resumoFluxo(somar(entradas), somar(saidas)),
    receitasPorCategoria: porCategoriaReceita(receitas),
  };
}

/** Exporta os lançamentos do período (mais antigo primeiro). CSV traz BOM para o Excel. */
export function exportar(
  banco: Banco,
  d: { de: Mes; ate: Mes; formato: 'csv' | 'json' },
): { nome: string; tipo: string; conteudo: string } {
  const porMes = lancamentosNoPeriodo(banco, d.de, d.ate);
  const lancamentos = todosOsLancamentos(porMes).sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      a.criadoEm.localeCompare(b.criadoEm) ||
      a.compraId.localeCompare(b.compraId) ||
      a.parcela - b.parcela,
  );
  const base = `lancamentos-${d.de}-a-${d.ate}`;
  if (d.formato === 'csv') {
    return {
      nome: `${base}.csv`,
      tipo: 'text/csv; charset=utf-8',
      conteudo: BOM_UTF8 + lancamentosParaCsv(lancamentos),
    };
  }
  if (d.formato === 'json') {
    return {
      nome: `${base}.json`,
      tipo: 'application/json; charset=utf-8',
      conteudo: lancamentosParaJson(lancamentos),
    };
  }
  throw new ErroDeNegocio('Formato inválido. Use csv ou json.', 'formato');
}

/** Resultado da busca de receitas: recebidas e previstas somadas à parte (previstas não entram). */
export interface BuscaReceitas {
  receitas: ReceitaDoMes[];
  totalRecebidoCentavos: number;
  totalPrevistoCentavos: number;
  truncado: boolean;
}

/** Receitas (fora da lixeira) de cada mês do período, do mês mais antigo ao mais novo. */
function receitasNoPeriodo(banco: Banco, de: Mes, ate: Mes): ReceitaDoMes[] {
  return intervaloDeMeses(de, ate).flatMap((mes) => receitasDoMes(banco, mes));
}

/**
 * Busca de receitas com filtros. Sem período, vale os últimos 12 meses até o mês atual. Se vierem
 * datas (`de`/`ate`), elas definem os meses consultados e também filtram os dias. Mais recentes
 * primeiro.
 */
export function buscarReceitas(
  banco: Banco,
  f: FiltroReceitas & { deMes?: Mes; ateMes?: Mes },
  agora: Date = new Date(),
): BuscaReceitas {
  const { deMes, ateMes, ...filtro } = f;
  const ate = ateMes ?? (f.ate ? mesDe(f.ate) : mesAtual(agora));
  const de = deMes ?? (f.de ? mesDe(f.de) : somarMeses(ate, -11));
  const encontradas = filtrarReceitas(receitasNoPeriodo(banco, de, ate), filtro).sort((a, b) =>
    b.data.localeCompare(a.data),
  );
  const recebidas = encontradas.filter((r) => r.confirmada !== false);
  const previstas = encontradas.filter((r) => r.confirmada === false);
  return {
    receitas: encontradas.slice(0, MAX_LINHAS_BUSCA),
    totalRecebidoCentavos: somar(recebidas.map((r) => r.valorCentavos)),
    totalPrevistoCentavos: somar(previstas.map((r) => r.valorCentavos)),
    truncado: encontradas.length > MAX_LINHAS_BUSCA,
  };
}

/** Exporta as receitas do período (mais antiga primeiro). CSV traz BOM para o Excel. */
export function exportarReceitas(
  banco: Banco,
  d: { de: Mes; ate: Mes; formato: 'csv' | 'json' },
): { nome: string; tipo: string; conteudo: string } {
  const receitas = receitasNoPeriodo(banco, d.de, d.ate).sort(
    (a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id),
  );
  const base = `receitas-${d.de}-a-${d.ate}`;
  if (d.formato === 'csv') {
    return {
      nome: `${base}.csv`,
      tipo: 'text/csv; charset=utf-8',
      conteudo: BOM_UTF8 + receitasParaCsv(receitas),
    };
  }
  if (d.formato === 'json') {
    return {
      nome: `${base}.json`,
      tipo: 'application/json; charset=utf-8',
      conteudo: receitasParaJson(receitas),
    };
  }
  throw new ErroDeNegocio('Formato inválido. Use csv ou json.', 'formato');
}

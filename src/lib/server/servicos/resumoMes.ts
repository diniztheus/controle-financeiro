/**
 * Resumo do mês: entradas, saídas, sobra e taxa de poupança, comparados com a média dos três
 * meses anteriores, com as categorias que mais subiram e caíram, o maior gasto e as previstas.
 *
 * Lê o banco (gastos e receitas já sem a lixeira) e deixa a conta para o domínio
 * (dominio/resumoMes.ts). Só leitura. O cartão do painel também sai daqui.
 */
import { mesDe, somarMeses, type Dia, type Mes } from '../../dominio/datas.ts';
import { somar, type Centavos } from '../../dominio/dinheiro.ts';
import { resumoFluxo } from '../../dominio/receitas.ts';
import {
  compararCategorias,
  compararComMedia,
  compararTaxa,
  maiorGasto,
  maisCairam,
  maisSubiram,
  mesesDeReferencia,
  type CategoriaComparada,
  type ComparacaoCategoria,
  type ComparacaoMedia,
  type ComparacaoTaxa,
  type GastoDoMes,
  type MaiorGasto,
} from '../../dominio/resumoMes.ts';
import type { Banco } from '../db/conexao.ts';
import { lancamentosDoMes } from './gastos.ts';
import { receitasDoMes } from './receitas.ts';

export type {
  CategoriaComparada,
  ComparacaoCategoria,
  ComparacaoMedia,
  ComparacaoTaxa,
  MaiorGasto,
};

export interface ResumoMes {
  mes: Mes;
  entradasCentavos: Centavos;
  saidasCentavos: Centavos;
  sobraCentavos: Centavos;
  /** Sobra ÷ entradas, em % com 1 casa; null sem entradas. */
  taxaPoupancaPercentual: number | null;
  /** Linhas de gasto no mês (uma por parcela de competência). */
  quantidadeLancamentos: number;
  /** Receitas confirmadas do mês. */
  quantidadeEntradas: number;
  comparacao: {
    entradas: ComparacaoMedia | null;
    saidas: ComparacaoMedia | null;
    sobra: ComparacaoMedia | null;
    taxa: ComparacaoTaxa | null;
  };
  /** Todas as categorias do mês e dos meses de referência, do maior total para o menor. */
  categorias: ComparacaoCategoria[];
  maisSubiram: CategoriaComparada[];
  maisCairam: CategoriaComparada[];
  maiorGasto: MaiorGasto | null;
  /** Receitas previstas (não confirmadas) do mês: não entram nas entradas. */
  previstas: { quantidade: number; totalCentavos: Centavos };
}

/** Receitas confirmadas do mês (previstas não entram em entradas). */
function entradasConfirmadas(banco: Banco, mes: Mes) {
  return receitasDoMes(banco, mes).filter((r) => r.confirmada !== false);
}

const totalDe = (itens: readonly { valorCentavos: Centavos }[]): Centavos =>
  somar(itens.map((i) => i.valorCentavos));

/** Lê tudo numa transação só, para os números baterem entre si. */
export function resumoDoMes(banco: Banco, mes: Mes): ResumoMes {
  return banco.sqlite.transaction(() => ler(banco, mes)).deferred();
}

function ler(banco: Banco, mes: Mes): ResumoMes {
  const gastos: GastoDoMes[] = lancamentosDoMes(banco, mes);
  const entradas = entradasConfirmadas(banco, mes);
  const fluxo = resumoFluxo(totalDe(entradas), totalDe(gastos));

  // Meses de referência: cada um com os gastos e as entradas confirmadas.
  const anteriores = mesesDeReferencia(mes).map((m) => ({
    gastos: lancamentosDoMes(banco, m),
    entradas: entradasConfirmadas(banco, m),
  }));
  // Média de cada grandeza só conta os meses em que ela tem dados.
  const comGastos = anteriores.filter((a) => a.gastos.length > 0);
  const comEntradas = anteriores.filter((a) => a.entradas.length > 0);
  const comFluxo = anteriores.filter((a) => a.gastos.length > 0 || a.entradas.length > 0);

  const somaSaidas = somar(comGastos.map((a) => totalDe(a.gastos)));
  const somaEntradas = somar(comEntradas.map((a) => totalDe(a.entradas)));
  const fluxoAnteriores = comFluxo.map((a) => resumoFluxo(totalDe(a.entradas), totalDe(a.gastos)));
  const somaSobras = somar(fluxoAnteriores.map((f) => f.saldoCentavos));
  const somaEntradasFluxo = somar(fluxoAnteriores.map((f) => f.entradasCentavos));

  const categorias = compararCategorias(
    gastos,
    comGastos.flatMap((a) => a.gastos),
    comGastos.length,
  );
  const previstas = receitasDoMes(banco, mes).filter((r) => r.confirmada === false);

  return {
    mes,
    entradasCentavos: fluxo.entradasCentavos,
    saidasCentavos: fluxo.saidasCentavos,
    sobraCentavos: fluxo.saldoCentavos,
    taxaPoupancaPercentual: fluxo.taxaPoupancaPercentual,
    quantidadeLancamentos: gastos.length,
    quantidadeEntradas: entradas.length,
    comparacao: {
      entradas: compararComMedia(fluxo.entradasCentavos, somaEntradas, comEntradas.length),
      saidas: compararComMedia(fluxo.saidasCentavos, somaSaidas, comGastos.length),
      sobra: compararComMedia(fluxo.saldoCentavos, somaSobras, comFluxo.length),
      taxa: compararTaxa(
        fluxo.taxaPoupancaPercentual,
        somaSobras,
        somaEntradasFluxo,
        comFluxo.length,
      ),
    },
    categorias,
    maisSubiram: maisSubiram(categorias),
    maisCairam: maisCairam(categorias),
    maiorGasto: maiorGasto(gastos),
    previstas: { quantidade: previstas.length, totalCentavos: totalDe(previstas) },
  };
}

/** Dados do cartão do painel: o resumo do mês anterior, quando faz sentido mostrá-lo. */
export interface CartaoResumoMes {
  mes: Mes;
  entradasCentavos: Centavos;
  saidasCentavos: Centavos;
  sobraCentavos: Centavos;
  maisSubiu: { nome: string; cor: string | null; diferencaCentavos: Centavos } | null;
}

/** Dias do mês em que o cartão de resumo aparece no painel. */
const DIA_LIMITE_CARTAO = 10;

/**
 * Cartão "Seu resumo de <mês> está pronto": só nos dias 1 a 10 do mês e só se o mês anterior teve
 * algum gasto ou alguma receita confirmada. Senão, null.
 */
export function cartaoResumoDoPainel(banco: Banco, hoje: Dia): CartaoResumoMes | null {
  const dia = Number(hoje.slice(8, 10));
  if (dia < 1 || dia > DIA_LIMITE_CARTAO) return null;
  const mes = somarMeses(mesDe(hoje), -1);
  if (lancamentosDoMes(banco, mes).length === 0 && entradasConfirmadas(banco, mes).length === 0) {
    return null;
  }
  const resumo = resumoDoMes(banco, mes);
  const subiu = resumo.maisSubiram[0];
  return {
    mes,
    entradasCentavos: resumo.entradasCentavos,
    saidasCentavos: resumo.saidasCentavos,
    sobraCentavos: resumo.sobraCentavos,
    maisSubiu: subiu
      ? { nome: subiu.nome, cor: subiu.cor, diferencaCentavos: subiu.diferencaCentavos }
      : null,
  };
}

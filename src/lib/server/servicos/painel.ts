/**
 * Painel do mês: junta o que a tela inicial mostra (patrimônio, total do mês, limite, categorias,
 * comparação com o mês anterior e os lançamentos agrupados por dia).
 */
import { somarMeses, type Dia, type Mes } from '../../dominio/datas.ts';
import { somar, type Centavos } from '../../dominio/dinheiro.ts';
import {
  acumuladoPorDia,
  compararComAnterior,
  diaDeCorte,
  patrimonioLiquido,
  porCategoria,
  situacaoLimite,
  type Comparacao,
  type SituacaoLimite,
} from '../../dominio/resumo.ts';
import type { Banco } from '../db/conexao.ts';
import { listarContas, totalDasContas, type Conta } from './contas.ts';
import { listarCategorias } from './categorias.ts';
import { valorBitcoinCentavos } from './bitcoin.ts';
import { aPagarCartoes } from './cartoes.ts';
import { lancamentosDoMes } from './gastos.ts';
import { agruparPorDia, type DiaDeLancamentos } from '../../dominio/lancamentos.ts';
import { limiteDoMes } from './limite.ts';
import { aReceberDoMes, receitasDoMes } from './receitas.ts';
import { resumoFluxo, type ResumoFluxo } from '../../dominio/receitas.ts';

export { agruparPorDia, type DiaDeLancamentos };

export interface CategoriaNoMes {
  categoriaId: string;
  nome: string;
  cor: string | null;
  totalCentavos: Centavos;
  quantidade: number;
  percentual: number;
}

export interface Painel {
  mes: Mes;
  patrimonio: {
    liquidoCentavos: Centavos;
    contasCentavos: Centavos;
    quantidadeContas: number;
    /** Valor atual da posição em bitcoin (0 se sem preço). */
    bitcoinCentavos: Centavos;
    /** Dívida de cartões (parcelas em faturas não pagas); entra com sinal de menos. */
    aPagarCartoesCentavos: Centavos;
    /** Quando um saldo foi informado pela última vez. */
    saldoAtualizadoEm: string | null;
  };
  contas: Conta[];
  totalMesCentavos: Centavos;
  quantidade: number;
  limite: SituacaoLimite | null;
  comparacao: Comparacao | null;
  /** Dia de corte da comparação (0 = mês futuro). */
  ateDia: number;
  categorias: CategoriaNoMes[];
  dias: DiaDeLancamentos[];
  acumulado: Centavos[];
  acumuladoAnterior: Centavos[];
  /** Entradas (receitas RECEBIDAS do mês), saídas (gastos do mês) e o que sobrou. */
  fluxo: ResumoFluxo & { quantidadeReceitas: number };
  /** Receitas previstas do mês, ainda não confirmadas (não entram no fluxo). */
  aReceber: { quantidade: number; totalCentavos: number };
}

/** Lê tudo numa transação só, para os números baterem entre si (um retrato do banco). */
export function montarPainel(banco: Banco, mes: Mes, hoje: Dia): Painel {
  return banco.sqlite.transaction(() => ler(banco, mes, hoje)).deferred();
}

function ler(banco: Banco, mes: Mes, hoje: Dia): Painel {
  const doMes = lancamentosDoMes(banco, mes);
  const doAnterior = lancamentosDoMes(banco, somarMeses(mes, -1));
  const total = somar(doMes.map((l) => l.valorCentavos));
  const acumulado = acumuladoPorDia(mes, doMes);
  const acumuladoAnterior = acumuladoPorDia(somarMeses(mes, -1), doAnterior);
  const ateDia = diaDeCorte(mes, hoje);

  const nomes = new Map(listarCategorias(banco, { incluirArquivadas: true }).map((c) => [c.id, c]));
  const categorias = porCategoria(doMes).map((f) => ({
    ...f,
    nome: nomes.get(f.categoriaId)?.nome ?? '—',
    cor: nomes.get(f.categoriaId)?.cor ?? null,
  }));

  const listaContas = listarContas(banco);
  const contas = totalDasContas(banco, listaContas);
  const bitcoin = valorBitcoinCentavos(banco);
  const cartoesAPagar = aPagarCartoes(banco);
  const entradas = receitasDoMes(banco, mes).filter((r) => r.confirmada !== false);
  return {
    mes,
    patrimonio: {
      liquidoCentavos: patrimonioLiquido({
        saldosContas: [contas.totalCentavos],
        bitcoinCentavos: bitcoin,
        aPagarCartoesCentavos: cartoesAPagar,
      }),
      contasCentavos: contas.totalCentavos,
      quantidadeContas: contas.quantidade,
      bitcoinCentavos: bitcoin,
      aPagarCartoesCentavos: cartoesAPagar,
      saldoAtualizadoEm: contas.saldoAtualizadoEm,
    },
    contas: listaContas,
    totalMesCentavos: total,
    quantidade: doMes.length,
    limite: situacaoLimite(total, limiteDoMes(banco, mes)),
    comparacao: compararComAnterior(acumulado, acumuladoAnterior, ateDia),
    ateDia,
    categorias,
    dias: agruparPorDia(doMes),
    acumulado,
    acumuladoAnterior,
    fluxo: {
      ...resumoFluxo(somar(entradas.map((r) => r.valorCentavos)), total),
      quantidadeReceitas: entradas.length,
    },
    aReceber: aReceberDoMes(banco, mes),
  };
}

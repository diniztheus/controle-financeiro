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
import { lancamentosDoMes, type Lancamento } from './gastos.ts';
import { limiteDoMes } from './limite.ts';

export interface CategoriaNoMes {
  categoriaId: string;
  nome: string;
  cor: string | null;
  totalCentavos: Centavos;
  quantidade: number;
  percentual: number;
}

export interface DiaDeLancamentos {
  data: Dia;
  totalCentavos: Centavos;
  itens: Lancamento[];
}

export interface Painel {
  mes: Mes;
  patrimonio: {
    liquidoCentavos: Centavos;
    contasCentavos: Centavos;
    quantidadeContas: number;
    atualizadoEm: string | null;
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
}

export function agruparPorDia(lancamentos: readonly Lancamento[]): DiaDeLancamentos[] {
  const dias: DiaDeLancamentos[] = [];
  for (const l of lancamentos) {
    let d = dias.at(-1);
    if (!d || d.data !== l.data) dias.push((d = { data: l.data, totalCentavos: 0, itens: [] }));
    d.itens.push(l);
    d.totalCentavos = somar([d.totalCentavos, l.valorCentavos]);
  }
  return dias;
}

export function montarPainel(banco: Banco, mes: Mes, hoje: Dia): Painel {
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

  const contas = totalDasContas(banco);
  return {
    mes,
    patrimonio: {
      liquidoCentavos: patrimonioLiquido({ saldosContas: [contas.totalCentavos] }),
      contasCentavos: contas.totalCentavos,
      quantidadeContas: contas.quantidade,
      atualizadoEm: contas.atualizadoEm,
    },
    contas: listarContas(banco),
    totalMesCentavos: total,
    quantidade: doMes.length,
    limite: situacaoLimite(total, limiteDoMes(banco, mes)),
    comparacao: compararComAnterior(acumulado, acumuladoAnterior, ateDia),
    ateDia,
    categorias,
    dias: agruparPorDia(doMes),
    acumulado,
    acumuladoAnterior,
  };
}

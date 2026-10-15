/**
 * Lançamentos do mês como a tela os mostra: uma linha por parcela de competência, agrupadas por
 * dia. Só formas e agrupamento; quem consulta o banco é o serviço de gastos.
 * Este módulo não conhece banco nem tela.
 */
import type { Dia } from './datas.ts';
import { somar, type Centavos } from './dinheiro.ts';

/** Uma linha do mês: uma parcela (gasto à vista = parcela 1 de 1). */
export interface Lancamento {
  compraId: string;
  /** Dia em que conta no mês (o dia da compra, limitado ao fim do mês). */
  data: Dia;
  dataCompra: Dia;
  valorCentavos: Centavos;
  valorTotalCentavos: Centavos;
  parcela: number;
  numParcelas: number;
  descricao: string | null;
  categoriaId: string;
  categoriaNome: string;
  categoriaCor: string | null;
  meio: 'conta' | 'cartao';
  contaNome: string | null;
  contaRemovida: boolean;
  cartaoNome: string | null;
  criadoEm: string;
}

export interface DiaDeLancamentos {
  data: Dia;
  totalCentavos: Centavos;
  itens: Lancamento[];
}

/** Agrupa lançamentos já ordenados por dia (do mais recente ao mais antigo). */
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

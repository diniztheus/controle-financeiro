/**
 * Parcelas de uma compra por mês de competência.
 *
 * Regra do app atual: a parcela i (0, 1, 2…) conta no mês da compra + i, e a 1ª parcela leva o
 * resto dos centavos. Gasto à vista é uma compra de 1 parcela no próprio mês.
 * Este módulo não conhece banco nem tela.
 */
import { mesDe, somarMeses, type Dia, type Mes } from './datas.ts';
import { dividirEmParcelas, type Centavos } from './dinheiro.ts';

export interface ParcelaCalculada {
  /** 1..n */
  numero: number;
  valorCentavos: Centavos;
  mesCompetencia: Mes;
}

export function gerarParcelas(
  dataCompra: Dia,
  totalCentavos: Centavos,
  n: number,
): ParcelaCalculada[] {
  if (totalCentavos <= 0) throw new RangeError('O total da compra precisa ser maior que zero');
  const mes0 = mesDe(dataCompra);
  return dividirEmParcelas(totalCentavos, n).map((valorCentavos, i) => ({
    numero: i + 1,
    valorCentavos,
    mesCompetencia: somarMeses(mes0, i),
  }));
}

/**
 * Cartões de crédito: situação de fatura, limite, itens e prévia de parcelas, e a dívida em
 * uma data. Como nos demais módulos de domínio, não conhece banco nem tela: quem chama passa
 * as parcelas e as faturas já lidas.
 *
 * Regra da dívida do patrimônio: soma das parcelas (inclusive futuras) cuja fatura ainda não
 * foi paga. Fatura paga é a que tem `pagaEm`; a partir desse dia ela deixa de ser dívida.
 */
import { comparar, type Dia, type Mes } from './datas.ts';
import { gerarParcelas } from './parcelas.ts';
import { dataVencimento, mesDaFatura, type CicloCartao } from './fatura.ts';
import { somar, type Centavos } from './dinheiro.ts';

export type SituacaoFatura = 'aberta' | 'fechada' | 'vencida' | 'paga';

/**
 * Situação da fatura no dia `hoje`, nesta ordem:
 * paga (tem `pagaEm`, qualquer que seja a data) > vencida (hoje depois do vencimento) >
 * fechada (hoje no fechamento ou depois) > aberta.
 */
export function situacaoFatura(
  f: { dataFechamento: Dia; dataVencimento: Dia; pagaEm: Dia | null },
  hoje: Dia,
): SituacaoFatura {
  if (f.pagaEm !== null) return 'paga';
  if (comparar(hoje, f.dataVencimento) > 0) return 'vencida';
  if (comparar(hoje, f.dataFechamento) >= 0) return 'fechada';
  return 'aberta';
}

/**
 * Limite menos o que está a pagar. Pode ser negativo (estourou o limite).
 * `null` quando não há limite definido (limite 0 ou menor, como no app atual).
 */
export function limiteDisponivel(limiteCentavos: number, aPagarCentavos: number): number | null {
  if (limiteCentavos <= 0) return null;
  return limiteCentavos - aPagarCentavos;
}

/** Uma linha da fatura: uma parcela de uma compra. */
export interface ItemFatura {
  compraId: string;
  /** Data da compra. */
  data: Dia;
  descricao: string | null;
  categoriaNome: string;
  categoriaCor: string | null;
  valorCentavos: Centavos;
  /** 1..numParcelas */
  parcela: number;
  numParcelas: number;
}

export function totalDaFatura(itens: readonly ItemFatura[]): number {
  return somar(itens.map((i) => i.valorCentavos));
}

/** "3/10"; compra à vista (1 parcela) → "À vista". */
export function rotuloParcela(parcela: number, numParcelas: number): string {
  if (numParcelas === 1) return 'À vista';
  return `${parcela}/${numParcelas}`;
}

/** Prévia das parcelas de uma compra no cartão, com a fatura e o vencimento de cada uma. */
export function previaParcelas(
  dataCompra: Dia,
  ciclo: CicloCartao,
  totalCentavos: Centavos,
  n: number,
): {
  numero: number;
  valorCentavos: Centavos;
  mesCompetencia: Mes;
  mesFatura: Mes;
  vencimento: Dia;
}[] {
  return gerarParcelas(dataCompra, totalCentavos, n).map((p, i) => {
    const mesFatura = mesDaFatura(ciclo, dataCompra, i);
    return {
      numero: p.numero,
      valorCentavos: p.valorCentavos,
      mesCompetencia: p.mesCompetencia,
      mesFatura,
      vencimento: dataVencimento(ciclo, mesFatura),
    };
  });
}

/**
 * Dívida de cartão numa data: parcelas de compras feitas até `data` (inclusive) cuja fatura
 * não estava paga até `data` (sem `pagaEm`, ou paga depois de `data`). Inclui parcelas futuras.
 * Usado na evolução do patrimônio.
 */
export function dividaCartaoEmData(
  parcelas: readonly {
    dataCompra: Dia;
    valorCentavos: Centavos;
    mesFatura: Mes;
    pagaEm: Dia | null;
  }[],
  data: Dia,
): number {
  return somar(
    parcelas
      .filter((p) => comparar(p.dataCompra, data) <= 0)
      .filter((p) => p.pagaEm === null || comparar(p.pagaEm, data) > 0)
      .map((p) => p.valorCentavos),
  );
}

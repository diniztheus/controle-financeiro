/**
 * Ciclo de fatura do cartão, com as mesmas regras do app atual:
 *
 * - a fatura é identificada pelo mês do vencimento (AAAA-MM);
 * - compra no dia do fechamento ou depois cai na fatura seguinte (num mês curto, fechamento 31
 *   vale como o último dia do mês);
 * - se o dia do vencimento é menor ou igual ao do fechamento, o vencimento é no mês seguinte ao
 *   fechamento;
 * - a parcela i (0, 1, 2…) cai na fatura da 1ª parcela + i.
 *
 * Nesta onda é usado pelo importador para ligar as compras de cartão do app atual às faturas.
 * As telas de cartão chegam na próxima onda. Este módulo não conhece banco nem tela.
 */
import { diaNoMes, mesDe, somarMeses, type Dia, type Mes } from './datas.ts';

export interface CicloCartao {
  /** 1..31 */
  diaFechamento: number;
  /** 1..31 */
  diaVencimento: number;
}

function exigirDiaCartao(n: number, rotulo: string): void {
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    throw new RangeError(`Dia de ${rotulo} deve ser de 1 a 31: ${n}`);
  }
}

function exigirCiclo(c: CicloCartao): void {
  exigirDiaCartao(c.diaFechamento, 'fechamento');
  exigirDiaCartao(c.diaVencimento, 'vencimento');
}

/** O vencimento cai no mês seguinte ao fechamento? */
export function venceNoMesSeguinte(c: CicloCartao): boolean {
  return c.diaVencimento <= c.diaFechamento;
}

/** Mês de vencimento da fatura que recebe a parcela `i` (0 = 1ª) de uma compra feita em `data`. */
export function mesDaFatura(c: CicloCartao, data: Dia, i = 0): Mes {
  exigirCiclo(c);
  if (!Number.isInteger(i) || i < 0) throw new RangeError(`Índice de parcela inválido: ${i}`);
  let mes = mesDe(data);
  // diaNoMes limita o fechamento ao último dia do mês (31 em fevereiro = 28 ou 29).
  if (data >= diaNoMes(mes, c.diaFechamento)) mes = somarMeses(mes, 1);
  if (venceNoMesSeguinte(c)) mes = somarMeses(mes, 1);
  return somarMeses(mes, i);
}

/** Data de vencimento da fatura do mês `mes`. */
export function dataVencimento(c: CicloCartao, mes: Mes): Dia {
  exigirCiclo(c);
  return diaNoMes(mes, c.diaVencimento);
}

/** Data de fechamento da fatura que vence em `mes`. */
export function dataFechamento(c: CicloCartao, mes: Mes): Dia {
  exigirCiclo(c);
  return diaNoMes(venceNoMesSeguinte(c) ? somarMeses(mes, -1) : mes, c.diaFechamento);
}

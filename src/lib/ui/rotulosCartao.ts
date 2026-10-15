/** Textos das telas de cartão (situação da fatura, selo e cor). */
import type { SituacaoFatura } from '$lib/dominio/cartoes';

export const ROTULO_SITUACAO: Record<SituacaoFatura, string> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  vencida: 'Vencida',
  paga: 'Paga',
};

/** Classe do selo: "vencida" em vermelho, "paga" em verde, o resto no tom neutro. */
export const CLASSE_SITUACAO: Record<SituacaoFatura, string> = {
  aberta: 'situacao-aberta',
  fechada: 'situacao-fechada',
  vencida: 'situacao-vencida',
  paga: 'situacao-paga',
};

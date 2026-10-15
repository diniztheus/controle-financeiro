/** Tipos de conta (os mesmos do app atual) e como aparecem na tela. */

export const TIPOS_CONTA = ['corrente', 'poupanca', 'investimento', 'dinheiro', 'outro'] as const;
export type TipoConta = (typeof TIPOS_CONTA)[number];

export const ROTULO_TIPO: Record<TipoConta, string> = {
  corrente: 'Conta corrente',
  poupanca: 'Poupança',
  investimento: 'Investimento',
  dinheiro: 'Dinheiro',
  outro: 'Outro',
};

export function ehTipoConta(valor: unknown): valor is TipoConta {
  return typeof valor === 'string' && (TIPOS_CONTA as readonly string[]).includes(valor);
}

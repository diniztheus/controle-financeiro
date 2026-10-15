/**
 * Nomes digitados (contas, categorias): uma regra só para gravar e para comparar.
 *
 * - gravar: sem espaços nas pontas, espaços internos únicos, Unicode em NFC (um "ú" colado de
 *   outro lugar pode vir decomposto em "u" + acento e pareceria outro nome);
 * - comparar: o mesmo, em minúsculas. Acento conta: "Saude" e "Saúde" são nomes diferentes.
 */
export function normalizarNome(nome: string): string {
  return nome.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function chaveNome(nome: string): string {
  return normalizarNome(nome).toLocaleLowerCase('pt-BR');
}

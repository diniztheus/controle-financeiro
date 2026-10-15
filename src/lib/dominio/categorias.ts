/**
 * Categorias: lista inicial e cores.
 *
 * As cores são as 11 da paleta da v3 (`--c0` … `--c10`), guardadas pelo nome do token ("c3"),
 * para que cada categoria troque de tom sozinha no modo escuro.
 * Este módulo não conhece banco nem tela.
 */

/** As mesmas do app atual, na mesma ordem. */
export const CATEGORIAS_PADRAO = [
  'Alimentação',
  'Mercado',
  'Transporte',
  'Moradia',
  'Contas da casa',
  'Saúde',
  'Lazer',
  'Educação',
  'Compras',
  'Assinaturas',
  'Outros',
] as const;

export const CORES = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'] as const;
export type Cor = (typeof CORES)[number];

export function ehCor(valor: unknown): valor is Cor {
  return typeof valor === 'string' && (CORES as readonly string[]).includes(valor);
}

/** Cor pela posição, como a v3 fazia (posição 11 volta para c0). */
export function corPorPosicao(i: number): Cor {
  const n = CORES.length;
  return CORES[((Math.trunc(i) % n) + n) % n]!;
}

/** Cor ainda não usada, na ordem da paleta; se todas estiverem em uso, a menos usada. */
export function proximaCor(usadas: readonly string[]): Cor {
  const contagem = new Map<Cor, number>(CORES.map((c) => [c, 0]));
  for (const u of usadas) if (ehCor(u)) contagem.set(u, (contagem.get(u) ?? 0) + 1);
  let melhor: Cor = CORES[0];
  for (const c of CORES) if (contagem.get(c)! < contagem.get(melhor)!) melhor = c;
  return melhor;
}

/** Nome comparável (ver nomes.ts): NFC, espaços normalizados, minúsculo. */
export { chaveNome as chaveCategoria } from './nomes.ts';

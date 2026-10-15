/**
 * Resumo de um mês de gastos: total, limite, por categoria e comparação com o mês anterior.
 *
 * Recebe os lançamentos já recortados no mês (uma linha por parcela de competência) e devolve
 * números prontos para a tela. Tudo em centavos inteiros. Este módulo não conhece banco nem tela.
 */
import { diasNoMes, mesDe, type Dia, type Mes } from './datas.ts';
import { somar, type Centavos } from './dinheiro.ts';

export interface LancamentoDoMes {
  /** Dia em que a parcela conta no mês. */
  data: Dia;
  valorCentavos: Centavos;
  categoriaId: string;
}

/** ok: abaixo de 85% do limite; alerta: de 85% a 100%; estourado: acima. Como na v3. */
export type EstadoLimite = 'ok' | 'alerta' | 'estourado';

export interface SituacaoLimite {
  limiteCentavos: Centavos;
  gastoCentavos: Centavos;
  /** Pode ser negativo (acima do limite). */
  restanteCentavos: Centavos;
  /** Percentual usado, inteiro arredondado (pode passar de 100). */
  percentual: number;
  estado: EstadoLimite;
}

export const LIMIAR_ALERTA = 0.85;

/** `null` quando não há limite definido (0 = sem limite, como no app atual). */
export function situacaoLimite(
  gastoCentavos: Centavos,
  limiteCentavos: Centavos | null,
): SituacaoLimite | null {
  if (!limiteCentavos || limiteCentavos <= 0) return null;
  const frac = gastoCentavos / limiteCentavos;
  return {
    limiteCentavos,
    gastoCentavos,
    restanteCentavos: limiteCentavos - gastoCentavos,
    percentual: Math.round(frac * 100),
    estado: frac > 1 ? 'estourado' : frac >= LIMIAR_ALERTA ? 'alerta' : 'ok',
  };
}

export interface FatiaCategoria {
  categoriaId: string;
  totalCentavos: Centavos;
  quantidade: number;
  /** Percentual do total do mês, inteiro arredondado. */
  percentual: number;
}

/** Total por categoria, do maior para o menor (empate: mais lançamentos primeiro). */
export function porCategoria(lancamentos: readonly LancamentoDoMes[]): FatiaCategoria[] {
  const mapa = new Map<string, { total: number; qtd: number }>();
  for (const l of lancamentos) {
    const atual = mapa.get(l.categoriaId) ?? { total: 0, qtd: 0 };
    atual.total = somar([atual.total, l.valorCentavos]);
    atual.qtd += 1;
    mapa.set(l.categoriaId, atual);
  }
  const total = somar(lancamentos.map((l) => l.valorCentavos));
  return [...mapa.entries()]
    .map(([categoriaId, v]) => ({
      categoriaId,
      totalCentavos: v.total,
      quantidade: v.qtd,
      percentual: total > 0 ? Math.round((v.total / total) * 100) : 0,
    }))
    .sort((a, b) => b.totalCentavos - a.totalCentavos || b.quantidade - a.quantidade);
}

/**
 * Gasto acumulado até cada dia: índice 0 = antes do dia 1, índice d = até o fim do dia d.
 * Lançamentos de outros meses são ignorados.
 */
export function acumuladoPorDia(mes: Mes, lancamentos: readonly LancamentoDoMes[]): Centavos[] {
  const n = diasNoMes(mes);
  const porDia = new Array<number>(n + 1).fill(0);
  for (const l of lancamentos) {
    if (mesDe(l.data) !== mes) continue;
    const d = Number(l.data.slice(8, 10));
    porDia[d] = somar([porDia[d]!, l.valorCentavos]);
  }
  for (let d = 1; d <= n; d++) porDia[d] = somar([porDia[d]!, porDia[d - 1]!]);
  return porDia;
}

export interface Comparacao {
  /** Até que dia do mês a comparação vale. */
  ateDia: number;
  atualCentavos: Centavos;
  anteriorCentavos: Centavos;
  /** atual − anterior: positivo = gastou mais. */
  diferencaCentavos: Centavos;
  /** Diferença em percentual inteiro. */
  percentual: number;
}

/**
 * Compara o mês com o anterior até o mesmo dia (como a v3). `ateDia` é o último dia já vivido do
 * mês: hoje, para o mês corrente; o último dia, para meses passados; 0 para meses futuros (sem
 * comparação). No mês anterior, o dia é limitado ao tamanho dele (31 → 30).
 */
export function compararComAnterior(
  acumAtual: readonly Centavos[],
  acumAnterior: readonly Centavos[],
  ateDia: number,
): Comparacao | null {
  if (ateDia <= 0) return null;
  const dAtual = Math.min(ateDia, acumAtual.length - 1);
  const dAnterior = Math.min(ateDia, acumAnterior.length - 1);
  const atual = acumAtual[dAtual] ?? 0;
  const anterior = acumAnterior[dAnterior] ?? 0;
  const totalAnterior = acumAnterior[acumAnterior.length - 1] ?? 0;
  if (totalAnterior === 0) return null;
  return {
    ateDia: dAtual,
    atualCentavos: atual,
    anteriorCentavos: anterior,
    diferencaCentavos: atual - anterior,
    // Como na v3: sem gasto no anterior até aquele dia, compara com o total do mês anterior.
    percentual: Math.round(((atual - anterior) / (anterior || totalAnterior)) * 100),
  };
}

/** Último dia "vivido" de `mes` em relação a `hoje` (ver {@link compararComAnterior}). */
export function diaDeCorte(mes: Mes, hoje: Dia): number {
  const mesHoje = mesDe(hoje);
  if (mes === mesHoje) return Number(hoje.slice(8, 10));
  return mes < mesHoje ? diasNoMes(mes) : 0;
}

/** Patrimônio líquido. Nesta onda só entram as contas; cartões e bitcoin chegam depois. */
export function patrimonioLiquido(partes: {
  saldosContas: readonly Centavos[];
  bitcoinCentavos?: Centavos;
  aPagarCartoesCentavos?: Centavos;
}): Centavos {
  return somar([
    somar(partes.saldosContas),
    partes.bitcoinCentavos ?? 0,
    -(partes.aPagarCartoesCentavos ?? 0),
  ]);
}

/**
 * Metas (caixinhas): quanto já foi guardado para um alvo, e quanto falta por mês até o prazo.
 *
 * Regras:
 * - o guardado é a soma dos movimentos da meta (guardar = positivo, retirar = negativo), feita
 *   no serviço; aqui só recebemos o total;
 * - percentual vai de 0 e pode passar de 100 (guardou mais que o alvo);
 * - falta nunca é negativa;
 * - meses até o prazo contam o mês atual: prazo no mesmo mês que hoje = 1 mês;
 * - sem prazo, ou com prazo que já passou, não há valor mensal (null);
 * - meta concluída quando guardado ≥ alvo.
 *
 * Meta é separada do patrimônio: nada daqui mexe em conta nem em patrimônio.
 * Este módulo é puro (sem banco e sem tela).
 */
import { comparar, diferencaMeses, ehDia, mesDe, type Dia } from './datas.ts';
import { ehCentavos, type Centavos } from './dinheiro.ts';

export interface DadosCalculoMeta {
  alvoCentavos: Centavos;
  /** "AAAA-MM-DD" ou `null` para meta sem prazo. */
  prazo: Dia | null;
}

export interface CalculoMeta {
  guardadoCentavos: Centavos;
  /** 0..∞ (inteiro, arredondado para baixo); pode passar de 100. */
  percentual: number;
  /** Quanto ainda falta para o alvo; nunca negativo. */
  faltaCentavos: Centavos;
  concluida: boolean;
  /** Meses de hoje até o prazo, contando o mês atual; `null` sem prazo ou com prazo passado. */
  mesesAtePrazo: number | null;
  /** Prazo anterior a hoje. */
  prazoPassado: boolean;
  /**
   * Quanto guardar por mês para chegar ao alvo no prazo (falta ÷ meses, para cima em centavos).
   * `null` sem prazo ou com prazo passado.
   */
  porMesCentavos: Centavos | null;
}

/** Percentual do alvo já guardado: inteiro, 0 ou mais, sem arredondar para cima. */
export function percentualMeta(guardadoCentavos: Centavos, alvoCentavos: Centavos): number {
  if (alvoCentavos <= 0 || guardadoCentavos <= 0) return 0;
  // BigInt: guardado × 100 pode passar do inteiro seguro com valores grandes.
  const p = (BigInt(guardadoCentavos) * 100n) / BigInt(alvoCentavos);
  return Number(p);
}

/** Quanto falta para o alvo; nunca negativo. */
export function faltaMeta(guardadoCentavos: Centavos, alvoCentavos: Centavos): Centavos {
  return Math.max(0, alvoCentavos - guardadoCentavos);
}

/** Meta concluída: guardado chegou (ou passou) do alvo. */
export function metaConcluida(guardadoCentavos: Centavos, alvoCentavos: Centavos): boolean {
  return guardadoCentavos >= alvoCentavos;
}

/**
 * Meses de `hoje` até `prazo`, contando o mês atual. `null` se não há prazo ou se o prazo
 * (o dia) já passou.
 */
export function mesesAtePrazo(prazo: Dia | null, hoje: Dia): number | null {
  if (prazo === null) return null;
  if (!ehDia(prazo) || !ehDia(hoje)) throw new RangeError('Datas devem ser AAAA-MM-DD');
  if (comparar(prazo, hoje) < 0) return null;
  return diferencaMeses(mesDe(hoje), mesDe(prazo)) + 1;
}

/** Falta ÷ meses, arredondado para cima em centavos. */
export function porMes(falta: Centavos, meses: number): Centavos {
  if (!Number.isInteger(meses) || meses < 1) throw new RangeError(`Meses inválidos: ${meses}`);
  if (!ehCentavos(falta) || falta < 0) throw new RangeError(`Falta inválida: ${falta}`);
  return Math.floor((falta + meses - 1) / meses);
}

/** Tudo o que a tela mostra sobre uma meta, a partir do alvo, do prazo e do guardado. */
export function calcularMeta(
  meta: DadosCalculoMeta,
  guardadoCentavos: Centavos,
  hoje: Dia,
): CalculoMeta {
  if (!ehCentavos(guardadoCentavos)) throw new RangeError('Guardado precisa ser centavos inteiros');
  const guardado = Math.max(0, guardadoCentavos);
  const falta = faltaMeta(guardado, meta.alvoCentavos);
  const meses = mesesAtePrazo(meta.prazo, hoje);
  return {
    guardadoCentavos: guardado,
    percentual: percentualMeta(guardado, meta.alvoCentavos),
    faltaCentavos: falta,
    concluida: metaConcluida(guardado, meta.alvoCentavos),
    mesesAtePrazo: meses,
    prazoPassado: meta.prazo !== null && meses === null,
    porMesCentavos: meses === null ? null : porMes(falta, meses),
  };
}

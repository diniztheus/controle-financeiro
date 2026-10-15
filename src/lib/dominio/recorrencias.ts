/**
 * Receitas recorrentes: regra de datas do modelo mensal (ex.: "todo dia 5 a partir de março").
 *
 * O modelo NÃO é lançamento: estas funções só calculam as datas em que o site deve gerar uma
 * receita. Dia do mês 31 cai no último dia dos meses curtos (ver `diaNoMes`). Datas são
 * "AAAA-MM-DD" e toda a aritmética usa `datas.ts` (sem `Date` local, sem fuso).
 * Este módulo não conhece banco nem tela.
 */
import {
  comparar,
  diaNoMes,
  diferencaMeses,
  ehDia,
  mesDe,
  nomeMesCurto,
  somarMeses,
  type Dia,
} from './datas.ts';

/** Trava de segurança: no máximo 600 ocorrências (50 anos) por cálculo. */
export const MAX_OCORRENCIAS = 600;

export interface ModeloRecorrencia {
  /** Dia do mês pretendido (1 a 31); limitado ao último dia nos meses curtos. */
  diaDoMes: number;
  /** Primeiro dia em que a recorrência vale (nunca gera antes dele). */
  inicio: Dia;
  /** Último dia em que vale; null = sem fim. */
  fim: Dia | null;
}

function exigirFormato(m: ModeloRecorrencia): void {
  if (!Number.isInteger(m.diaDoMes) || m.diaDoMes < 1 || m.diaDoMes > 31) {
    throw new RangeError(`Dia do mês deve ser de 1 a 31: ${m.diaDoMes}`);
  }
  if (!ehDia(m.inicio)) throw new RangeError(`Início inválido (use AAAA-MM-DD): "${m.inicio}"`);
  const fim = m.fim ?? null;
  if (fim !== null && !ehDia(fim)) throw new RangeError(`Fim inválido (use AAAA-MM-DD): "${fim}"`);
}

/**
 * Todas as datas mensais de `inicio` até min(fim, ate), em ordem. Descarta datas anteriores ao
 * início: com início 2026-03-20 e dia 5, a primeira é 2026-04-05.
 * Lança RangeError se passar de MAX_OCORRENCIAS.
 */
export function datasDaRecorrencia(m: ModeloRecorrencia, ate: Dia): Dia[] {
  exigirFormato(m);
  if (!ehDia(ate)) throw new RangeError(`Data limite inválida (use AAAA-MM-DD): "${ate}"`);
  const fim = m.fim ?? null;
  const limite = fim !== null && comparar(fim, ate) < 0 ? fim : ate;
  const meses = diferencaMeses(mesDe(m.inicio), mesDe(limite));
  const datas: Dia[] = [];
  for (let k = 0; k <= meses; k++) {
    const d = diaNoMes(somarMeses(mesDe(m.inicio), k), m.diaDoMes);
    if (comparar(d, m.inicio) < 0) continue;
    if (comparar(d, limite) > 0) break;
    if (datas.length === MAX_OCORRENCIAS) {
      throw new RangeError(`Mais de ${MAX_OCORRENCIAS} ocorrências (trava de segurança)`);
    }
    datas.push(d);
  }
  return datas;
}

/**
 * Primeira data estritamente depois de `hoje` (e não antes do início), respeitando o fim.
 * Null se a recorrência já acabou.
 */
export function proximaOcorrencia(m: ModeloRecorrencia, hoje: Dia): Dia | null {
  exigirFormato(m);
  if (!ehDia(hoje)) throw new RangeError(`Data de hoje inválida (use AAAA-MM-DD): "${hoje}"`);
  const fim = m.fim ?? null;
  const base = comparar(m.inicio, hoje) > 0 ? m.inicio : hoje;
  const mesBase = mesDe(base);
  // Cada mês gera uma data; em no máximo dois meses após `base` a busca termina.
  for (let k = 0; ; k++) {
    const d = diaNoMes(somarMeses(mesBase, k), m.diaDoMes);
    if (fim !== null && comparar(d, fim) > 0) return null;
    if (comparar(d, m.inicio) >= 0 && comparar(d, hoje) > 0) return d;
  }
}

/** Texto para a tela: "Todo dia 5, de mar/2026 sem data final". */
export function descreverRecorrencia(m: ModeloRecorrencia): string {
  exigirFormato(m);
  const fim = m.fim ?? null;
  const dia =
    m.diaDoMes >= 29
      ? `Todo dia ${m.diaDoMes} (último dia nos meses curtos)`
      : `Todo dia ${m.diaDoMes}`;
  const inicioTexto = `${nomeMesCurto(mesDe(m.inicio))}/${m.inicio.slice(0, 4)}`;
  const periodo =
    fim === null
      ? `de ${inicioTexto} sem data final`
      : `de ${inicioTexto} a ${nomeMesCurto(mesDe(fim))}/${fim.slice(0, 4)}`;
  return `${dia}, ${periodo}`;
}

/** Mensagem de erro em português para o modelo, ou null se ele está válido. */
export function validarModelo(m: ModeloRecorrencia): string | null {
  if (!Number.isInteger(m.diaDoMes) || m.diaDoMes < 1 || m.diaDoMes > 31) {
    return 'O dia do mês deve ser de 1 a 31.';
  }
  if (!ehDia(m.inicio)) return 'Data de início inválida.';
  const fim = m.fim ?? null;
  if (fim !== null && !ehDia(fim)) return 'Data final inválida.';
  if (fim !== null && comparar(fim, m.inicio) < 0) {
    return 'A data final não pode ser antes da data de início.';
  }
  return null;
}

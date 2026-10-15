/**
 * Datas e meses como texto ISO.
 *
 * - Dia: "AAAA-MM-DD" (ex.: "2026-10-15")
 * - Mês: "AAAA-MM" (ex.: "2026-10"), usado para competência e para identificar faturas.
 *
 * Toda a aritmética é feita com inteiros (ano, mês, dia), sem `Date` e sem fuso horário,
 * para que "somar 1 mês" nunca dependa do relógio ou do horário de verão.
 * Este módulo não conhece banco nem tela.
 */

/** "AAAA-MM" */
export type Mes = string;
/** "AAAA-MM-DD" */
export type Dia = string;

const RE_MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const RE_DIA = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const NOMES_MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad4 = (n: number) => String(n).padStart(4, '0');

export function ehBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

export function ehMes(valor: unknown): valor is Mes {
  return typeof valor === 'string' && RE_MES.test(valor);
}

export function ehDia(valor: unknown): valor is Dia {
  if (typeof valor !== 'string') return false;
  const m = RE_DIA.exec(valor);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return dia <= diasNoMesNum(ano, mes);
}

function exigirMes(mes: string): [number, number] {
  const m = RE_MES.exec(mes);
  if (!m) throw new RangeError(`Mês inválido (use AAAA-MM): "${mes}"`);
  return [Number(m[1]), Number(m[2])];
}

function exigirDia(dia: string): [number, number, number] {
  if (!ehDia(dia)) throw new RangeError(`Data inválida (use AAAA-MM-DD): "${dia}"`);
  return [Number(dia.slice(0, 4)), Number(dia.slice(5, 7)), Number(dia.slice(8, 10))];
}

function diasNoMesNum(ano: number, mes: number): number {
  if (mes === 2) return ehBissexto(ano) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

/** Monta "AAAA-MM" a partir de ano e mês (1..12). */
export function criarMes(ano: number, mes: number): Mes {
  if (!Number.isInteger(ano) || ano < 1 || ano > 9999) throw new RangeError(`Ano inválido: ${ano}`);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new RangeError(`Mês inválido: ${mes}`);
  return `${pad4(ano)}-${pad2(mes)}`;
}

/** Monta "AAAA-MM-DD"; erro se o dia não existir naquele mês. */
export function criarDia(ano: number, mes: number, dia: number): Dia {
  const m = criarMes(ano, mes);
  if (!Number.isInteger(dia) || dia < 1 || dia > diasNoMesNum(ano, mes)) {
    throw new RangeError(`Dia inválido para ${m}: ${dia}`);
  }
  return `${m}-${pad2(dia)}`;
}

/** Quantos dias tem o mês (28 a 31). */
export function diasNoMes(mes: Mes): number {
  const [a, m] = exigirMes(mes);
  return diasNoMesNum(a, m);
}

/** Primeiro dia do mês: "2026-02" → "2026-02-01". */
export function primeiroDiaDoMes(mes: Mes): Dia {
  exigirMes(mes);
  return `${mes}-01`;
}

/** Último dia do mês: "2028-02" → "2028-02-29". */
export function ultimoDiaDoMes(mes: Mes): Dia {
  return `${mes}-${pad2(diasNoMes(mes))}`;
}

/** O mês de uma data: "2026-10-15" → "2026-10". */
export function mesDe(dia: Dia): Mes {
  exigirDia(dia);
  return dia.slice(0, 7);
}

/** Soma (ou subtrai) meses: somarMeses("2026-11", 3) → "2027-02". */
export function somarMeses(mes: Mes, n: number): Mes {
  if (!Number.isInteger(n)) throw new RangeError(`Quantidade de meses deve ser inteira: ${n}`);
  const [a, m] = exigirMes(mes);
  const total = a * 12 + (m - 1) + n;
  const ano = Math.floor(total / 12);
  return criarMes(ano, total - ano * 12 + 1);
}

/**
 * Dia `dia` dentro do mês, limitado ao último dia: diaNoMes("2026-02", 31) → "2026-02-28".
 * É a base para "dia de fechamento 31" em meses curtos.
 */
export function diaNoMes(mes: Mes, dia: number): Dia {
  const [a, m] = exigirMes(mes);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31)
    throw new RangeError(`Dia deve ser de 1 a 31: ${dia}`);
  return `${mes}-${pad2(Math.min(dia, diasNoMesNum(a, m)))}`;
}

/**
 * Soma meses a uma data mantendo o dia, limitado ao fim do mês:
 * somarMesesData("2026-01-31", 1) → "2026-02-28".
 */
export function somarMesesData(dia: Dia, n: number): Dia {
  const [, , d] = exigirDia(dia);
  return diaNoMes(somarMeses(mesDe(dia), n), d);
}

/** Soma (ou subtrai) dias, sem fuso horário. */
export function somarDias(dia: Dia, n: number): Dia {
  if (!Number.isInteger(n)) throw new RangeError(`Quantidade de dias deve ser inteira: ${n}`);
  const [a, m, d] = exigirDia(dia);
  // Date.UTC só com inteiros: sem fuso e sem horário de verão.
  const t = Date.UTC(a, m - 1, d) + n * 86_400_000;
  const r = new Date(t);
  return criarDia(r.getUTCFullYear(), r.getUTCMonth() + 1, r.getUTCDate());
}

/** Quantos meses de `de` até `ate` (pode ser negativo): ("2026-11", "2027-02") → 3. */
export function diferencaMeses(de: Mes, ate: Mes): number {
  const [a1, m1] = exigirMes(de);
  const [a2, m2] = exigirMes(ate);
  return (a2 - a1) * 12 + (m2 - m1);
}

/** Lista de meses de `de` até `ate`, inclusive. Vazia se `ate` vier antes de `de`. */
export function mesesEntre(de: Mes, ate: Mes): Mes[] {
  const n = diferencaMeses(de, ate);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => somarMeses(de, i));
}

/** Compara textos ISO (funciona para dias e meses): -1, 0 ou 1. */
export function comparar(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Data de hoje no horário local do computador. */
export function hoje(agora: Date = new Date()): Dia {
  return criarDia(agora.getFullYear(), agora.getMonth() + 1, agora.getDate());
}

/** Mês atual no horário local do computador. */
export function mesAtual(agora: Date = new Date()): Mes {
  return hoje(agora).slice(0, 7);
}

/** "2026-10" → "outubro de 2026" (minúsculo; use {@link capitalizar} para títulos). */
export function nomeMes(mes: Mes): string {
  const [a, m] = exigirMes(mes);
  return `${NOMES_MESES[m - 1]} de ${a}`;
}

/** "2026-10" → "out" */
export function nomeMesCurto(mes: Mes): string {
  const [, m] = exigirMes(mes);
  return (NOMES_MESES[m - 1] ?? '').slice(0, 3);
}

/** "2026-10-05" → "05/10/2026" */
export function formatarDia(dia: Dia): string {
  const [a, m, d] = exigirDia(dia);
  return `${pad2(d)}/${pad2(m)}/${pad4(a)}`;
}

export function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

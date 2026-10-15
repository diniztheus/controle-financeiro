/** Formatação para a tela (datas por extenso, cores de categoria, meses na URL). */
import {
  capitalizar,
  ehMes,
  mesAtual,
  nomeMes,
  somarMeses,
  type Dia,
  type Mes,
} from '$lib/dominio/datas';
import type { Cor } from '$lib/dominio/categorias';

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** "2026-10" → "outubro" (o nome vem do domínio, sem repetir a lista aqui). */
const nomeDoMes = (mes: Mes) => nomeMes(mes).split(' de ')[0]!;

/** "2026-10-15" → "quinta, 15 de outubro" (sem fuso: Date.UTC só com inteiros). */
export function diaPorExtenso(dia: Dia): string {
  const [a, m, d] = [Number(dia.slice(0, 4)), Number(dia.slice(5, 7)), Number(dia.slice(8, 10))];
  const semana = DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${semana}, ${d} de ${nomeDoMes(dia.slice(0, 7))}`;
}

/** "2026-10-15" → "15 out" */
export function diaCurto(dia: Dia): string {
  return `${Number(dia.slice(8, 10))} ${nomeDoMes(dia.slice(0, 7)).slice(0, 3)}`;
}

/** "2026-10" → "Outubro de 2026" */
export function tituloMes(mes: Mes): string {
  return capitalizar(nomeMes(mes));
}

/** "2026-10" → "outubro" */
export function soNomeMes(mes: Mes): string {
  return nomeDoMes(mes);
}

/** Mês vindo da URL (?mes=AAAA-MM); qualquer coisa estranha vira o mês atual. */
export function mesDaUrl(url: URL, agora = new Date()): Mes {
  const m = url.searchParams.get('mes');
  return ehMes(m) ? m : mesAtual(agora);
}

export function mesesVizinhos(mes: Mes): { anterior: Mes; proximo: Mes } {
  return { anterior: somarMeses(mes, -1), proximo: somarMeses(mes, 1) };
}

/** Token de cor da categoria ("c3") → valor CSS. Sem cor, o cinza-azulado da paleta. */
export function corCss(cor: string | null | undefined): string {
  return `var(--${cor && /^c(10|[0-9])$/.test(cor) ? cor : 'c9'})`;
}

export const NOMES_CORES: Record<Cor, string> = {
  c0: 'Azul',
  c1: 'Verde-água',
  c2: 'Âmbar',
  c3: 'Violeta',
  c4: 'Rosa',
  c5: 'Verde',
  c6: 'Laranja',
  c7: 'Azul-claro',
  c8: 'Mostarda',
  c9: 'Cinza',
  c10: 'Vinho',
};

/** "2026-10-15T14:03:00.000Z" → "15/10/2026" no horário local. */
export function dataDeIso(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "1 lançamento", "3 lançamentos" */
export function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

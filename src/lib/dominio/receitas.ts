/**
 * Receitas (entradas de dinheiro): categorias, agrupamento por dia, composição por categoria e
 * fluxo do mês (entradas, saídas, saldo e taxa de poupança). Tudo em centavos inteiros: somas
 * passam por `somar` (que confere o inteiro seguro) e percentuais são feitos com BigInt,
 * arredondados "meio para cima" (na magnitude) uma única vez no fim de cada conta.
 * Receita é só registro: não altera o saldo das contas. Este módulo não conhece banco nem tela.
 */
import { ehMes, type Dia, type Mes } from './datas.ts';
import { somar } from './dinheiro.ts';

export const CATEGORIAS_RECEITA = [
  'Salário',
  'Bolsa',
  'Freelance',
  'Rendimentos',
  'Reembolso',
  'Presente',
  'Outros',
] as const;

export type CategoriaReceita = (typeof CATEGORIAS_RECEITA)[number];

export function ehCategoriaReceita(v: unknown): v is CategoriaReceita {
  return typeof v === 'string' && (CATEGORIAS_RECEITA as readonly string[]).includes(v);
}

/** Uma receita do mês, como a tela a mostra (fora da lixeira). */
export interface ReceitaDoMes {
  id: string;
  data: Dia;
  descricao: string | null;
  categoria: string;
  valorCentavos: number;
  contaNome: string | null;
  contaRemovida: boolean;
  /** Veio de uma receita recorrente (salário, bolsa…) e não de um lançamento avulso. */
  recorrente?: boolean;
  /** false = prevista (gerada por recorrente e ainda não confirmada). Ausente conta como recebida. */
  confirmada?: boolean;
}

export interface DiaDeReceitas {
  data: Dia;
  totalCentavos: number;
  itens: ReceitaDoMes[];
}

/** Agrupa receitas por dia, do mais recente ao mais antigo (ordem estável dentro do dia). */
export function agruparReceitasPorDia(r: readonly ReceitaDoMes[]): DiaDeReceitas[] {
  const ordenadas = [...r].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  const dias: DiaDeReceitas[] = [];
  for (const x of ordenadas) {
    let d = dias.at(-1);
    if (!d || d.data !== x.data) dias.push((d = { data: x.data, totalCentavos: 0, itens: [] }));
    d.itens.push(x);
    d.totalCentavos = somar([d.totalCentavos, x.valorCentavos]);
  }
  return dias;
}

export interface FatiaReceita {
  categoria: string;
  totalCentavos: number;
  /** 0 a 100, com 1 casa decimal. */
  percentual: number;
}

/** Divisão inteira com arredondamento "meio para cima" na magnitude. */
function dividirArredondando(numerador: bigint, denominador: bigint): bigint {
  if (denominador === 0n) throw new RangeError('Divisão por zero');
  const negativo = numerador < 0n !== denominador < 0n;
  const a = numerador < 0n ? -numerador : numerador;
  const b = denominador < 0n ? -denominador : denominador;
  const q = (2n * a + b) / (2n * b);
  return negativo ? -q : q;
}

/** Razão em porcentagem com 1 casa decimal, arredondada uma única vez. */
function porcentagemUmaCasa(parte: number, total: number): number {
  return Number(dividirArredondando(BigInt(parte) * 1000n, BigInt(total))) / 10;
}

/** Composição das receitas por categoria, maior total primeiro (desempate pelo nome). */
export function porCategoriaReceita(r: readonly ReceitaDoMes[]): FatiaReceita[] {
  const totais = new Map<string, number>();
  for (const x of r) {
    totais.set(x.categoria, somar([totais.get(x.categoria) ?? 0, x.valorCentavos]));
  }
  const totalGeral = somar([...totais.values()]);
  return [...totais.entries()]
    .map(([categoria, totalCentavos]) => ({
      categoria,
      totalCentavos,
      percentual: totalGeral === 0 ? 0 : porcentagemUmaCasa(totalCentavos, totalGeral),
    }))
    .sort(
      (a, b) =>
        b.totalCentavos - a.totalCentavos || a.categoria.localeCompare(b.categoria, 'pt-BR'),
    );
}

export interface ResumoFluxo {
  entradasCentavos: number;
  saidasCentavos: number;
  /** Entradas menos saídas; pode ser negativo. */
  saldoCentavos: number;
  /** saldo / entradas, em porcentagem com 1 casa; null sem entradas; pode ser negativa. */
  taxaPoupancaPercentual: number | null;
}

export function resumoFluxo(entradasCentavos: number, saidasCentavos: number): ResumoFluxo {
  const saldoCentavos = somar([entradasCentavos, -saidasCentavos]);
  const taxaPoupancaPercentual =
    entradasCentavos === 0
      ? null
      : Number(dividirArredondando(BigInt(saldoCentavos) * 1000n, BigInt(entradasCentavos))) / 10;
  return { entradasCentavos, saidasCentavos, saldoCentavos, taxaPoupancaPercentual };
}

export interface FluxoMes extends ResumoFluxo {
  mes: Mes;
}

/** Fluxo de cada mês pedido, na ordem recebida. Mês ausente em qualquer mapa conta como 0. */
export function fluxoMensal(
  meses: readonly Mes[],
  entradasPorMes: Readonly<Record<Mes, number>>,
  saidasPorMes: Readonly<Record<Mes, number>>,
): FluxoMes[] {
  for (const mes of meses) {
    if (!ehMes(mes)) throw new RangeError(`Mês inválido (use AAAA-MM): "${mes}"`);
  }
  return meses.map((mes) => ({
    mes,
    ...resumoFluxo(entradasPorMes[mes] ?? 0, saidasPorMes[mes] ?? 0),
  }));
}

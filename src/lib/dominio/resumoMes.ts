/**
 * Resumo do mês: matemática pura para comparar um mês com a média dos meses anteriores.
 *
 * Tudo em centavos inteiros. Médias e percentuais são arredondados "meio para cima" na magnitude,
 * uma única vez, com BigInt (sem ponto flutuante). Este módulo não conhece banco nem tela: quem
 * lê os lançamentos é o serviço `servicos/resumoMes.ts`.
 */
import { somarMeses, type Dia, type Mes } from './datas.ts';
import { somar, type Centavos } from './dinheiro.ts';

/** Quantos meses anteriores entram na média. */
export const MESES_DE_REFERENCIA = 3;
/** Quantas categorias aparecem em "O que mais subiu" e em "O que mais caiu". */
export const TOP_CATEGORIAS = 3;

/** Divisão inteira arredondada "meio para cima" na magnitude. */
function dividirArredondando(numerador: bigint, denominador: bigint): bigint {
  if (denominador === 0n) throw new RangeError('Divisão por zero');
  const negativo = numerador < 0n !== denominador < 0n;
  const a = numerador < 0n ? -numerador : numerador;
  const b = denominador < 0n ? -denominador : denominador;
  const q = (2n * a + b) / (2n * b);
  return negativo && q !== 0n ? -q : q;
}

/** Média inteira de uma soma dividida por `meses`; null se não há meses com dados. */
export function mediaArredondada(somaCentavos: Centavos, meses: number): Centavos | null {
  if (meses <= 0) return null;
  return Number(dividirArredondando(BigInt(somaCentavos), BigInt(meses)));
}

/** Diferença em percentual inteiro (sinal preservado); null se a referência é zero. */
export function percentualDe(
  diferencaCentavos: Centavos,
  referenciaCentavos: Centavos,
): number | null {
  if (referenciaCentavos === 0) return null;
  return Number(
    dividirArredondando(BigInt(diferencaCentavos) * 100n, BigInt(Math.abs(referenciaCentavos))),
  );
}

/** Parte sobre total em porcentagem com 1 casa decimal; null se o total é zero. */
function porcentagemUmaCasa(parteCentavos: Centavos, totalCentavos: Centavos): number | null {
  if (totalCentavos === 0) return null;
  return Number(dividirArredondando(BigInt(parteCentavos) * 1000n, BigInt(totalCentavos))) / 10;
}

export interface ComparacaoMedia {
  atualCentavos: Centavos;
  /** Média mensal dos meses de referência que tinham dados. */
  mediaCentavos: Centavos;
  /** Quantos meses de referência entraram na média (0 a 3). */
  meses: number;
  /** atual − média: positivo = acima da média. */
  diferencaCentavos: Centavos;
  /** Diferença em % da média (inteiro); null se a média é zero. */
  percentual: number | null;
}

/**
 * Compara o valor do mês com a média dos meses de referência. `somaAnteriores` é a soma desses
 * meses e `meses` quantos tinham dados (meses vazios não puxam a média para baixo). Null se
 * nenhum tinha dados: sem histórico, não há comparação.
 */
export function compararComMedia(
  atualCentavos: Centavos,
  somaAnteriores: Centavos,
  meses: number,
): ComparacaoMedia | null {
  const mediaCentavos = mediaArredondada(somaAnteriores, meses);
  if (mediaCentavos === null) return null;
  const diferencaCentavos = somar([atualCentavos, -mediaCentavos]);
  return {
    atualCentavos,
    mediaCentavos,
    meses,
    diferencaCentavos,
    percentual: percentualDe(diferencaCentavos, mediaCentavos),
  };
}

export interface ComparacaoTaxa {
  /** Taxa do mês, em % com 1 casa; null sem entradas. */
  atualPercentual: number | null;
  /** Taxa média dos meses de referência (soma das sobras ÷ soma das entradas). */
  mediaPercentual: number;
  /** Diferença em pontos percentuais (1 casa); null sem taxa do mês. */
  diferencaPontos: number | null;
  meses: number;
}

/**
 * Taxa de poupança do mês contra a dos meses de referência. A média é a taxa agregada (soma das
 * sobras ÷ soma das entradas), não a média das taxas. Null sem entradas nos meses de referência.
 */
export function compararTaxa(
  atualPercentual: number | null,
  somaSobrasAnteriores: Centavos,
  somaEntradasAnteriores: Centavos,
  meses: number,
): ComparacaoTaxa | null {
  if (meses <= 0) return null;
  const mediaPercentual = porcentagemUmaCasa(somaSobrasAnteriores, somaEntradasAnteriores);
  if (mediaPercentual === null) return null;
  const diferencaPontos =
    atualPercentual === null
      ? null
      : (Math.round(atualPercentual * 10) - Math.round(mediaPercentual * 10)) / 10;
  return { atualPercentual, mediaPercentual, diferencaPontos, meses };
}

/** Um gasto do mês (uma linha por parcela de competência), só com o que a comparação usa. */
export interface GastoDoMes {
  data: Dia;
  descricao: string | null;
  valorCentavos: Centavos;
  categoriaId: string;
  categoriaNome: string;
  categoriaCor: string | null;
}

export interface ComparacaoCategoria {
  categoriaId: string;
  nome: string;
  cor: string | null;
  totalCentavos: Centavos;
  mediaCentavos: Centavos | null;
  meses: number;
  diferencaCentavos: Centavos | null;
  percentual: number | null;
}

/** Categoria com média e diferença de fato (sem histórico, não entra em subiu/caiu). */
export type CategoriaComparada = ComparacaoCategoria & {
  mediaCentavos: Centavos;
  diferencaCentavos: Centavos;
};

function temComparacao(c: ComparacaoCategoria): c is CategoriaComparada {
  return c.mediaCentavos !== null && c.diferencaCentavos !== null;
}

/** Total de cada categoria: por id, com nome e cor do primeiro lançamento que a mostrou. */
function totaisPorCategoria(gastos: readonly GastoDoMes[]): Map<
  string,
  {
    nome: string;
    cor: string | null;
    total: Centavos;
  }
> {
  const mapa = new Map<string, { nome: string; cor: string | null; total: Centavos }>();
  for (const g of gastos) {
    const atual = mapa.get(g.categoriaId);
    if (atual) atual.total = somar([atual.total, g.valorCentavos]);
    else
      mapa.set(g.categoriaId, {
        nome: g.categoriaNome,
        cor: g.categoriaCor,
        total: g.valorCentavos,
      });
  }
  return mapa;
}

/**
 * Compara cada categoria do mês com a média dela nos meses de referência. `anteriores` são os
 * gastos desses meses e `meses` quantos tinham gasto. A média divide pelo número de meses com
 * dados (não por 3), então a soma das médias das categorias bate com a média do total.
 * Categoria que só aparece nos meses anteriores entra com total zero. Maior total primeiro.
 */
export function compararCategorias(
  atuais: readonly GastoDoMes[],
  anteriores: readonly GastoDoMes[],
  meses: number,
): ComparacaoCategoria[] {
  const atualMapa = totaisPorCategoria(atuais);
  const antesMapa = totaisPorCategoria(anteriores);
  const ids = new Set([...atualMapa.keys(), ...antesMapa.keys()]);
  const lista: ComparacaoCategoria[] = [...ids].map((id) => {
    const atual = atualMapa.get(id);
    const antes = antesMapa.get(id);
    const nomeCor = atual ?? antes!;
    const totalCentavos = atual?.total ?? 0;
    const mediaCentavos = mediaArredondada(antes?.total ?? 0, meses);
    const diferencaCentavos =
      mediaCentavos === null ? null : somar([totalCentavos, -mediaCentavos]);
    return {
      categoriaId: id,
      nome: nomeCor.nome,
      cor: nomeCor.cor,
      totalCentavos,
      mediaCentavos,
      meses,
      diferencaCentavos,
      percentual:
        diferencaCentavos === null || mediaCentavos === null
          ? null
          : percentualDe(diferencaCentavos, mediaCentavos),
    };
  });
  return lista.sort(
    (a, b) => b.totalCentavos - a.totalCentavos || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/** As `n` categorias que mais subiram em reais contra a média (só as que subiram). */
export function maisSubiram(
  categorias: readonly ComparacaoCategoria[],
  n = TOP_CATEGORIAS,
): CategoriaComparada[] {
  return categorias
    .filter(temComparacao)
    .filter((c) => c.diferencaCentavos > 0)
    .sort(
      (a, b) => b.diferencaCentavos - a.diferencaCentavos || a.nome.localeCompare(b.nome, 'pt-BR'),
    )
    .slice(0, n);
}

/** As `n` categorias que mais caíram em reais contra a média (só as que caíram). */
export function maisCairam(
  categorias: readonly ComparacaoCategoria[],
  n = TOP_CATEGORIAS,
): CategoriaComparada[] {
  return categorias
    .filter(temComparacao)
    .filter((c) => c.diferencaCentavos < 0)
    .sort(
      (a, b) => a.diferencaCentavos - b.diferencaCentavos || a.nome.localeCompare(b.nome, 'pt-BR'),
    )
    .slice(0, n);
}

export interface MaiorGasto {
  descricao: string | null;
  categoriaNome: string;
  categoriaCor: string | null;
  valorCentavos: Centavos;
  data: Dia;
}

/** O gasto de maior valor do mês (empate: o mais recente). Null sem gastos. */
export function maiorGasto(gastos: readonly GastoDoMes[]): MaiorGasto | null {
  let melhor: GastoDoMes | null = null;
  for (const g of gastos) {
    if (
      !melhor ||
      g.valorCentavos > melhor.valorCentavos ||
      (g.valorCentavos === melhor.valorCentavos && g.data > melhor.data)
    ) {
      melhor = g;
    }
  }
  if (!melhor) return null;
  return {
    descricao: melhor.descricao,
    categoriaNome: melhor.categoriaNome,
    categoriaCor: melhor.categoriaCor,
    valorCentavos: melhor.valorCentavos,
    data: melhor.data,
  };
}

/** Os meses de referência de um mês: os três anteriores, do mais antigo ao mais recente. */
export function mesesDeReferencia(mes: Mes): Mes[] {
  return Array.from({ length: MESES_DE_REFERENCIA }, (_, i) =>
    somarMeses(mes, i - MESES_DE_REFERENCIA),
  );
}

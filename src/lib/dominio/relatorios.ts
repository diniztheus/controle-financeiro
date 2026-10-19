/**
 * Relatórios e buscas sobre lançamentos. Tudo em centavos inteiros: somas passam por `somar`
 * (que confere o inteiro seguro) e divisões e porcentagens são feitas com BigInt, arredondadas
 * "meio para cima" (na magnitude) uma única vez no fim de cada conta.
 * Funções puras: quem lê o banco é o serviço de relatórios. Este módulo não conhece banco nem tela.
 */
import { satsParaCentavos } from './bitcoin.ts';
import { ehDia, ehMes, type Dia, type Mes, ultimoDiaDoMes } from './datas.ts';
import { ehCentavos, centavosParaCampo, somar, type Centavos } from './dinheiro.ts';
import type { Lancamento } from './lancamentos.ts';
import type { ReceitaDoMes } from './receitas.ts';

export interface FiltroLancamentos {
  /** Trecho procurado em descrição, categoria, conta e cartão. Ignora maiúsculas e acentos. */
  texto?: string;
  /** Primeiro dia incluído, "AAAA-MM-DD". */
  de?: Dia;
  /** Último dia incluído, "AAAA-MM-DD". */
  ate?: Dia;
  categoriaId?: string;
  meio?: 'conta' | 'cartao';
  /** Nome exato da conta OU do cartão. */
  origem?: string;
  /** Menor valor da parcela, em centavos (incluído). */
  minCentavos?: number;
  /** Maior valor da parcela, em centavos (incluído). */
  maxCentavos?: number;
}

export interface LinhaCategoriaMes {
  categoriaId: string;
  categoriaNome: string;
  categoriaCor: string | null;
  /** Gasto da categoria em cada mês pedido (0 quando não houve). */
  porMes: Record<Mes, number>;
  totalCentavos: number;
  /** Total dividido pela quantidade de meses pedidos, arredondado ao centavo. */
  mediaMensalCentavos: number;
}

export interface ComparativoMes {
  mes: Mes;
  totalCentavos: number;
  variacaoCentavos: number | null;
  /** Variação sobre o mês anterior, em porcentagem com duas casas (ex.: 33.33). */
  variacaoPercentual: number | null;
}

export interface PontoPatrimonio {
  mes: Mes;
  contasCentavos: number;
  bitcoinCentavos: number;
  totalCentavos: number;
  /** false quando nenhuma conta tinha saldo registrado até o fim do mês. */
  temSaldo: boolean;
}

export interface RegistroSaldo {
  contaId: string;
  saldoCentavos: number;
  /** Momento do registro em ISO UTC; a data é o começo do texto. */
  registradoEm: string;
}

/** Normaliza para comparação: sem acentos (NFD) e em minúsculas. */
function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
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

function validarMeses(meses: readonly Mes[]): void {
  for (const mes of meses) {
    if (!ehMes(mes)) throw new RangeError(`Mês inválido (use AAAA-MM): "${mes}"`);
  }
}

function validarFiltro(f: FiltroLancamentos): void {
  for (const [nome, dia] of [
    ['de', f.de],
    ['ate', f.ate],
  ] as const) {
    if (dia !== undefined && !ehDia(dia)) throw new RangeError(`Dia inválido em ${nome}: "${dia}"`);
  }
  for (const [nome, valor] of [
    ['minCentavos', f.minCentavos],
    ['maxCentavos', f.maxCentavos],
  ] as const) {
    if (valor !== undefined && !ehCentavos(valor)) {
      throw new RangeError(`${nome} precisa ser centavos inteiros: ${valor}`);
    }
  }
}

/**
 * Lançamentos que atendem a todos os critérios informados (E lógico). Critério ausente, vazio
 * ou em branco não filtra. Devolve um array novo; a entrada não é alterada.
 */
export function filtrarLancamentos(l: readonly Lancamento[], f: FiltroLancamentos): Lancamento[] {
  validarFiltro(f);
  const texto = normalizarTexto((f.texto ?? '').trim());

  return l.filter((x) => {
    if (texto) {
      const campos = [x.descricao, x.categoriaNome, x.contaNome, x.cartaoNome];
      const achou = campos.some((c) => c != null && normalizarTexto(c).includes(texto));
      if (!achou) return false;
    }
    if (f.de !== undefined && x.data < f.de) return false;
    if (f.ate !== undefined && x.data > f.ate) return false;
    if (f.categoriaId && x.categoriaId !== f.categoriaId) return false;
    if (f.meio && x.meio !== f.meio) return false;
    if (f.origem && x.contaNome !== f.origem && x.cartaoNome !== f.origem) return false;
    if (f.minCentavos !== undefined && x.valorCentavos < f.minCentavos) return false;
    if (f.maxCentavos !== undefined && x.valorCentavos > f.maxCentavos) return false;
    return true;
  });
}

/**
 * Gasto por categoria em cada mês pedido. `porMes` traz os lançamentos de cada mês; mês ausente
 * em `porMes` conta como sem gasto. Linhas ordenadas por total (maior primeiro), com desempate
 * pelo nome. A média divide pelo número de meses pedidos, inclusive os sem gasto.
 */
export function gastosPorCategoriaEmMeses(
  meses: readonly Mes[],
  porMes: Readonly<Record<Mes, readonly Lancamento[]>>,
): {
  meses: Mes[];
  linhas: LinhaCategoriaMes[];
  totaisPorMes: Record<Mes, number>;
  totalCentavos: number;
} {
  validarMeses(meses);
  const listaMeses = [...meses];
  const totaisPorMes: Record<Mes, number> = {};
  const linhas = new Map<string, LinhaCategoriaMes>();

  for (const mes of listaMeses) {
    totaisPorMes[mes] = 0;
    for (const x of porMes[mes] ?? []) {
      let linha = linhas.get(x.categoriaId);
      if (!linha) {
        linha = {
          categoriaId: x.categoriaId,
          categoriaNome: x.categoriaNome,
          categoriaCor: x.categoriaCor,
          porMes: {},
          totalCentavos: 0,
          mediaMensalCentavos: 0,
        };
        linhas.set(x.categoriaId, linha);
      }
      linha.porMes[mes] = somar([linha.porMes[mes] ?? 0, x.valorCentavos]);
      linha.totalCentavos = somar([linha.totalCentavos, x.valorCentavos]);
      totaisPorMes[mes] = somar([totaisPorMes[mes] ?? 0, x.valorCentavos]);
    }
  }

  const n = BigInt(listaMeses.length);
  const saida = [...linhas.values()].map((linha) => {
    for (const mes of listaMeses) linha.porMes[mes] ??= 0;
    const media = n === 0n ? 0 : Number(dividirArredondando(BigInt(linha.totalCentavos), n));
    return { ...linha, mediaMensalCentavos: media };
  });
  saida.sort(
    (a, b) =>
      b.totalCentavos - a.totalCentavos || a.categoriaNome.localeCompare(b.categoriaNome, 'pt-BR'),
  );

  const totalCentavos = somar(Object.values(totaisPorMes));
  return { meses: listaMeses, linhas: saida, totaisPorMes, totalCentavos };
}

/**
 * Variação de cada mês sobre o anterior. O primeiro mês da lista não tem anterior (variação
 * null). A porcentagem é null quando o mês anterior foi zero.
 */
export function comparativoMensal(
  meses: readonly Mes[],
  totaisPorMes: Readonly<Record<Mes, number>>,
): ComparativoMes[] {
  validarMeses(meses);
  return meses.map((mes, i) => {
    const totalCentavos = totaisPorMes[mes] ?? 0;
    if (i === 0) {
      return { mes, totalCentavos, variacaoCentavos: null, variacaoPercentual: null };
    }
    const anterior = totaisPorMes[meses[i - 1] as Mes] ?? 0;
    const variacaoCentavos = somar([totalCentavos, -anterior]);
    const variacaoPercentual =
      anterior === 0
        ? null
        : Number(dividirArredondando(BigInt(variacaoCentavos) * 10_000n, BigInt(anterior))) / 100;
    return { mes, totalCentavos, variacaoCentavos, variacaoPercentual };
  });
}

/** Os `n` maiores valores. Empate de valor: o lançamento mais recente vem antes. */
export function maioresGastos(l: readonly Lancamento[], n: number): Lancamento[] {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Quantidade inválida: ${n}`);
  return [...l]
    .sort(
      (a, b) =>
        b.valorCentavos - a.valorCentavos || (a.data < b.data ? 1 : a.data > b.data ? -1 : 0),
    )
    .slice(0, n);
}

/**
 * Patrimônio no fim de cada mês pedido. Cada conta vale o último saldo registrado até o fim do
 * mês (pelo momento do registro). Bitcoin vale os sats acumulados até o fim do mês ao último
 * preço conhecido até o fim do mês; sem preço, vale 0.
 */
export function evolucaoPatrimonio(
  meses: readonly Mes[],
  saldos: readonly RegistroSaldo[],
  btcMovs: readonly { sats: number; data: string }[],
  btcPrecos: readonly { data: string; precoCentavos: number }[],
): PontoPatrimonio[] {
  validarMeses(meses);
  return meses.map((mes) => {
    const fim = ultimoDiaDoMes(mes);

    const ultimoPorConta = new Map<string, RegistroSaldo>();
    for (const r of saldos) {
      if (r.registradoEm.slice(0, 10) > fim) continue;
      const atual = ultimoPorConta.get(r.contaId);
      if (!atual || r.registradoEm >= atual.registradoEm) ultimoPorConta.set(r.contaId, r);
    }
    const contasCentavos = somar([...ultimoPorConta.values()].map((r) => r.saldoCentavos));

    let sats = 0;
    for (const m of btcMovs) if (m.data <= fim) sats += m.sats;

    let precoVigente: { data: string; precoCentavos: number } | null = null;
    for (const p of btcPrecos) {
      if (p.data <= fim && (!precoVigente || p.data >= precoVigente.data)) precoVigente = p;
    }
    const bitcoinCentavos = precoVigente ? satsParaCentavos(sats, precoVigente.precoCentavos) : 0;

    return {
      mes,
      contasCentavos,
      bitcoinCentavos,
      totalCentavos: somar([contasCentavos, bitcoinCentavos]),
      temSaldo: ultimoPorConta.size > 0,
    };
  });
}

const CABECALHO_CSV = [
  'Data',
  'Descrição',
  'Categoria',
  'Valor',
  'Parcela',
  'Meio',
  'Conta/Cartão',
] as const;

/** Célula de texto que o Excel ou o Calc leriam como fórmula ganha um apóstrofo na frente. */
function protegerFormula(texto: string): string {
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
}

function celulaCsv(texto: string): string {
  const seguro = protegerFormula(texto);
  return /[;"\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/**
 * CSV com `;` como separador, valores com vírgula decimal ("42,90") e linhas terminadas em
 * `\r\n`. Não inclui BOM: quem grava o arquivo decide.
 */
export function lancamentosParaCsv(l: readonly Lancamento[]): string {
  const linhas = l.map((x) =>
    [
      x.data,
      x.descricao ?? '',
      x.categoriaNome,
      centavosParaCampo(x.valorCentavos),
      `${x.parcela}/${x.numParcelas}`,
      x.meio === 'cartao' ? 'Cartão' : 'Conta',
      x.contaNome ?? x.cartaoNome ?? '',
    ]
      .map((c, i) => (i === 3 || i === 4 ? c : celulaCsv(c)))
      .join(';'),
  );
  return [CABECALHO_CSV.join(';'), ...linhas].map((linha) => `${linha}\r\n`).join('');
}

/** "42.90", "0.05", "-3.40": valor com ponto decimal, montado a partir dos dígitos. */
function valorComPonto(c: Centavos): string {
  const digitos = Math.abs(c).toString().padStart(3, '0');
  return `${c < 0 ? '-' : ''}${digitos.slice(0, -2)}.${digitos.slice(-2)}`;
}

/** JSON indentado com 2 espaços: valor em centavos e também como texto "42.90". */
export function lancamentosParaJson(l: readonly Lancamento[]): string {
  return JSON.stringify(
    l.map((x) => {
      if (!ehCentavos(x.valorCentavos)) {
        throw new RangeError(`Valor não está em centavos inteiros: ${x.valorCentavos}`);
      }
      return {
        data: x.data,
        descricao: x.descricao,
        categoria: x.categoriaNome,
        valorCentavos: x.valorCentavos,
        valor: valorComPonto(x.valorCentavos),
        parcela: x.parcela,
        numParcelas: x.numParcelas,
        meio: x.meio,
        origem: x.contaNome ?? x.cartaoNome ?? null,
      };
    }),
    null,
    2,
  );
}

const CABECALHO_CSV_RECEITAS = [
  'Data',
  'Descrição',
  'Categoria',
  'Valor',
  'Conta',
  'Situação',
  'Recorrente',
] as const;

/** CSV de receitas: mesmas regras do CSV de lançamentos (`;`, vírgula decimal, `\r\n`, sem BOM). */
export function receitasParaCsv(r: readonly ReceitaDoMes[]): string {
  const linhas = r.map((x) =>
    [
      x.data,
      x.descricao ?? '',
      x.categoria,
      centavosParaCampo(x.valorCentavos),
      x.contaNome ?? '',
      x.confirmada === false ? 'Prevista' : 'Recebida',
      x.recorrente ? 'Sim' : 'Não',
    ]
      .map((c, i) => (i === 3 ? c : celulaCsv(c)))
      .join(';'),
  );
  return [CABECALHO_CSV_RECEITAS.join(';'), ...linhas].map((linha) => `${linha}\r\n`).join('');
}

/** JSON de receitas: valor em centavos e também como texto "42.90", como o de lançamentos. */
export function receitasParaJson(r: readonly ReceitaDoMes[]): string {
  return JSON.stringify(
    r.map((x) => {
      if (!ehCentavos(x.valorCentavos)) {
        throw new RangeError(`Valor não está em centavos inteiros: ${x.valorCentavos}`);
      }
      return {
        data: x.data,
        descricao: x.descricao,
        categoria: x.categoria,
        valorCentavos: x.valorCentavos,
        valor: valorComPonto(x.valorCentavos),
        conta: x.contaNome,
        situacao: x.confirmada === false ? 'prevista' : 'recebida',
        recorrente: x.recorrente === true,
      };
    }),
    null,
    2,
  );
}

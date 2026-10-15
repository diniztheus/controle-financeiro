/**
 * Dinheiro em centavos inteiros.
 *
 * Regra da casa: nenhum valor em reais passa por ponto flutuante. A entrada do usuário
 * ("1.234,56") é lida como texto e convertida direto para centavos; a saída é montada
 * a partir dos dígitos. Este módulo não conhece banco nem tela.
 */

/** Valor monetário em centavos (inteiro seguro). */
export type Centavos = number;

/** Maior valor aceito: R$ 90 trilhões, bem abaixo do limite de inteiro seguro. */
export const LIMITE_CENTAVOS = 9_000_000_000_000_000;

const ESPACOS = /[\s\u00a0\u202f]/g;
const MENOS = /^[-−]/;
const MILHAR_PONTO = /^\d{1,3}(?:\.\d{3})+$/;

export function ehCentavos(valor: unknown): valor is Centavos {
  return (
    typeof valor === 'number' && Number.isSafeInteger(valor) && Math.abs(valor) <= LIMITE_CENTAVOS
  );
}

/**
 * Lê um valor digitado em reais e devolve centavos, ou `null` se o texto não for um valor.
 *
 * Aceita: "12", "12,5", "12,50", "1.234,56", "1234,56", "R$ 1.234,56", "-3,40", "−3,40",
 * "+7", ",5", "1.234" (milhar) e, por compatibilidade com o app atual, "12.5" / "12.50"
 * (ponto decimal com 1 ou 2 casas quando não há vírgula e não é milhar).
 *
 * Rejeita: vazio, letras, mais de 2 casas decimais, milhar mal agrupado ("1.23,00"),
 * mais de uma vírgula, sinal fora do começo, valores acima de {@link LIMITE_CENTAVOS}.
 */
export function parseValor(texto: string | null | undefined): Centavos | null {
  if (texto == null) return null;
  let s = String(texto).replace(ESPACOS, '');
  let negativo = false;

  // Sinal pode vir antes ou depois do "R$": "-R$ 3,40" ou "R$ -3,40".
  const lerSinal = () => {
    if (MENOS.test(s)) {
      negativo = true;
      s = s.slice(1);
      return true;
    }
    if (s.startsWith('+')) {
      s = s.slice(1);
      return true;
    }
    return false;
  };
  const temSinal = lerSinal();
  if (/^R\$/i.test(s)) s = s.slice(2);
  if (!temSinal) lerSinal();
  if (s === '') return null;

  let inteiro: string;
  let fracao: string;

  const virgulas = s.split(',').length - 1;
  if (virgulas > 1) return null;

  if (virgulas === 1) {
    const [antes = '', depois = ''] = s.split(',');
    if (!/^\d{1,2}$/.test(depois)) return null;
    if (antes === '') inteiro = '0';
    else if (/^\d+$/.test(antes)) inteiro = antes;
    else if (MILHAR_PONTO.test(antes)) inteiro = antes.replace(/\./g, '');
    else return null;
    fracao = depois;
  } else if (/^\d+$/.test(s)) {
    inteiro = s;
    fracao = '';
  } else if (MILHAR_PONTO.test(s)) {
    inteiro = s.replace(/\./g, '');
    fracao = '';
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    const [antes = '', depois = ''] = s.split('.');
    inteiro = antes;
    fracao = depois;
  } else {
    return null;
  }

  inteiro = inteiro.replace(/^0+(?=\d)/, '');
  if (inteiro.length > 16) return null;
  const centavosTexto = inteiro + fracao.padEnd(2, '0');
  const valor = Number(centavosTexto);
  if (!ehCentavos(valor)) return null;
  return negativo && valor !== 0 ? -valor : valor;
}

/** Como {@link parseValor}, mas lança erro com mensagem em português. */
export function exigirValor(texto: string | null | undefined): Centavos {
  const v = parseValor(texto);
  if (v === null) throw new Error(`Valor inválido: "${texto ?? ''}". Use, por exemplo, 1.234,56`);
  return v;
}

export interface PartesValor {
  /** "" ou "−" (sinal de menos tipográfico, como na v3). */
  sinal: '' | '−';
  /** Parte inteira com separador de milhar: "1.234". */
  inteiro: string;
  /** Sempre dois dígitos: "05". */
  centavos: string;
}

function agruparMilhar(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function exigirCentavos(c: number): void {
  if (!ehCentavos(c)) throw new RangeError(`Centavos precisam ser inteiros: ${c}`);
}

/** Separa centavos em sinal, inteiro e centavos, para o razão alinhado na vírgula. */
export function separarValor(c: Centavos): PartesValor {
  exigirCentavos(c);
  const abs = Math.abs(c);
  const texto = String(abs).padStart(3, '0');
  return {
    sinal: c < 0 ? '−' : '',
    inteiro: agruparMilhar(texto.slice(0, -2).replace(/^0+(?=\d)/, '')),
    centavos: texto.slice(-2),
  };
}

/** "R$ 1.234,56" (com espaço não separável) ou "−R$ 3,40". */
export function formatarBRL(c: Centavos): string {
  const p = separarValor(c);
  return `${p.sinal}R$\u00a0${p.inteiro},${p.centavos}`;
}

/** "1.234,56" sem símbolo; negativo com "−". */
export function formatarNumero(c: Centavos): string {
  const p = separarValor(c);
  return `${p.sinal}${p.inteiro},${p.centavos}`;
}

/** Texto para preencher um campo de valor: "1234,56" / "-3,40" (o que o parse aceita de volta). */
export function centavosParaCampo(c: Centavos): string {
  const p = separarValor(c);
  return `${p.sinal ? '-' : ''}${p.inteiro.replace(/\./g, '')},${p.centavos}`;
}

export const MAX_PARCELAS = 24;

/**
 * Divide um total em `n` parcelas inteiras. O resto dos centavos vai na 1ª parcela,
 * como no app atual: 100,00 em 3 = [33,34, 33,33, 33,33]. A soma é sempre o total.
 */
export function dividirEmParcelas(total: Centavos, n: number): Centavos[] {
  exigirCentavos(total);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PARCELAS) {
    throw new RangeError(`Número de parcelas deve ser de 1 a ${MAX_PARCELAS}: ${n}`);
  }
  const resto = total % n;
  const base = (total - resto) / n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}

/** Soma de centavos com verificação de inteiro seguro. */
export function somar(valores: readonly Centavos[]): Centavos {
  let s = 0;
  for (const v of valores) {
    exigirCentavos(v);
    s += v;
  }
  exigirCentavos(s);
  return s;
}

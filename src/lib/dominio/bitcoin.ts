/**
 * Bitcoin em sats inteiros.
 *
 * Regra da casa: bitcoin é contado em sats (1 BTC = 100.000.000 sats) e todo valor em reais em
 * centavos. Multiplicações e divisões passam por BigInt, então nenhuma conta perde precisão, e
 * o arredondamento é "meio para cima" (na magnitude), feito uma única vez no fim de cada conta.
 * Este módulo é puro: não conhece banco nem tela.
 *
 * Convenção dos movimentos: sats > 0 é compra, sats < 0 é venda. valorCentavos é sempre zero ou
 * positivo (quanto foi pago ou recebido; 0 quando não foi informado).
 */

import { ehCentavos, LIMITE_CENTAVOS } from './dinheiro.ts';

export const SATS_POR_BTC = 100_000_000;

/** Oferta máxima de bitcoin (21 milhões de BTC) em sats. Abaixo do limite de inteiro seguro. */
export const MAX_SATS = 21_000_000 * SATS_POR_BTC;

const BIG_SATS_POR_BTC = BigInt(SATS_POR_BTC);
const ESPACOS = /[\s\u00a0\u202f]/g;
const MILHAR_PONTO = /^\d{1,3}(?:\.\d{3})+$/;
const DIGITOS = /^\d+$/;

export interface MovBtc {
  /** Sats movimentados: positivo na compra, negativo na venda. */
  sats: number;
  /** Quanto foi pago (compra) ou recebido (venda), em centavos. 0 se não informado. */
  valorCentavos: number;
  /** Dia do movimento, "AAAA-MM-DD". */
  data: string;
}

export interface PrecoBtc {
  /** Dia do preço, "AAAA-MM-DD". */
  data: string;
  /** Centavos de real por 1 BTC. */
  precoCentavos: number;
}

/** Divisão inteira com arredondamento "meio para cima" na magnitude. */
function dividirArredondando(numerador: bigint, denominador: bigint): bigint {
  const negativo = numerador < 0n !== denominador < 0n;
  const a = numerador < 0n ? -numerador : numerador;
  const b = denominador < 0n ? -denominador : denominador;
  const q = (2n * a + b) / (2n * b);
  return negativo ? -q : q;
}

function comoNumero(valor: bigint, limite: number, nome: string): number {
  const n = Number(valor);
  if (!Number.isSafeInteger(n) || Math.abs(n) > limite) {
    throw new RangeError(`Resultado fora do limite (${nome}): ${valor}`);
  }
  return n;
}

function exigirSats(sats: number): void {
  if (!Number.isSafeInteger(sats) || Math.abs(sats) > MAX_SATS) {
    throw new RangeError(`Sats inválidos: ${sats}`);
  }
}

function exigirCentavos(centavos: number, nome: string): void {
  if (!ehCentavos(centavos))
    throw new RangeError(`${nome} precisa ser centavos inteiros: ${centavos}`);
}

function exigirPreco(precoCentavos: number): void {
  exigirCentavos(precoCentavos, 'Preço');
  if (precoCentavos < 0) throw new RangeError(`Preço não pode ser negativo: ${precoCentavos}`);
}

function exigirMovimento(m: MovBtc): void {
  exigirSats(m.sats);
  if (m.sats === 0) throw new RangeError(`Movimento sem sats em ${m.data}`);
  exigirCentavos(m.valorCentavos, 'Valor do movimento');
  if (m.valorCentavos < 0) throw new RangeError(`Valor do movimento negativo em ${m.data}`);
}

/** Quanto vale `sats` ao `precoCentavos` por BTC, arredondado para centavos. */
export function satsParaCentavos(sats: number, precoCentavos: number): number {
  exigirSats(sats);
  exigirPreco(precoCentavos);
  return comoNumero(
    dividirArredondando(BigInt(sats) * BigInt(precoCentavos), BIG_SATS_POR_BTC),
    LIMITE_CENTAVOS,
    'centavos',
  );
}

/** Quantos sats `centavos` compram ao `precoCentavos` por BTC, arredondado para sats. */
export function centavosParaSats(centavos: number, precoCentavos: number): number {
  exigirCentavos(centavos, 'Valor');
  exigirPreco(precoCentavos);
  if (precoCentavos === 0) throw new RangeError('Preço precisa ser maior que zero');
  return comoNumero(
    dividirArredondando(BigInt(centavos) * BIG_SATS_POR_BTC, BigInt(precoCentavos)),
    MAX_SATS,
    'sats',
  );
}

/**
 * Lê uma quantidade de sats digitada, ou `null` se não for um número inteiro positivo.
 * Aceita "1500", "1.500" (milhar) e espaços. Não aceita decimais, sinal, unidades nem zero.
 */
export function parseSats(texto: string | null | undefined): number | null {
  if (texto == null) return null;
  const s = String(texto).replace(ESPACOS, '');
  let digitos: string;
  if (MILHAR_PONTO.test(s)) digitos = s.replace(/\./g, '');
  else if (DIGITOS.test(s)) digitos = s;
  else return null;
  const n = Number(digitos);
  if (!Number.isSafeInteger(n) || n <= 0 || n > MAX_SATS) return null;
  return n;
}

/** "1.234.567 sats"; negativo com "−". */
export function formatarSats(sats: number): string {
  exigirSats(sats);
  const digitos = String(Math.abs(sats)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sats < 0 ? '−' : ''}${digitos} sats`;
}

export interface Posicao {
  /** Sats em carteira (todas as compras menos todas as vendas). */
  sats: number;
  /** Custo dos sats atuais que têm preço de compra (base do preço médio). */
  custoCentavos: number;
  /** Centavos por BTC do custo médio; null se não há sats com preço de compra. */
  precoMedioCentavos: number | null;
  /** Valor da posição ao preço atual; null se não há preço e a posição não está zerada. */
  valorAtualCentavos: number | null;
  /** Valor atual menos custo (não realizado); null se não há valor atual. */
  ganhoCentavos: number | null;
  /** Ganho sobre o custo, em porcentagem; null se não há custo ou ganho. */
  ganhoPercentual: number | null;
}

/**
 * Estado acumulado da carteira. `satsComPreco` e `custo` cobrem só os sats que têm preço de
 * compra; compras sem valor entram em `sats` mas não no preço médio.
 */
interface Estado {
  sats: number;
  satsComPreco: number;
  custo: number;
}

const ESTADO_INICIAL: Estado = { sats: 0, satsComPreco: 0, custo: 0 };

/**
 * Ordena por dia sem alterar a entrada. Dentro do mesmo dia, mantém a ordem recebida: quem chama
 * manda os movimentos do mesmo dia na ordem em que aconteceram (compra antes da venda).
 */
function ordenarPorData<T extends { data: string }>(itens: readonly T[]): T[] {
  return [...itens].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

/**
 * Aplica um movimento ao estado (preço médio móvel).
 *
 * Na venda, os sats sem preço de compra saem primeiro, então o preço médio dos sats pagos não
 * muda. O restante sai dos sats com preço, baixando o custo na proporção dos sats vendidos.
 * Venda maior que o saldo lança erro.
 */
function aplicarMovimento(e: Estado, m: MovBtc): Estado {
  exigirMovimento(m);

  if (m.sats > 0) {
    if (m.valorCentavos === 0) return { ...e, sats: e.sats + m.sats };
    return {
      sats: e.sats + m.sats,
      satsComPreco: e.satsComPreco + m.sats,
      custo: e.custo + m.valorCentavos,
    };
  }

  const vendidos = -m.sats;
  if (vendidos > e.sats) {
    throw new RangeError(`Venda de ${vendidos} sats excede o saldo de ${e.sats} sats em ${m.data}`);
  }
  const semPreco = e.sats - e.satsComPreco;
  const dePreco = vendidos - Math.min(vendidos, semPreco);
  const custoBaixado =
    dePreco === 0
      ? 0
      : comoNumero(
          dividirArredondando(BigInt(e.custo) * BigInt(dePreco), BigInt(e.satsComPreco)),
          LIMITE_CENTAVOS,
          'custo',
        );
  return {
    sats: e.sats - vendidos,
    satsComPreco: e.satsComPreco - dePreco,
    custo: e.custo - custoBaixado,
  };
}

/**
 * Posição atual pelo preço médio móvel, com ganho ou perda não realizado.
 * `precoAtualCentavos` null significa que não há preço: valor e ganho ficam null.
 */
export function calcularPosicao(
  movs: readonly MovBtc[],
  precoAtualCentavos: number | null,
): Posicao {
  if (precoAtualCentavos !== null) exigirPreco(precoAtualCentavos);

  const e = ordenarPorData(movs).reduce(aplicarMovimento, ESTADO_INICIAL);

  const precoMedioCentavos =
    e.satsComPreco > 0
      ? comoNumero(
          dividirArredondando(BigInt(e.custo) * BIG_SATS_POR_BTC, BigInt(e.satsComPreco)),
          LIMITE_CENTAVOS,
          'preço médio',
        )
      : null;

  let valorAtualCentavos: number | null;
  if (precoAtualCentavos !== null)
    valorAtualCentavos = satsParaCentavos(e.sats, precoAtualCentavos);
  else valorAtualCentavos = e.sats === 0 ? 0 : null;

  const ganhoCentavos = valorAtualCentavos === null ? null : valorAtualCentavos - e.custo;
  const ganhoPercentual =
    ganhoCentavos === null || e.custo === 0 ? null : (ganhoCentavos / e.custo) * 100;

  return {
    sats: e.sats,
    custoCentavos: e.custo,
    precoMedioCentavos,
    valorAtualCentavos,
    ganhoCentavos,
    ganhoPercentual,
  };
}

/**
 * Centavos por BTC de uma compra ou venda com valor. Null se não há valor (0) ou se o preço
 * arredondado fica abaixo de 1 centavo.
 */
export function precoImplicito(m: MovBtc): number | null {
  exigirMovimento(m);
  if (m.valorCentavos === 0) return null;
  const preco = Number(
    dividirArredondando(BigInt(m.valorCentavos) * BIG_SATS_POR_BTC, BigInt(Math.abs(m.sats))),
  );
  return preco >= 1 ? preco : null;
}

export interface PontoEvolucao {
  data: string;
  /** Sats acumulados até o fim do dia. */
  sats: number;
  /** Valor dos sats ao último preço conhecido até o dia; null se ainda não há preço. */
  valorCentavos: number | null;
}

/**
 * Um ponto por dia com movimento ou preço, em ordem crescente de data. Cada ponto usa o último
 * preço conhecido até aquele dia (inclusive). Enquanto não houver preço, o valor é null.
 */
export function calcularEvolucao(
  movs: readonly MovBtc[],
  precos: readonly PrecoBtc[],
): PontoEvolucao[] {
  for (const p of precos) {
    if (!p.data) throw new RangeError('Preço sem data');
    exigirPreco(p.precoCentavos);
  }

  const ms = ordenarPorData(movs);
  const ps = ordenarPorData(precos);
  const datas = [...new Set([...ms.map((m) => m.data), ...ps.map((p) => p.data)])].sort();

  const pontos: PontoEvolucao[] = [];
  let estado = ESTADO_INICIAL;
  let indiceMov = 0;
  let indicePreco = 0;
  let precoVigente: number | null = null;

  for (const data of datas) {
    for (let m = ms[indiceMov]; m && m.data <= data; m = ms[indiceMov]) {
      estado = aplicarMovimento(estado, m);
      indiceMov++;
    }
    for (let p = ps[indicePreco]; p && p.data <= data; p = ps[indicePreco]) {
      precoVigente = p.precoCentavos;
      indicePreco++;
    }
    pontos.push({
      data,
      sats: estado.sats,
      valorCentavos: precoVigente === null ? null : satsParaCentavos(estado.sats, precoVigente),
    });
  }
  return pontos;
}

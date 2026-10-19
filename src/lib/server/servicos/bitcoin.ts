/**
 * Bitcoin: movimentos de compra/venda em sats e preço do BTC (manual, implícito ou da API).
 *
 * Regras da casa:
 * - Sats são inteiros. Compra soma, venda subtrai; não se vende mais sats do que há na posição.
 * - Compra/venda com valor informado grava o preço implícito do dia em `btc_precos` (origem
 *   'implicito'), a não ser que o dia já tenha preço 'manual' ou 'api'.
 * - Preço manual sempre vence: o automático nunca sobrescreve um manual do mesmo dia.
 * - Remover manda o movimento para a lixeira (`removido_em`); restaurar traz de volta.
 * - A busca automática é opcional: qualquer falha (offline, timeout, resposta estranha) vira
 *   `{ ok: false }` e nunca lança.
 *
 * Escritas conferem e gravam na mesma transação IMMEDIATE, como no serviço de contas.
 */
import { and, desc, eq, isNotNull, isNull, max, asc } from 'drizzle-orm';
import {
  calcularEvolucao,
  calcularPosicao,
  precoImplicito,
  type MovBtc,
  type PontoEvolucao,
  type Posicao,
  type PrecoBtc,
} from '../../dominio/bitcoin.ts';
import { ehDia, hoje } from '../../dominio/datas.ts';
import type { Banco } from '../db/conexao.ts';
import { btcMovimentos, btcPrecos, config, type OrigemPreco } from '../db/esquema.ts';
import { agoraIso, ErroDeNegocio, naoEncontrado } from './erros.ts';

export type MovimentoBtc = typeof btcMovimentos.$inferSelect;

export interface DadosMovimentoBtc {
  /** + compra, − venda. */
  sats: number;
  /** Centavos pagos (compra) ou recebidos (venda); 0 se não informado. */
  valorCentavos: number;
  data: string;
  nota?: string | null;
}

export interface PrecoAtualBtc {
  precoCentavos: number;
  data: string;
  origem: OrigemPreco;
}

export interface PainelBitcoin {
  posicao: Posicao;
  preco: PrecoAtualBtc | null;
  movimentos: MovimentoBtc[];
  evolucao: PontoEvolucao[];
}

/** Endereço da API pública (CoinGecko): preço de 1 BTC em reais. */
const URL_PRECO = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl';
const TIMEOUT_MS = 5000;

const IMEDIATA = { behavior: 'immediate' } as const;

/** Prioridade de origem no mesmo dia: manual > api > implícito. */
const PRIORIDADE: Record<OrigemPreco, number> = { manual: 3, api: 2, implicito: 1 };

type Leitor = Pick<Banco['db'], 'select'>;

function ativos(db: Leitor): MovimentoBtc[] {
  return db
    .select()
    .from(btcMovimentos)
    .where(isNull(btcMovimentos.removidoEm))
    .orderBy(desc(btcMovimentos.data), desc(btcMovimentos.criadoEm), desc(btcMovimentos.id))
    .all();
}

/** Saldo de sats da posição (fora da lixeira). */
function saldoSats(db: Leitor): number {
  return ativos(db).reduce((total, m) => total + m.sats, 0);
}

function exigirAtivo(db: Leitor, id: string): MovimentoBtc {
  const m = db.select().from(btcMovimentos).where(eq(btcMovimentos.id, id)).get();
  if (!m || m.removidoEm) throw naoEncontrado('Este movimento não existe mais');
  return m;
}

/** Movimentos fora da lixeira, do mais novo para o mais antigo. */
export function listarMovimentos(banco: Banco): MovimentoBtc[] {
  return ativos(banco.db);
}

export function movimentosNaLixeira(banco: Banco): MovimentoBtc[] {
  return banco.db
    .select()
    .from(btcMovimentos)
    .where(isNotNull(btcMovimentos.removidoEm))
    .orderBy(desc(btcMovimentos.removidoEm))
    .all();
}

/** Grava (ou troca) o preço do dia sem tocar em preço manual ou da API quando pedido. */
function gravarPreco(
  db: Pick<Banco['db'], 'select' | 'insert'>,
  data: string,
  precoCentavos: number,
  origem: OrigemPreco,
): void {
  const existente = db.select().from(btcPrecos).where(eq(btcPrecos.data, data)).get();
  if (existente && origem === 'implicito' && existente.origem !== 'implicito') return;
  if (existente && origem === 'api' && existente.origem === 'manual') return;
  db.insert(btcPrecos)
    .values({ data, precoCentavos, origem })
    .onConflictDoUpdate({ target: btcPrecos.data, set: { precoCentavos, origem } })
    .run();
}

/**
 * Confere a lista inteira pela ordem das datas: nenhuma venda pode passar do saldo que havia
 * no dia dela (o domínio recusa o contrário, e a tela deixaria de abrir).
 */
function conferirOrdem(movs: readonly MovBtc[], campo?: string): void {
  try {
    calcularPosicao(movs, null);
  } catch (e) {
    if (e instanceof RangeError || (e instanceof Error && /excede o saldo/.test(e.message))) {
      throw new ErroDeNegocio(
        'Esta operação deixaria alguma venda sem sats suficientes na data dela. Confira as datas e os movimentos de venda.',
        campo,
      );
    }
    throw e;
  }
}

export function registrarMovimento(
  banco: Banco,
  d: DadosMovimentoBtc,
  agora = new Date(),
): MovimentoBtc {
  if (!Number.isSafeInteger(d.sats) || d.sats === 0) {
    throw new ErroDeNegocio('Informe uma quantidade de sats inteira e diferente de zero', 'sats');
  }
  if (!Number.isSafeInteger(d.valorCentavos) || d.valorCentavos < 0) {
    throw new ErroDeNegocio('O valor não pode ser negativo', 'valor');
  }
  if (!ehDia(d.data)) throw new ErroDeNegocio('Data inválida', 'data');
  const nota = d.nota?.trim() || null;

  return banco.db.transaction((tx) => {
    if (d.sats < 0 && -d.sats > saldoSats(tx)) {
      throw new ErroDeNegocio(
        'Você não tem essa quantidade de sats para vender. Confira o saldo na posição.',
        'sats',
      );
    }
    conferirOrdem(
      [...ativos(tx), { sats: d.sats, valorCentavos: d.valorCentavos, data: d.data }],
      'data',
    );
    const quando = agoraIso(agora);
    const mov = tx
      .insert(btcMovimentos)
      .values({
        sats: d.sats,
        valorCentavos: d.valorCentavos,
        data: d.data,
        nota,
        criadoEm: quando,
        atualizadoEm: quando,
      })
      .returning()
      .get();

    const implicito = precoImplicito(mov);
    if (implicito !== null) gravarPreco(tx, d.data, implicito, 'implicito');
    return mov;
  }, IMEDIATA);
}

/** Manda o movimento para a lixeira, sem deixar a posição com sats negativos. */
export function removerMovimento(banco: Banco, id: string, agora = new Date()): void {
  banco.db.transaction((tx) => {
    exigirAtivo(tx, id);
    conferirOrdem(ativos(tx).filter((x) => x.id !== id));
    tx.update(btcMovimentos)
      .set({ removidoEm: agoraIso(agora) })
      .where(eq(btcMovimentos.id, id))
      .run();
  }, IMEDIATA);
}

/** Tira da lixeira, conferindo o saldo de sats depois de voltar. */
export function restaurarMovimento(banco: Banco, id: string): MovimentoBtc {
  return banco.db.transaction((tx) => {
    const m = tx.select().from(btcMovimentos).where(eq(btcMovimentos.id, id)).get();
    if (!m) throw naoEncontrado('Este movimento não existe mais');
    if (!m.removidoEm) return m;
    conferirOrdem([...ativos(tx), m]);
    return tx
      .update(btcMovimentos)
      .set({ removidoEm: null })
      .where(and(eq(btcMovimentos.id, id), isNotNull(btcMovimentos.removidoEm)))
      .returning()
      .get()!;
  }, IMEDIATA);
}

/** Preço informado à mão: sobrescreve qualquer origem do dia. */
export function definirPrecoManual(banco: Banco, data: string, precoCentavos: number): void {
  if (!ehDia(data)) throw new ErroDeNegocio('Data inválida', 'data');
  if (!Number.isSafeInteger(precoCentavos) || precoCentavos <= 0) {
    throw new ErroDeNegocio('O preço precisa ser maior que zero', 'preco');
  }
  banco.db.transaction((tx) => gravarPreco(tx, data, precoCentavos, 'manual'), IMEDIATA);
}

/** Preço vindo da API: só grava se o dia não tiver preço manual. */
export function salvarPrecoAutomatico(banco: Banco, data: string, precoCentavos: number): void {
  banco.db.transaction((tx) => gravarPreco(tx, data, precoCentavos, 'api'), IMEDIATA);
}

/** Valor lido da API, validado. Qualquer outra forma vira erro. */
function lerPrecoDaResposta(corpo: unknown): number {
  const brl = (corpo as { bitcoin?: { brl?: unknown } } | null)?.bitcoin?.brl;
  if (typeof brl !== 'number' || !Number.isFinite(brl) || brl <= 0) {
    throw new Error('resposta inesperada');
  }
  return Math.round(brl * 100);
}

/**
 * Busca o preço de hoje na API pública. Preço manual de hoje tem prioridade (não busca).
 * Nunca lança: qualquer falha vira `{ ok: false }` com mensagem para a tela.
 */
export async function buscarPrecoAutomatico(
  banco: Banco,
  buscar: typeof fetch = fetch,
): Promise<{ ok: boolean; mensagem: string }> {
  const dia = hoje();
  try {
    const manual = banco.db
      .select()
      .from(btcPrecos)
      .where(and(eq(btcPrecos.data, dia), eq(btcPrecos.origem, 'manual')))
      .get();
    if (manual) {
      return {
        ok: true,
        mensagem: 'Você informou o preço de hoje à mão, e ele será mantido.',
      };
    }

    const controle = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const estouro = new Promise<never>((_, rejeitar) => {
      timer = setTimeout(() => {
        controle.abort();
        rejeitar(new Error('tempo esgotado'));
      }, TIMEOUT_MS);
    });
    const trabalho = (async () => {
      const resposta = await buscar(URL_PRECO, {
        signal: controle.signal,
        headers: { accept: 'application/json' },
      });
      if (!resposta.ok) throw new Error(`status ${resposta.status}`);
      return lerPrecoDaResposta(await resposta.json());
    })();

    let precoCentavos: number;
    try {
      precoCentavos = await Promise.race([trabalho, estouro]);
    } finally {
      clearTimeout(timer);
    }
    salvarPrecoAutomatico(banco, dia, precoCentavos);
    const reais = (precoCentavos / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    return { ok: true, mensagem: `Preço de hoje atualizado: ${reais} por bitcoin.` };
  } catch {
    return {
      ok: false,
      mensagem:
        'Não foi possível buscar o preço agora (sem internet ou serviço indisponível). Você pode informar o preço à mão.',
    };
  }
}

/** Último preço conhecido. No mesmo dia: manual > api > implícito. */
export function precoAtual(banco: Banco): PrecoAtualBtc | null {
  const ultimo = banco.db
    .select({ m: max(btcPrecos.data) })
    .from(btcPrecos)
    .get();
  if (!ultimo?.m) return null;
  const doDia = banco.db.select().from(btcPrecos).where(eq(btcPrecos.data, ultimo.m)).all();
  const melhor = doDia.sort((a, b) => PRIORIDADE[b.origem] - PRIORIDADE[a.origem])[0];
  if (!melhor) return null;
  return { precoCentavos: melhor.precoCentavos, data: melhor.data, origem: melhor.origem };
}

function todosOsPrecos(banco: Banco): PrecoBtc[] {
  return banco.db
    .select({ data: btcPrecos.data, precoCentavos: btcPrecos.precoCentavos })
    .from(btcPrecos)
    .orderBy(asc(btcPrecos.data))
    .all();
}

/** Tudo que a seção de bitcoin mostra, lido de uma vez. */
export function painelBitcoin(banco: Banco): PainelBitcoin {
  const movimentos = listarMovimentos(banco);
  const preco = precoAtual(banco);
  return {
    posicao: calcularPosicao(movimentos as MovBtc[], preco?.precoCentavos ?? null),
    preco,
    movimentos,
    evolucao: calcularEvolucao(movimentos as MovBtc[], todosOsPrecos(banco)),
  };
}

/** Valor atual da posição em centavos (0 se ainda não há preço). */
export function valorBitcoinCentavos(banco: Banco): number {
  const preco = precoAtual(banco);
  const posicao = calcularPosicao(
    listarMovimentos(banco) as MovBtc[],
    preco?.precoCentavos ?? null,
  );
  return posicao.valorAtualCentavos ?? 0;
}

// ---------------------------------------------------------------- atualização automática

const CHAVE_AUTO_BTC = 'btc_preco_automatico';
const CHAVE_ULTIMA_BUSCA = 'btc_ultima_busca';

function valorDaConfig(db: Leitor, chave: string): unknown {
  return db.select().from(config).where(eq(config.chave, chave)).get()?.valor;
}

function gravarNaConfig(tx: Pick<Banco['db'], 'insert'>, chave: string, valor: unknown): void {
  tx.insert(config)
    .values({ chave, valor })
    .onConflictDoUpdate({ target: config.chave, set: { valor } })
    .run();
}

/** Se o preço do bitcoin é buscado sozinho a cada hora. Vem ligado (padrão). */
export function lerOpcaoPrecoAutomatico(banco: Banco): boolean {
  const v = valorDaConfig(banco.db, CHAVE_AUTO_BTC);
  return typeof v === 'boolean' ? v : true;
}

export function gravarOpcaoPrecoAutomatico(banco: Banco, ligado: boolean): boolean {
  if (typeof ligado !== 'boolean') {
    throw new ErroDeNegocio('Informe se a atualização automática fica ligada.', 'ativo');
  }
  banco.db.transaction((tx) => gravarNaConfig(tx, CHAVE_AUTO_BTC, ligado), IMEDIATA);
  return ligado;
}

/** ISO (UTC) da última busca automática que deu certo, ou `null` se ainda não houve. */
export function ultimaBuscaAutomatica(banco: Banco): string | null {
  const v = valorDaConfig(banco.db, CHAVE_ULTIMA_BUSCA);
  return typeof v === 'string' ? v : null;
}

export type ResultadoAtualizacaoAuto =
  | { feito: false; motivo: 'desligado' | 'sem-movimentos' | 'manual-hoje' }
  | { feito: true; ok: boolean; mensagem: string };

/**
 * Busca o preço sozinho, se a opção está ligada e há pelo menos um movimento de bitcoin fora da
 * lixeira. Sem movimentos não faz chamada alguma à internet. Quando a busca dá certo, grava a hora
 * em `btc_ultima_busca`. Nunca lança (a falha vem como `ok: false`).
 */
export async function atualizarPrecoSeLigado(
  banco: Banco,
  buscar: typeof fetch = fetch,
  agora: Date = new Date(),
): Promise<ResultadoAtualizacaoAuto> {
  if (!lerOpcaoPrecoAutomatico(banco)) return { feito: false, motivo: 'desligado' };
  if (listarMovimentos(banco).length === 0) return { feito: false, motivo: 'sem-movimentos' };
  // Preço informado à mão hoje vale o dia todo: nem chama a internet (e não conta como busca).
  const manualHoje = banco.db
    .select({ data: btcPrecos.data })
    .from(btcPrecos)
    .where(and(eq(btcPrecos.data, hoje(agora)), eq(btcPrecos.origem, 'manual')))
    .get();
  if (manualHoje) return { feito: false, motivo: 'manual-hoje' };
  const r = await buscarPrecoAutomatico(banco, buscar);
  if (r.ok) {
    banco.db.transaction(
      (tx) => gravarNaConfig(tx, CHAVE_ULTIMA_BUSCA, agora.toISOString()),
      IMEDIATA,
    );
  }
  return { feito: true, ok: r.ok, mensagem: r.mensagem };
}

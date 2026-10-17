/**
 * PIN opcional que protege o site. Sem PIN, o site fica livre (como antes).
 *
 * Guardado na tabela `config` (chave 'pin') como JSON:
 *   { hash, segredo, definidoEm }
 * - hash: scrypt no formato `scrypt$N$salt$hash` (hex, salt aleatório de 16 bytes);
 * - segredo: chave HMAC dos cookies de sessão (sessaoPin.ts). Trocar o PIN gera um segredo novo
 *   e assim derruba todas as sessões antigas.
 *
 * Tentativas erradas são contadas em memória: 5 erros bloqueiam por 30 s, e cada novo bloqueio
 * dobra o tempo (até 15 min). Durante o bloqueio nem o PIN é conferido. Um acerto zera tudo.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Banco } from '../db/conexao.ts';
import { config } from '../db/esquema.ts';
import { ErroDeNegocio } from './erros.ts';

const CHAVE = 'pin';
const PIN_REGEX = /^\d{4,12}$/;
const MSG_FORMATO = 'O PIN precisa ter de 4 a 12 números';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const TAMANHO_HASH = 64;
const TAMANHO_SALT = 16;

const LIMITE_ERROS = 5;
const BLOQUEIO_BASE_MS = 30_000;
const BLOQUEIO_MAX_MS = 15 * 60_000;

interface ConfigPin {
  hash: string;
  segredo: string;
  definidoEm: string;
}

// ---------------------------------------------------------------- hash (scrypt)

/** Hash guardável do PIN: `scrypt$N$salt$hash`, tudo em hex. */
export function gerarHashPin(pin: string): string {
  const salt = randomBytes(TAMANHO_SALT);
  const hash = scryptSync(pin, salt, TAMANHO_HASH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

const HEX = /^(?:[0-9a-f]{2})+$/;

/** Confere o PIN contra o hash guardado. Formato inválido = falso (nunca lança). */
export function conferirHashPin(pin: string, armazenado: string): boolean {
  const [prefixo, nTexto = '', saltHex = '', hashHex = ''] = armazenado.split('$');
  if (armazenado.split('$').length !== 4 || prefixo !== 'scrypt') return false;
  const N = Number(nTexto);
  if (!Number.isInteger(N) || N < 2 || N > 2 ** 20 || (N & (N - 1)) !== 0) return false;
  if (!HEX.test(saltHex) || !HEX.test(hashHex)) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const esperado = Buffer.from(hashHex, 'hex');
  const obtido = scryptSync(pin, salt, esperado.length, {
    N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return timingSafeEqual(obtido, esperado);
}

// ---------------------------------------------------------------- leitura e escrita

function lerConfigPin(banco: Banco): ConfigPin | null {
  const linha = banco.db.select().from(config).where(eq(config.chave, CHAVE)).get();
  if (!linha) return null;
  const v = (linha.valor ?? {}) as Partial<ConfigPin>;
  return {
    hash: typeof v.hash === 'string' ? v.hash : '',
    segredo: typeof v.segredo === 'string' ? v.segredo : '',
    definidoEm: typeof v.definidoEm === 'string' ? v.definidoEm : '',
  };
}

function gravarConfigPin(banco: Banco, valor: ConfigPin): void {
  banco.db
    .insert(config)
    .values({ chave: CHAVE, valor })
    .onConflictDoUpdate({ target: config.chave, set: { valor } })
    .run();
}

/** Há PIN definido? (Uma linha existente conta como definido, mesmo malformada: falha fechada.) */
export function pinAtivo(banco: Banco): boolean {
  return (
    banco.db.select({ chave: config.chave }).from(config).where(eq(config.chave, CHAVE)).get() !==
    undefined
  );
}

/** Segredo dos cookies, ou `null` se não há PIN. Usado por sessaoPin.ts. */
export function segredoDoPin(banco: Banco): string | null {
  const cfg = lerConfigPin(banco);
  return cfg && cfg.segredo ? cfg.segredo : null;
}

function validarFormatoPin(pin: string, campo: string): void {
  if (typeof pin !== 'string' || !PIN_REGEX.test(pin)) throw new ErroDeNegocio(MSG_FORMATO, campo);
}

// ---------------------------------------------------------------- limite de tentativas (memória)

let erros = 0;
let bloqueios = 0;
let bloqueadoAte = 0;

/** Zera o contador de tentativas (uso exclusivo dos testes). */
export function reiniciarTentativasPin(): void {
  erros = 0;
  bloqueios = 0;
  bloqueadoAte = 0;
}

function bloqueioEm(agoraMs: number): number | null {
  return agoraMs < bloqueadoAte ? bloqueadoAte : null;
}

function registrarErro(agoraMs: number): void {
  erros++;
  if (erros < LIMITE_ERROS) return;
  erros = 0;
  bloqueios++;
  const duracao = Math.min(BLOQUEIO_BASE_MS * 2 ** (bloqueios - 1), BLOQUEIO_MAX_MS);
  bloqueadoAte = agoraMs + duracao;
}

/**
 * Confere o PIN respeitando o limite. Ok: zera os contadores. Erro: conta, e se bloqueou devolve
 * até quando (ms desde a época). Durante o bloqueio não compara nada.
 */
function conferirComLimite(
  banco: Banco,
  pin: string,
  agora: Date,
): { ok: true } | { ok: false; bloqueadoAteMs: number | null } {
  const agoraMs = agora.getTime();
  const bloqueado = bloqueioEm(agoraMs);
  if (bloqueado !== null) return { ok: false, bloqueadoAteMs: bloqueado };
  const cfg = lerConfigPin(banco);
  if (!cfg) throw new ErroDeNegocio('Não há PIN definido.');
  if (cfg.hash && conferirHashPin(pin, cfg.hash)) {
    reiniciarTentativasPin();
    return { ok: true };
  }
  registrarErro(agoraMs);
  return { ok: false, bloqueadoAteMs: bloqueioEm(agoraMs) };
}

function exigirPinAtual(banco: Banco, pinAtual: string | undefined, agora: Date): void {
  if (!pinAtual) throw new ErroDeNegocio('Informe o PIN atual.', 'atual');
  const r = conferirComLimite(banco, pinAtual, agora);
  if (r.ok) return;
  if (r.bloqueadoAteMs !== null) {
    const seg = Math.max(1, Math.ceil((r.bloqueadoAteMs - agora.getTime()) / 1000));
    throw new ErroDeNegocio(`Muitas tentativas. Tente de novo em ${seg} s.`, 'atual');
  }
  throw new ErroDeNegocio('PIN atual incorreto.', 'atual');
}

// ---------------------------------------------------------------- API

/**
 * Confere o PIN digitado. Com limite de tentativas: durante um bloqueio devolve
 * `bloqueadoAteMs` (época em ms) e nem confere o PIN.
 */
export function verificarPin(
  banco: Banco,
  pin: string,
  agora: Date = new Date(),
): { ok: true } | { ok: false; bloqueadoAteMs: number | null } {
  if (!pinAtivo(banco)) throw new ErroDeNegocio('Não há PIN definido.');
  return conferirComLimite(banco, pin, agora);
}

/**
 * Define (ou troca) o PIN. Se já há um PIN, exige o atual. Sempre gera um segredo novo, o que
 * derruba as sessões anteriores. Quem chama deve emitir um cookie novo para a sessão atual.
 */
export function definirPin(
  banco: Banco,
  pin: string,
  pinAtual?: string,
  agora: Date = new Date(),
): void {
  validarFormatoPin(pin, 'pin');
  banco.sqlite
    .transaction(() => {
      if (pinAtivo(banco)) exigirPinAtual(banco, pinAtual, agora);
      gravarConfigPin(banco, {
        hash: gerarHashPin(pin),
        segredo: randomBytes(32).toString('hex'),
        definidoEm: agora.toISOString(),
      });
    })
    .immediate();
}

/** Remove o PIN (exige o atual). O site volta a ficar livre. */
export function removerPin(banco: Banco, pinAtual?: string, agora: Date = new Date()): void {
  banco.sqlite
    .transaction(() => {
      if (!pinAtivo(banco)) throw new ErroDeNegocio('Não há PIN para remover.');
      exigirPinAtual(banco, pinAtual, agora);
      banco.db.delete(config).where(eq(config.chave, CHAVE)).run();
    })
    .immediate();
}

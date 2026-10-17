/**
 * Cookie de sessão do PIN. O valor é `v1.<expiraEmMs>.<hmac-sha256 hex>`, assinado com o
 * segredo guardado junto do PIN (servicos/pin.ts). A expiração entra na assinatura, então não
 * dá para estendê-la editando o cookie. Trocar ou remover o PIN invalida todos os cookies.
 *
 * Cookie httpOnly e SameSite=Strict. Com "manter conectado" dura 30 dias; sem ele, 12 horas
 * (o cookie de sessão some ao fechar o navegador, e a assinatura também expira em 12 horas).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Banco } from './db/conexao.ts';
import { ErroDeNegocio } from './servicos/erros.ts';
import { segredoDoPin } from './servicos/pin.ts';

export const NOME_COOKIE = 'cf_sessao';

const VERSAO = 'v1';
const MS_12_HORAS = 12 * 60 * 60 * 1000;
const MS_30_DIAS = 30 * 24 * 60 * 60 * 1000;
const MAX_TAMANHO_VALOR = 200;

export interface CookieSessao {
  nome: typeof NOME_COOKIE;
  valor: string;
  opcoes: {
    httpOnly: true;
    sameSite: 'strict';
    path: '/';
    maxAge?: number;
  };
}

function assinatura(segredo: string, expiraEmMs: number): string {
  return createHmac('sha256', segredo).update(`${VERSAO}.${expiraEmMs}`).digest('hex');
}

/** Cookie novo para quem acabou de digitar o PIN certo. */
export function criarCookie(
  banco: Banco,
  { lembrar, agora = new Date() }: { lembrar: boolean; agora?: Date },
): CookieSessao {
  const segredo = segredoDoPin(banco);
  if (!segredo) throw new ErroDeNegocio('Defina um PIN antes de entrar.');
  const expiraEmMs = agora.getTime() + (lembrar ? MS_30_DIAS : MS_12_HORAS);
  const valor = `${VERSAO}.${expiraEmMs}.${assinatura(segredo, expiraEmMs)}`;
  return {
    nome: NOME_COOKIE,
    valor,
    opcoes: {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      ...(lembrar ? { maxAge: MS_30_DIAS / 1000 } : {}),
    },
  };
}

/** Formato, assinatura (comparação em tempo constante) e expiração. Qualquer falha = false. */
export function cookieValido(
  banco: Banco,
  valor: string | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (typeof valor !== 'string' || valor.length > MAX_TAMANHO_VALOR) return false;
  const [versao, expiraTexto = '', assinaturaRecebida = ''] = valor.split('.');
  if (valor.split('.').length !== 3 || versao !== VERSAO) return false;
  if (!/^\d{1,15}$/.test(expiraTexto) || !/^[0-9a-f]{64}$/.test(assinaturaRecebida)) return false;
  const segredo = segredoDoPin(banco);
  if (!segredo) return false;

  const expiraEmMs = Number(expiraTexto);
  const esperada = Buffer.from(assinatura(segredo, expiraEmMs), 'hex');
  const recebida = Buffer.from(assinaturaRecebida, 'hex');
  if (!timingSafeEqual(esperada, recebida)) return false;
  return expiraEmMs > agora.getTime();
}

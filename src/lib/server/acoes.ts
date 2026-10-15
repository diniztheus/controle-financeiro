/**
 * Ajuda para as form actions: valida o FormData com Zod e transforma erros em respostas
 * `fail()` com uma forma única, que as páginas sabem mostrar:
 *
 *   { acao, erro?, erros?, valores? }
 *
 * - `acao`: qual formulário respondeu (uma página pode ter vários);
 * - `erro`: mensagem geral; `erros`: mensagem por campo;
 * - `valores`: o que foi digitado, para não perder o texto quando algo falha.
 */
import { fail, isActionFailure, type ActionFailure } from '@sveltejs/kit';
import type { z } from 'zod';
import { errosPorCampo, lerForm } from '../validacao/nucleo.ts';
import { ErroDeNegocio } from './servicos/erros.ts';

export interface RespostaErro {
  acao: string;
  /** Id do item a que o formulário se refere (listas com um formulário por linha). */
  id?: string;
  erro?: string;
  erros?: Record<string, string>;
  valores?: Record<string, string>;
}

export type Falha = ActionFailure<RespostaErro>;

type Validado<T> =
  { ok: true; dados: T; valores: Record<string, string> } | { ok: false; falha: Falha };

export async function validar<S extends z.ZodType>(
  request: Request,
  esquema: S,
  acao: string,
): Promise<Validado<z.output<S>>> {
  const valores = lerForm(await request.formData());
  const r = esquema.safeParse(valores);
  if (r.success) return { ok: true, dados: r.data, valores };
  return {
    ok: false,
    falha: fail(400, { acao, id: valores.id, erros: errosPorCampo(r.error), valores }),
  };
}

/** Roda o caso de uso; erro de regra vira mensagem, erro inesperado vai para o log. */
export function executar<T>(
  acao: string,
  fn: () => T,
  extra: { id?: string; valores?: Record<string, string> } = {},
): T | Falha {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ErroDeNegocio) {
      return fail(400, {
        acao,
        ...extra,
        ...(e.campo ? { erros: { [e.campo]: e.message } } : { erro: e.message }),
      });
    }
    console.error(`[${acao}]`, e);
    return fail(500, { acao, ...extra, erro: 'Não foi possível salvar. Tente de novo.' });
  }
}

/** Lê um campo de texto simples do FormData (ids de botões, direção…). */
export function campo(fd: FormData, nome: string): string {
  const v = fd.get(nome);
  return typeof v === 'string' ? v : '';
}

/** O caso de uso falhou? (estreita o tipo de {@link executar}). */
export function falhou<T>(r: T | Falha): r is Falha {
  return isActionFailure(r);
}

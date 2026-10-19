import { fail, type ActionFailure } from '@sveltejs/kit';
import { campo, executar, validar, type RespostaErro } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { acessoRedeLigado } from '$lib/server/seguranca';
import { gravarOpcaoPrecoAutomatico, lerOpcaoPrecoAutomatico } from '$lib/server/servicos/bitcoin';
import { lerLembreteSaldoDias, salvarLembreteSaldoDias } from '$lib/server/servicos/lembretes';
import { definirPin, pinAtivo, removerPin } from '$lib/server/servicos/pin';
import { ErroDeNegocio } from '$lib/server/servicos/erros';
import { criarCookie, NOME_COOKIE } from '$lib/server/sessaoPin';
import { lembreteForm, pinForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';
import type { Cookies } from '@sveltejs/kit';

/** Nomes que o serviço de PIN usa e os nomes dos campos deste formulário. */
const CAMPO_DO_FORM: Record<string, string> = { pin: 'novo', atual: 'atual' };

function falhaDoPin(acao: string, e: unknown): ActionFailure<RespostaErro> {
  if (e instanceof ErroDeNegocio) {
    const campo = e.campo ? (CAMPO_DO_FORM[e.campo] ?? e.campo) : undefined;
    return fail(400, {
      acao,
      ...(campo ? { erros: { [campo]: e.message } } : { erro: e.message }),
    });
  }
  console.error(`[${acao}]`, e);
  return fail(500, { acao, erro: 'Não foi possível salvar. Tente de novo.' });
}

/** Depois de trocar o PIN o segredo muda e as sessões antigas caem: esta aba ganha um cookie novo. */
function renovarSessao(cookies: Cookies): void {
  const cookie = criarCookie(obterBanco(), { lembrar: false });
  cookies.set(cookie.nome, cookie.valor, cookie.opcoes);
}

export const load: PageServerLoad = () => {
  const banco = obterBanco();
  return {
    pinAtivo: pinAtivo(banco),
    acessoRede: acessoRedeLigado(),
    lembreteSaldoDias: lerLembreteSaldoDias(banco),
    precoAutomatico: lerOpcaoPrecoAutomatico(banco),
  };
};

export const actions: Actions = {
  lembrete: async ({ request }) => {
    const v = await validar(request, lembreteForm, 'lembrete');
    if (!v.ok) return v.falha;
    return executar(
      'lembrete',
      () => {
        const dias = salvarLembreteSaldoDias(obterBanco(), v.dados.dias);
        return {
          acao: 'lembrete',
          ok: dias === 0 ? 'Aviso de saldos desligado.' : 'Lembrete de saldos salvo.',
        };
      },
      { valores: v.valores },
    );
  },
  bitcoin: async ({ request }) => {
    const ligado = campo(await request.formData(), 'ativo') === 'on';
    return executar('bitcoin', () => {
      gravarOpcaoPrecoAutomatico(obterBanco(), ligado);
      return {
        acao: 'bitcoin',
        ok: ligado
          ? 'Preço do bitcoin será atualizado sozinho, a cada hora.'
          : 'Atualização automática do bitcoin desligada.',
      };
    });
  },
  definir: async ({ request, cookies }) => {
    const banco = obterBanco();
    const v = await validar(request, pinForm, 'definir');
    if (!v.ok) return v.falha;
    if (pinAtivo(banco))
      return fail(400, { acao: 'definir', erro: 'Já há um PIN. Use Alterar PIN.' });
    const novo = v.dados.novo ?? '';
    const confirmar = v.valores.confirmar ?? '';
    if (!novo) return fail(400, { acao: 'definir', erros: { novo: 'Digite o novo PIN' } });
    if (novo !== confirmar) {
      return fail(400, { acao: 'definir', erros: { confirmar: 'Os PINs não conferem' } });
    }
    try {
      definirPin(banco, novo);
    } catch (e) {
      return falhaDoPin('definir', e);
    }
    renovarSessao(cookies);
    return { acao: 'definir', ok: 'PIN definido. Esta sessão continua conectada.' };
  },
  alterar: async ({ request, cookies }) => {
    const banco = obterBanco();
    const v = await validar(request, pinForm, 'alterar');
    if (!v.ok) return v.falha;
    const atual = v.dados.atual ?? '';
    const novo = v.dados.novo ?? '';
    const confirmar = v.valores.confirmar ?? '';
    if (!atual) return fail(400, { acao: 'alterar', erros: { atual: 'Digite o PIN atual' } });
    if (!novo) return fail(400, { acao: 'alterar', erros: { novo: 'Digite o novo PIN' } });
    if (novo !== confirmar) {
      return fail(400, { acao: 'alterar', erros: { confirmar: 'Os PINs não conferem' } });
    }
    try {
      definirPin(banco, novo, atual);
    } catch (e) {
      return falhaDoPin('alterar', e);
    }
    renovarSessao(cookies);
    return { acao: 'alterar', ok: 'PIN alterado. Esta sessão continua conectada.' };
  },
  remover: async ({ request, cookies }) => {
    const v = await validar(request, pinForm, 'remover');
    if (!v.ok) return v.falha;
    const atual = v.dados.atual ?? '';
    if (!atual) return fail(400, { acao: 'remover', erros: { atual: 'Digite o PIN atual' } });
    try {
      removerPin(obterBanco(), atual);
    } catch (e) {
      return falhaDoPin('remover', e);
    }
    cookies.delete(NOME_COOKIE, { path: '/' });
    return {
      acao: 'remover',
      ok: 'PIN removido. O site volta a abrir sem senha neste computador.',
    };
  },
};

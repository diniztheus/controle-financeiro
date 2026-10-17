import { fail, redirect } from '@sveltejs/kit';
import { campo, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { ehDestinoSeguro } from '$lib/server/seguranca';
import { pinAtivo, verificarPin } from '$lib/server/servicos/pin';
import { criarCookie, NOME_COOKIE } from '$lib/server/sessaoPin';
import { pinForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

/** Destino depois do login: só caminho relativo seguro; qualquer outra coisa vira "/". */
function destino(valor: string | null | undefined): string {
  return ehDestinoSeguro(valor) ? (valor as string) : '/';
}

/** Sem PIN ativo não há o que digitar: a tela de PIN só existe quando o site está protegido. */
export const load: PageServerLoad = ({ url }) => {
  if (!pinAtivo(obterBanco())) redirect(303, '/');
  return { voltar: destino(url.searchParams.get('voltar')) };
};

export const actions: Actions = {
  entrar: async ({ request, cookies }) => {
    const banco = obterBanco();
    if (!pinAtivo(banco)) redirect(303, '/');
    // O destino vem num campo oculto (o `?/entrar` da action apaga a busca da URL).
    const voltar = destino(campo(await request.clone().formData(), 'voltar'));
    const v = await validar(request, pinForm, 'entrar');
    // Em toda falha o destino volta junto: a página refeita não tem `voltar` na URL.
    if (!v.ok) return fail(400, { ...v.falha.data, voltar });
    if (!v.dados.pin) {
      return fail(400, { acao: 'entrar', erros: { pin: 'Digite o PIN' }, voltar });
    }

    const tentativa = verificarPin(banco, v.dados.pin);
    if (!tentativa.ok) {
      if (tentativa.bloqueadoAteMs !== null) {
        const segundos = Math.max(1, Math.ceil((tentativa.bloqueadoAteMs - Date.now()) / 1000));
        return fail(429, {
          acao: 'entrar',
          erro: `Muitas tentativas. Tente de novo em ${segundos} s`,
          voltar,
        });
      }
      return fail(400, { acao: 'entrar', erro: 'PIN incorreto', voltar });
    }

    const cookie = criarCookie(banco, { lembrar: v.dados.lembrar });
    cookies.set(cookie.nome, cookie.valor, cookie.opcoes);
    redirect(303, voltar);
  },
  sair: ({ cookies }) => {
    cookies.delete(NOME_COOKIE, { path: '/' });
    redirect(303, '/pin');
  },
};

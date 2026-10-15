import { hoje } from '$lib/dominio/datas';
import { executar, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { garantirCategoriasPadrao } from '$lib/server/servicos/categorias';
import { definirLimitePadrao } from '$lib/server/servicos/limite';
import { montarPainel } from '$lib/server/servicos/painel';
import { mesDaUrl } from '$lib/ui/formato';
import { limiteForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const banco = obterBanco();
  garantirCategoriasPadrao(banco);
  const agora = new Date();
  return { painel: montarPainel(banco, mesDaUrl(url, agora), hoje(agora)) };
};

export const actions: Actions = {
  limite: async ({ request }) => {
    const v = await validar(request, limiteForm, 'limite');
    if (!v.ok) return v.falha;
    return executar('limite', () => {
      definirLimitePadrao(obterBanco(), v.dados.valor);
      return { acao: 'limite', ok: v.dados.valor > 0 ? 'Limite salvo.' : 'Limite removido.' };
    });
  },
};

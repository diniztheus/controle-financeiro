import { executar, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { criarMeta, listarMetas, totalGuardadoMetas } from '$lib/server/servicos/metas';
import { metaForm } from '$lib/validacao/nucleo';
import { proximaCor } from '$lib/dominio/categorias';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  const banco = obterBanco();
  const metas = listarMetas(banco);
  return {
    metas,
    totalGuardado: totalGuardadoMetas(banco),
    /** Cor sugerida para a próxima meta: a menos usada entre as atuais. */
    corSugerida: proximaCor(metas.map((m) => m.cor ?? '')),
  };
};

export const actions: Actions = {
  criar: async ({ request }) => {
    const v = await validar(request, metaForm, 'criar');
    if (!v.ok) return v.falha;
    return executar(
      'criar',
      () => {
        const m = criarMeta(obterBanco(), v.dados);
        return { acao: 'criar', ok: `Meta "${m.nome}" criada.` };
      },
      { valores: v.valores },
    );
  },
};

import { campo, executar, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import {
  aPagarCartoes,
  arquivarCartao,
  criarCartao,
  desarquivarCartao,
  listarCartoes,
} from '$lib/server/servicos/cartoes';
import { cartaoForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  const banco = obterBanco();
  const todos = listarCartoes(banco, { incluirArquivados: true });
  return {
    cartoes: todos.filter((c) => c.ativo),
    arquivados: todos.filter((c) => !c.ativo),
    aPagarTotal: aPagarCartoes(banco),
  };
};

export const actions: Actions = {
  criar: async ({ request }) => {
    const v = await validar(request, cartaoForm, 'criar');
    if (!v.ok) return v.falha;
    return executar(
      'criar',
      () => {
        const c = criarCartao(obterBanco(), v.dados);
        return { acao: 'criar', ok: `Cartão "${c.nome}" cadastrado.` };
      },
      { valores: v.valores },
    );
  },
  arquivar: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    return executar(
      'arquivar',
      () => {
        arquivarCartao(obterBanco(), id);
        return { acao: 'arquivar', id, ok: 'Cartão arquivado. O histórico fica guardado.' };
      },
      { id },
    );
  },
  desarquivar: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    return executar(
      'desarquivar',
      () => {
        desarquivarCartao(obterBanco(), id);
        return { acao: 'desarquivar', id, ok: 'Cartão de volta às listas.' };
      },
      { id },
    );
  },
};

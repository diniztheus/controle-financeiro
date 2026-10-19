import { error, redirect } from '@sveltejs/kit';
import { executar, falhou, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import {
  aPagarDoCartao,
  arquivarCartao,
  desarquivarCartao,
  editarCartao,
  listarCartoes,
  listarFaturasDoCartao,
  obterCartao,
  removerCartao,
} from '$lib/server/servicos/cartoes';
import { cartaoForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  const banco = obterBanco();
  const cartao = obterCartao(banco, params.id);
  if (!cartao || cartao.removidoEm) error(404, 'Este cartão não existe ou está na lixeira.');
  return {
    cartao,
    aPagar: aPagarDoCartao(banco, cartao.id),
    faturaAtual: listarCartoes(banco, { incluirArquivados: true }).find((x) => x.id === cartao.id)!
      .faturaAtual,
    faturas: listarFaturasDoCartao(banco, cartao.id),
  };
};

export const actions: Actions = {
  salvar: async ({ request, params }) => {
    const v = await validar(request, cartaoForm, 'salvar');
    if (!v.ok) return v.falha;
    const r = executar('salvar', () => editarCartao(obterBanco(), params.id, v.dados), {
      valores: v.valores,
    });
    if (falhou(r)) return r;
    return { acao: 'salvar', ok: 'Cartão salvo.' };
  },
  arquivar: ({ params }) => {
    const r = executar('arquivar', () => arquivarCartao(obterBanco(), params.id));
    if (falhou(r)) return r;
    return { acao: 'arquivar', ok: 'Cartão arquivado. O histórico fica guardado.' };
  },
  desarquivar: ({ params }) => {
    const r = executar('desarquivar', () => desarquivarCartao(obterBanco(), params.id));
    if (falhou(r)) return r;
    return { acao: 'desarquivar', ok: 'Cartão de volta às listas.' };
  },
  remover: ({ params }) => {
    const r = executar('remover', () => removerCartao(obterBanco(), params.id));
    if (falhou(r)) return r;
    redirect(303, '/cartoes');
  },
};

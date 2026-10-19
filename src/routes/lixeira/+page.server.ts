import { campo, executar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { cartoesNaLixeira, restaurarCartao } from '$lib/server/servicos/cartoes';
import { contasNaLixeira, restaurarConta } from '$lib/server/servicos/contas';
import { gastosNaLixeira, restaurarGasto } from '$lib/server/servicos/gastos';
import { metasNaLixeira, restaurarMeta } from '$lib/server/servicos/metas';
import { receitasNaLixeira, restaurarReceita } from '$lib/server/servicos/receitas';
import { recorrentesNaLixeira, restaurarRecorrente } from '$lib/server/servicos/recorrentes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  const banco = obterBanco();
  return {
    gastos: gastosNaLixeira(banco),
    receitas: receitasNaLixeira(banco),
    recorrentes: recorrentesNaLixeira(banco),
    contas: contasNaLixeira(banco),
    cartoes: cartoesNaLixeira(banco),
    metas: metasNaLixeira(banco),
  };
};

export const actions: Actions = {
  gasto: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    return executar(
      'gasto',
      () => {
        restaurarGasto(obterBanco(), id);
        return { acao: 'gasto', id, ok: 'Gasto restaurado.' };
      },
      { id },
    );
  },
  receita: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    return executar(
      'receita',
      () => {
        restaurarReceita(obterBanco(), id);
        return { acao: 'receita', id, ok: 'Receita restaurada.' };
      },
      { id },
    );
  },
  recorrente: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    return executar(
      'recorrente',
      () => {
        restaurarRecorrente(obterBanco(), id);
        return { acao: 'recorrente', id, ok: 'Receita recorrente restaurada.' };
      },
      { id },
    );
  },
  conta: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    return executar(
      'conta',
      () => {
        const c = restaurarConta(obterBanco(), id);
        return { acao: 'conta', id, ok: `Conta "${c.nome}" restaurada.` };
      },
      { id },
    );
  },
  cartao: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    return executar(
      'cartao',
      () => {
        const c = restaurarCartao(obterBanco(), id);
        return { acao: 'cartao', id, ok: `Cartão "${c.nome}" restaurado.` };
      },
      { id },
    );
  },
  meta: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    return executar(
      'meta',
      () => {
        const m = restaurarMeta(obterBanco(), id);
        return { acao: 'meta', id, ok: `Meta "${m.nome}" restaurada.` };
      },
      { id },
    );
  },
};

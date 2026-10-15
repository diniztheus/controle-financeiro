import { campo, executar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { contasNaLixeira, restaurarConta } from '$lib/server/servicos/contas';
import { gastosNaLixeira, restaurarGasto } from '$lib/server/servicos/gastos';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  const banco = obterBanco();
  return { gastos: gastosNaLixeira(banco), contas: contasNaLixeira(banco) };
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
};

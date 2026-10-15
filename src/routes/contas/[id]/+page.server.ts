import { error, redirect } from '@sveltejs/kit';
import { executar, falhou, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import {
  editarConta,
  historicoDeSaldos,
  obterConta,
  removerConta,
} from '$lib/server/servicos/contas';
import { contaForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  const banco = obterBanco();
  const conta = obterConta(banco, params.id);
  if (!conta || conta.removidoEm) error(404, 'Esta conta não existe ou está na lixeira.');
  return { conta, historico: historicoDeSaldos(banco, conta.id) };
};

export const actions: Actions = {
  salvar: async ({ request, params }) => {
    const v = await validar(request, contaForm, 'salvar');
    if (!v.ok) return v.falha;
    const r = executar(
      'salvar',
      () =>
        editarConta(obterBanco(), params.id, {
          nome: v.dados.nome,
          tipo: v.dados.tipo,
          saldoCentavos: v.dados.saldo,
        }),
      { valores: v.valores },
    );
    if (falhou(r)) return r;
    return { acao: 'salvar', ok: 'Conta salva.' };
  },
  remover: ({ params }) => {
    const r = executar('remover', () => removerConta(obterBanco(), params.id));
    if (falhou(r)) return r;
    redirect(303, '/contas');
  },
};

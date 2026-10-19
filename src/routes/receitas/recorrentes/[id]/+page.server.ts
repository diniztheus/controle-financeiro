import { error, redirect } from '@sveltejs/kit';
import { CATEGORIAS_RECEITA } from '$lib/dominio/receitas';
import { executar, falhou, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { listarContas, obterConta } from '$lib/server/servicos/contas';
import {
  editarRecorrente,
  obterRecorrente,
  removerRecorrente,
} from '$lib/server/servicos/recorrentes';
import { receitaRecorrenteForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  const banco = obterBanco();
  const r = obterRecorrente(banco, params.id);
  if (!r || r.removidoEm) error(404, 'Este modelo não existe ou está na lixeira.');

  // A conta atual entra nas opções mesmo se estiver na lixeira.
  const contas = listarContas(banco).map((c) => ({ id: c.id, nome: c.nome }));
  const conta = r.contaId ? obterConta(banco, r.contaId) : undefined;
  if (conta && !contas.some((c) => c.id === conta.id)) {
    contas.push({ id: conta.id, nome: `${conta.nome} (na lixeira)` });
  }

  return {
    recorrente: r,
    categorias: CATEGORIAS_RECEITA,
    contas,
  };
};

export const actions: Actions = {
  salvar: async ({ request, params }) => {
    const v = await validar(request, receitaRecorrenteForm, 'salvar');
    if (!v.ok) return v.falha;
    const d = v.dados;
    const r = executar(
      'salvar',
      () =>
        editarRecorrente(obterBanco(), params.id, {
          valorCentavos: d.valorCentavos,
          categoria: d.categoria,
          diaDoMes: d.diaDoMes,
          inicio: d.inicio,
          fim: d.fim,
          descricao: d.descricao,
          contaId: d.contaId,
          observacao: d.observacao,
        }),
      { valores: v.valores },
    );
    if (falhou(r)) return r;
    redirect(303, '/receitas?aviso=recorrente-editada#recorrentes');
  },
  remover: ({ params }) => {
    const r = executar('remover', () => removerRecorrente(obterBanco(), params.id));
    if (falhou(r)) return r;
    redirect(303, '/receitas?aviso=recorrente-removida#recorrentes');
  },
};

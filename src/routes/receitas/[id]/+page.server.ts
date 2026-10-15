import { error, redirect } from '@sveltejs/kit';
import { mesDe } from '$lib/dominio/datas';
import { CATEGORIAS_RECEITA } from '$lib/dominio/receitas';
import { executar, falhou, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { listarContas, obterConta } from '$lib/server/servicos/contas';
import {
  confirmarRecebimento,
  editarReceita,
  obterReceita,
  removerReceita,
} from '$lib/server/servicos/receitas';
import { confirmarRecebimentoForm, receitaForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  const banco = obterBanco();
  const r = obterReceita(banco, params.id);
  if (!r || r.removidoEm) error(404, 'Esta receita não existe ou está na lixeira.');

  // A conta atual entra nas opções mesmo se estiver na lixeira.
  const contas = listarContas(banco).map((c) => ({ id: c.id, nome: c.nome }));
  const conta = r.contaId ? obterConta(banco, r.contaId) : undefined;
  if (conta && !contas.some((c) => c.id === conta.id)) {
    contas.push({ id: conta.id, nome: `${conta.nome} (na lixeira)` });
  }

  return {
    receita: r,
    /** Gerada por recorrente e ainda não confirmada: não entra nos totais. */
    previsto: r.confirmadaEm === null,
    categorias: CATEGORIAS_RECEITA,
    contas,
  };
};

export const actions: Actions = {
  /** "Recebi" para uma prevista: valor e data reais (vêm preenchidos com os previstos). */
  confirmar: async ({ request, params }) => {
    const v = await validar(request, confirmarRecebimentoForm, 'confirmar');
    if (!v.ok) return v.falha;
    const r = executar('confirmar', () => confirmarRecebimento(obterBanco(), params.id, v.dados), {
      valores: v.valores,
    });
    if (falhou(r)) return r;
    redirect(303, `/receitas?mes=${mesDe(r.data)}&aviso=confirmada`);
  },
  salvar: async ({ request, params }) => {
    const v = await validar(request, receitaForm, 'salvar');
    if (!v.ok) return v.falha;
    const d = v.dados;
    const r = executar(
      'salvar',
      () =>
        editarReceita(obterBanco(), params.id, {
          valorCentavos: d.valorCentavos,
          data: d.data,
          categoria: d.categoria,
          descricao: d.descricao,
          contaId: d.contaId,
          observacao: d.observacao,
        }),
      { valores: v.valores },
    );
    if (falhou(r)) return r;
    redirect(303, `/receitas?mes=${mesDe(d.data)}`);
  },
  remover: ({ params }) => {
    const r = executar('remover', () => removerReceita(obterBanco(), params.id));
    if (falhou(r)) return r;
    redirect(303, `/receitas?mes=${mesDe(r.data)}&removido=${r.id}`);
  },
};

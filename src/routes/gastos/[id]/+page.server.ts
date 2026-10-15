import { error, redirect } from '@sveltejs/kit';
import { mesDe } from '$lib/dominio/datas';
import { executar, falhou, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { listarCategorias, obterCategoria } from '$lib/server/servicos/categorias';
import { listarContas, obterConta } from '$lib/server/servicos/contas';
import { editarGasto, obterGasto, removerGasto } from '$lib/server/servicos/gastos';
import { nomeDoCartao } from '$lib/server/servicos/cartoes';
import { gastoForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  const banco = obterBanco();
  const g = obterGasto(banco, params.id);
  if (!g || g.removidoEm) error(404, 'Este gasto não existe ou está na lixeira.');

  // Categoria e conta atuais entram nas opções mesmo arquivada / na lixeira.
  const categorias = listarCategorias(banco).map((c) => ({ id: c.id, nome: c.nome, cor: c.cor }));
  const cat = obterCategoria(banco, g.categoriaId);
  if (cat && !categorias.some((c) => c.id === cat.id)) {
    categorias.push({ id: cat.id, nome: `${cat.nome} (arquivada)`, cor: cat.cor });
  }
  const contas = listarContas(banco).map((c) => ({ id: c.id, nome: c.nome }));
  const conta = g.contaId ? obterConta(banco, g.contaId) : undefined;
  if (conta && !contas.some((c) => c.id === conta.id)) {
    contas.push({ id: conta.id, nome: `${conta.nome} (na lixeira)` });
  }

  return {
    gasto: g,
    editavel: g.meio === 'conta' && g.numParcelas === 1,
    cartaoNome: g.cartaoId ? nomeDoCartao(banco, g.cartaoId) : null,
    categoriaNome: cat?.nome ?? '—',
    categorias,
    contas,
  };
};

export const actions: Actions = {
  salvar: async ({ request, params }) => {
    const v = await validar(request, gastoForm, 'salvar');
    if (!v.ok) return v.falha;
    const d = v.dados;
    const r = executar(
      'salvar',
      () =>
        editarGasto(obterBanco(), params.id, {
          valorCentavos: d.valor,
          descricao: d.descricao,
          categoriaId: d.categoriaId,
          data: d.data,
          contaId: d.contaId,
        }),
      { valores: v.valores },
    );
    if (falhou(r)) return r;
    redirect(303, `/gastos?mes=${mesDe(d.data)}`);
  },
  remover: ({ params }) => {
    const r = executar('remover', () => removerGasto(obterBanco(), params.id));
    if (falhou(r)) return r;
    redirect(303, `/gastos?mes=${mesDe(r.dataCompra)}&removido=${r.id}`);
  },
};

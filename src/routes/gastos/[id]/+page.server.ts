import { error, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { mesDe } from '$lib/dominio/datas';
import { executar, falhou, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { faturas, parcelas } from '$lib/server/db/esquema';
import { listarCategorias, obterCategoria } from '$lib/server/servicos/categorias';
import { listarContas, obterConta } from '$lib/server/servicos/contas';
import { editarGasto, obterGasto, removerGasto } from '$lib/server/servicos/gastos';
import { listarCartoes, obterCartao } from '$lib/server/servicos/cartoes';
import { comCamposDoFormulario, dadosDoGasto } from '$lib/server/formularioGasto';
import { gastoForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  const banco = obterBanco();
  const g = obterGasto(banco, params.id);
  if (!g || g.removidoEm) error(404, 'Este gasto não existe ou está na lixeira.');

  // Categoria, conta e cartão atuais entram nas opções mesmo arquivados / na lixeira.
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
  const cartoes = listarCartoes(banco).map((c) => ({
    id: c.id,
    nome: c.nome,
    diaFechamento: c.diaFechamento,
    diaVencimento: c.diaVencimento,
  }));
  const cartaoDaCompra = g.cartaoId ? obterCartao(banco, g.cartaoId) : undefined;
  if (cartaoDaCompra && !cartoes.some((c) => c.id === cartaoDaCompra.id)) {
    cartoes.push({
      id: cartaoDaCompra.id,
      nome: `${cartaoDaCompra.nome} (arquivado)`,
      diaFechamento: cartaoDaCompra.diaFechamento,
      diaVencimento: cartaoDaCompra.diaVencimento,
    });
  }

  // Parcelas de compra de cartão, cada uma com a fatura em que caiu (compras à vista não têm).
  const parcelasDaCompra = banco.db
    .select({
      numero: parcelas.numero,
      valorCentavos: parcelas.valorCentavos,
      faturaMes: faturas.mesVencimento,
      pagaEm: faturas.pagaEm,
    })
    .from(parcelas)
    .innerJoin(faturas, eq(faturas.id, parcelas.faturaId))
    .where(eq(parcelas.compraId, g.id))
    .orderBy(asc(parcelas.numero))
    .all();

  return {
    gasto: g,
    cartaoNome: cartaoDaCompra?.nome ?? null,
    categoriaNome: cat?.nome ?? '—',
    categorias,
    contas,
    cartoes,
    parcelas: parcelasDaCompra.map((p) => ({
      numero: p.numero,
      valorCentavos: p.valorCentavos,
      faturaMes: p.faturaMes,
      paga: p.pagaEm !== null,
    })),
  };
};

export const actions: Actions = {
  salvar: async ({ request, params }) => {
    const v = await validar(request, gastoForm, 'salvar');
    if (!v.ok) return v.falha;
    const d = v.dados;
    const r = comCamposDoFormulario(
      executar('salvar', () => editarGasto(obterBanco(), params.id, dadosDoGasto(d)), {
        valores: v.valores,
      }),
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

import { hoje, mesDe } from '$lib/dominio/datas';
import { somar } from '$lib/dominio/dinheiro';
import { redirect } from '@sveltejs/kit';
import { campo, executar, falhou, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { garantirCategoriasPadrao, listarCategorias } from '$lib/server/servicos/categorias';
import { listarContas } from '$lib/server/servicos/contas';
import {
  lancamentosDoMes,
  lancarGasto,
  restaurarGasto,
  ultimaCategoriaUsada,
} from '$lib/server/servicos/gastos';
import { agruparPorDia } from '$lib/server/servicos/painel';
import { mesDaUrl } from '$lib/ui/formato';
import { gastoForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const banco = obterBanco();
  garantirCategoriasPadrao(banco);
  const agora = new Date();
  const mes = mesDaUrl(url, agora);
  const lancamentos = lancamentosDoMes(banco, mes);
  return {
    mes,
    hoje: hoje(agora),
    dias: agruparPorDia(lancamentos),
    totalCentavos: somar(lancamentos.map((l) => l.valorCentavos)),
    quantidade: lancamentos.length,
    categorias: listarCategorias(banco).map((c) => ({ id: c.id, nome: c.nome, cor: c.cor })),
    contas: listarContas(banco).map((c) => ({ id: c.id, nome: c.nome })),
    ultimaCategoria: ultimaCategoriaUsada(banco),
    /** Gasto que acabou de ir para a lixeira (para oferecer "desfazer"). */
    removido: url.searchParams.get('removido'),
  };
};

export const actions: Actions = {
  lancar: async ({ request }) => {
    const v = await validar(request, gastoForm, 'lancar');
    if (!v.ok) return v.falha;
    const d = v.dados;
    return executar(
      'lancar',
      () => {
        const g = lancarGasto(obterBanco(), {
          valorCentavos: d.valor,
          descricao: d.descricao,
          categoriaId: d.categoriaId,
          data: d.data,
          contaId: d.contaId,
        });
        return {
          acao: 'lancar',
          lancado: { id: g.id, valorCentavos: d.valor, mes: mesDe(d.data) },
        };
      },
      { valores: v.valores },
    );
  },
  restaurar: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    const r = executar('restaurar', () => restaurarGasto(obterBanco(), id));
    if (falhou(r)) return r;
    redirect(303, `/gastos?mes=${mesDe(r.dataCompra)}`);
  },
};

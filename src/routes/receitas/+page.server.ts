import { ehDia, hoje, mesDe } from '$lib/dominio/datas';
import { somar } from '$lib/dominio/dinheiro';
import { agruparReceitasPorDia, porCategoriaReceita } from '$lib/dominio/receitas';
import { redirect } from '@sveltejs/kit';
import { campo, executar, falhou, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { listarContas } from '$lib/server/servicos/contas';
import {
  lancarReceita,
  obterReceita,
  receitasDoMes,
  restaurarReceita,
  ultimaCategoriaReceitaUsada,
} from '$lib/server/servicos/receitas';
import { mesDaRota, viaEnhance } from '$lib/server/rotas';
import { receitaForm } from '$lib/validacao/nucleo';
import { CATEGORIAS_RECEITA } from '$lib/dominio/receitas';
import type { Actions, PageServerLoad } from './$types';

/** O "desfazer" só aparece enquanto a receita continua na lixeira. */
function receitaAindaNaLixeira(banco: ReturnType<typeof obterBanco>, id: string | null) {
  return id && obterReceita(banco, id)?.removidoEm ? id : null;
}

export const load: PageServerLoad = ({ url }) => {
  const banco = obterBanco();
  const agora = new Date();
  const mes = mesDaRota(url, agora);
  const receitas = receitasDoMes(banco, mes);
  return {
    mes,
    hoje: hoje(agora),
    /** Sem JavaScript, a data do último lançamento volta pela URL. */
    dataInicial: ehDia(url.searchParams.get('data')) ? url.searchParams.get('data')! : hoje(agora),
    /** Sem JavaScript, o valor da receita recém-lançada volta pela URL (para a confirmação). */
    lancadoSemJs: Number(url.searchParams.get('lancado')) || null,
    dias: agruparReceitasPorDia(receitas),
    fatias: porCategoriaReceita(receitas),
    totalCentavos: somar(receitas.map((r) => r.valorCentavos)),
    quantidade: receitas.length,
    categorias: CATEGORIAS_RECEITA,
    contas: listarContas(banco).map((c) => ({ id: c.id, nome: c.nome })),
    ultimaCategoria: ultimaCategoriaReceitaUsada(banco),
    /** Receita que acabou de ir para a lixeira (para oferecer "desfazer"). */
    removido: receitaAindaNaLixeira(banco, url.searchParams.get('removido')),
  };
};

export const actions: Actions = {
  lancar: async ({ request }) => {
    const v = await validar(request, receitaForm, 'lancar');
    if (!v.ok) return v.falha;
    const d = v.dados;
    const r = executar(
      'lancar',
      () => {
        const x = lancarReceita(obterBanco(), {
          valorCentavos: d.valorCentavos,
          data: d.data,
          categoria: d.categoria,
          descricao: d.descricao,
          contaId: d.contaId,
          observacao: d.observacao,
        });
        return {
          acao: 'lancar',
          lancado: { id: x.id, valorCentavos: d.valorCentavos, mes: mesDe(d.data) },
        };
      },
      { valores: v.valores },
    );
    // Sem JavaScript: POST → redirect → GET, para o F5 não lançar a receita de novo.
    if (!falhou(r) && !viaEnhance(request)) {
      // Leva data e categoria para o próximo lançamento, como acontece com JavaScript.
      const q = new URLSearchParams({
        mes: r.lancado.mes,
        data: d.data,
        lancado: String(r.lancado.valorCentavos),
      });
      redirect(303, `/receitas?${q}`);
    }
    return r;
  },
  restaurar: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    const r = executar('restaurar', () => restaurarReceita(obterBanco(), id));
    if (falhou(r)) return r;
    redirect(303, `/receitas?mes=${mesDe(r.data)}`);
  },
};

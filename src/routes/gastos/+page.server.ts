import { ehDia, hoje, mesDe } from '$lib/dominio/datas';
import { somar } from '$lib/dominio/dinheiro';
import { redirect } from '@sveltejs/kit';
import { campo, executar, falhou, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { listarCategorias } from '$lib/server/servicos/categorias';
import { listarCartoes } from '$lib/server/servicos/cartoes';
import { listarContas } from '$lib/server/servicos/contas';
import {
  lancamentosDoMes,
  lancarGasto,
  obterGasto,
  restaurarGasto,
  ultimaCategoriaUsada,
} from '$lib/server/servicos/gastos';
import { agruparPorDia } from '$lib/dominio/lancamentos';
import { mesDaRota, viaEnhance } from '$lib/server/rotas';
import { comCamposDoFormulario, dadosDoGasto } from '$lib/server/formularioGasto';
import { gastoForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

/** O "desfazer" só aparece enquanto o gasto continua na lixeira. */
function gastoAindaNaLixeira(banco: ReturnType<typeof obterBanco>, id: string | null) {
  return id && obterGasto(banco, id)?.removidoEm ? id : null;
}

export const load: PageServerLoad = ({ url }) => {
  const banco = obterBanco();
  const agora = new Date();
  const mes = mesDaRota(url, agora);
  const lancamentos = lancamentosDoMes(banco, mes);
  return {
    mes,
    hoje: hoje(agora),
    /** Sem JavaScript, a data do último lançamento volta pela URL. */
    dataInicial: ehDia(url.searchParams.get('data')) ? url.searchParams.get('data')! : hoje(agora),
    /** Sem JavaScript, o valor do gasto recém-lançado volta pela URL (para a confirmação). */
    lancadoSemJs: Number(url.searchParams.get('lancado')) || null,
    dias: agruparPorDia(lancamentos),
    totalCentavos: somar(lancamentos.map((l) => l.valorCentavos)),
    quantidade: lancamentos.length,
    categorias: listarCategorias(banco).map((c) => ({ id: c.id, nome: c.nome, cor: c.cor })),
    contas: listarContas(banco).map((c) => ({ id: c.id, nome: c.nome })),
    cartoes: listarCartoes(banco).map((c) => ({
      id: c.id,
      nome: c.nome,
      diaFechamento: c.diaFechamento,
      diaVencimento: c.diaVencimento,
    })),
    ultimaCategoria: ultimaCategoriaUsada(banco),
    /** Gasto que acabou de ir para a lixeira (para oferecer "desfazer"). */
    removido: gastoAindaNaLixeira(banco, url.searchParams.get('removido')),
  };
};

export const actions: Actions = {
  lancar: async ({ request }) => {
    const v = await validar(request, gastoForm, 'lancar');
    if (!v.ok) return v.falha;
    const d = v.dados;
    const r = comCamposDoFormulario(
      executar(
        'lancar',
        () => {
          const g = lancarGasto(obterBanco(), dadosDoGasto(d));
          return {
            acao: 'lancar',
            lancado: { id: g.id, valorCentavos: d.valor, mes: mesDe(d.data) },
          };
        },
        { valores: v.valores },
      ),
    );
    // Sem JavaScript: POST → redirect → GET, para o F5 não lançar o gasto de novo.
    if (!falhou(r) && !viaEnhance(request)) {
      // Leva data e categoria para o próximo lançamento, como acontece com JavaScript.
      // (a categoria já volta marcada: é a última usada).
      const q = new URLSearchParams({
        mes: r.lancado.mes,
        data: d.data,
        lancado: String(r.lancado.valorCentavos),
      });
      redirect(303, `/gastos?${q}`);
    }
    return r;
  },
  restaurar: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    const r = executar('restaurar', () => restaurarGasto(obterBanco(), id));
    if (falhou(r)) return r;
    redirect(303, `/gastos?mes=${mesDe(r.dataCompra)}`);
  },
};

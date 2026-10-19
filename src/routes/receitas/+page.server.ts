import { ehDia, ehMes, hoje, mesDe, type Dia } from '$lib/dominio/datas';
import { somar } from '$lib/dominio/dinheiro';
import { agruparReceitasPorDia, porCategoriaReceita } from '$lib/dominio/receitas';
import { redirect } from '@sveltejs/kit';
import { campo, executar, falhou, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { listarContas } from '$lib/server/servicos/contas';
import {
  confirmarRecebimento,
  desfazerConfirmacao,
  lancarReceita,
  obterReceita,
  receitasAReceber,
  receitasDoMes,
  removerReceita,
  restaurarReceita,
  ultimaCategoriaReceitaUsada,
} from '$lib/server/servicos/receitas';
import {
  lancarReceitaRecorrente,
  listarRecorrentes,
  pausarRecorrente,
  removerRecorrente,
  retomarRecorrente,
} from '$lib/server/servicos/recorrentes';
import { descreverRecorrencia } from '$lib/dominio/recorrencias';
import { mesDaRota, viaEnhance } from '$lib/server/rotas';
import { confirmarRecebimentoForm, receitaForm } from '$lib/validacao/nucleo';
import { CATEGORIAS_RECEITA } from '$lib/dominio/receitas';
import type { Actions, PageServerLoad } from './$types';

/** O "desfazer" só aparece enquanto a receita continua na lixeira. */
function receitaAindaNaLixeira(banco: ReturnType<typeof obterBanco>, id: string | null) {
  return id && obterReceita(banco, id)?.removidoEm ? id : null;
}

/** Avisos depois de uma ação. A URL leva só a chave (?aviso=confirmada). */
const AVISOS: Record<string, string> = {
  confirmada: 'Recebimento confirmado.',
  desfeita: 'Confirmação desfeita. A receita voltou a ser prevista.',
  pausada: 'Receita recorrente pausada. Nada mais será lançado até você retomar.',
  retomada: 'Receita recorrente retomada. Os próximos meses voltam a ser lançados.',
  'recorrente-editada': 'Receita recorrente salva. As mudanças valem só para os próximos meses.',
  'recorrente-removida':
    'Receita recorrente mandada para a lixeira. As receitas já lançadas continuam no histórico.',
};

/** Mês para voltar depois de uma ação: o da tela de origem, se válido; senão o da receita. */
const mesParaVoltar = (mes: string, dia: Dia) => (ehMes(mes) ? mes : mesDe(dia));

export const load: PageServerLoad = ({ url }) => {
  const banco = obterBanco();
  const agora = new Date();
  const mes = mesDaRota(url, agora);
  const receitas = receitasDoMes(banco, mes);
  // Previstas aparecem na lista, mas não somam: total do dia, total do mês e categorias só
  // olham as recebidas.
  const recebidas = receitas.filter((r) => r.confirmada !== false);
  return {
    mes,
    hoje: hoje(agora),
    /** Sem JavaScript, a data do último lançamento volta pela URL. */
    dataInicial: ehDia(url.searchParams.get('data')) ? url.searchParams.get('data')! : hoje(agora),
    /** Sem JavaScript, o valor da receita recém-lançada volta pela URL (para a confirmação). */
    lancadoSemJs: Number(url.searchParams.get('lancado')) || null,
    lancadoPrevista: url.searchParams.has('prevista'),
    lancadoRecorrente: url.searchParams.has('recorrente'),
    dias: agruparReceitasPorDia(receitas).map((d) => ({
      ...d,
      totalCentavos: somar(
        d.itens.filter((i) => i.confirmada !== false).map((i) => i.valorCentavos),
      ),
    })),
    fatias: porCategoriaReceita(recebidas),
    totalCentavos: somar(recebidas.map((r) => r.valorCentavos)),
    quantidade: receitas.length,
    /** Previstas já vencidas (de qualquer mês), para confirmar o recebimento. */
    aReceber: receitasAReceber(banco),
    aviso: AVISOS[url.searchParams.get('aviso') ?? ''] ?? null,
    categorias: CATEGORIAS_RECEITA,
    contas: listarContas(banco).map((c) => ({ id: c.id, nome: c.nome })),
    ultimaCategoria: ultimaCategoriaReceitaUsada(banco),
    /** Receitas que se repetem todo mês (criadas com "Repetir todo mês"). */
    recorrentes: listarRecorrentes(banco).map((r) => ({
      id: r.id,
      descricao: r.descricao,
      categoria: r.categoria,
      valorCentavos: r.valorCentavos,
      ativa: r.ativa,
      proxima: r.proxima,
      geradas: r.geradas,
      descricaoRecorrencia: descreverRecorrencia(r),
    })),
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
        if (d.repetir) {
          const { receita } = lancarReceitaRecorrente(obterBanco(), d);
          return {
            acao: 'lancar',
            lancado: {
              id: receita?.id ?? '',
              valorCentavos: d.valorCentavos,
              mes: mesDe(d.data),
              prevista: receita === null || receita.confirmadaEm === null,
              recorrente: true,
            },
          };
        }
        const x = lancarReceita(obterBanco(), {
          valorCentavos: d.valorCentavos,
          data: d.data,
          categoria: d.categoria,
          descricao: d.descricao,
          contaId: d.contaId,
          observacao: d.observacao,
          recebida: d.recebida,
        });
        return {
          acao: 'lancar',
          lancado: {
            id: x.id,
            valorCentavos: d.valorCentavos,
            mes: mesDe(d.data),
            prevista: !d.recebida,
            recorrente: false,
          },
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
      if (r.lancado.prevista) q.set('prevista', '1');
      if (r.lancado.recorrente) q.set('recorrente', '1');
      redirect(303, `/receitas?${q}`);
    }
    return r;
  },
  /** "Recebi": confirma a prevista, com o valor e a data reais (vêm preenchidos com os previstos). */
  confirmar: async ({ request }) => {
    const v = await validar(request, confirmarRecebimentoForm, 'confirmar');
    if (!v.ok) return v.falha;
    const id = v.valores.id ?? '';
    const r = executar('confirmar', () => confirmarRecebimento(obterBanco(), id, v.dados), {
      id,
      valores: v.valores,
    });
    if (falhou(r)) return r;
    // Fica na tela de origem, mesmo que a data real caia em outro mês.
    redirect(303, `/receitas?mes=${mesParaVoltar(v.valores.mes ?? '', r.data)}&aviso=confirmada`);
  },
  /** "Não recebi": a prevista vai para a lixeira (e não volta a ser gerada). */
  naoRecebi: async ({ request }) => {
    const fd = await request.formData();
    const id = campo(fd, 'id');
    const r = executar('naoRecebi', () => removerReceita(obterBanco(), id), { id });
    if (falhou(r)) return r;
    redirect(303, `/receitas?mes=${mesParaVoltar(campo(fd, 'mes'), r.data)}&removido=${r.id}`);
  },
  /** Volta a prevista (para corrigir uma confirmação feita por engano). */
  desfazerConfirmacao: async ({ request }) => {
    const fd = await request.formData();
    const id = campo(fd, 'id');
    const r = executar('desfazerConfirmacao', () => desfazerConfirmacao(obterBanco(), id), { id });
    if (falhou(r)) return r;
    redirect(303, `/receitas?mes=${mesParaVoltar(campo(fd, 'mes'), r.data)}&aviso=desfeita`);
  },
  pausarRecorrente: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    const r = executar('pausarRecorrente', () => pausarRecorrente(obterBanco(), id), { id });
    if (falhou(r)) return r;
    redirect(303, '/receitas?aviso=pausada#recorrentes');
  },
  retomarRecorrente: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    const r = executar('retomarRecorrente', () => retomarRecorrente(obterBanco(), id), { id });
    if (falhou(r)) return r;
    redirect(303, '/receitas?aviso=retomada#recorrentes');
  },
  removerRecorrente: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    const r = executar('removerRecorrente', () => removerRecorrente(obterBanco(), id), { id });
    if (falhou(r)) return r;
    redirect(303, '/receitas?aviso=recorrente-removida#recorrentes');
  },
  restaurar: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    const r = executar('restaurar', () => restaurarReceita(obterBanco(), id));
    if (falhou(r)) return r;
    redirect(303, `/receitas?mes=${mesDe(r.data)}`);
  },
};

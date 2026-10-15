import { redirect } from '@sveltejs/kit';
import { hoje } from '$lib/dominio/datas';
import { CATEGORIAS_RECEITA } from '$lib/dominio/receitas';
import { descreverRecorrencia } from '$lib/dominio/recorrencias';
import { campo, executar, falhou, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { listarContas } from '$lib/server/servicos/contas';
import {
  criarRecorrente,
  listarRecorrentes,
  pausarRecorrente,
  removerRecorrente,
  retomarRecorrente,
} from '$lib/server/servicos/recorrentes';
import { receitaRecorrenteForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

/** Mensagens depois de uma ação. A URL leva só a chave (?aviso=pausada), nunca o texto. */
const AVISOS: Record<string, string> = {
  criada: 'Receita recorrente criada. Os meses já chegados foram lançados.',
  pausada: 'Receita recorrente pausada. Nada mais será lançado até você retomar.',
  editada: 'Modelo salvo. As mudanças valem só para os próximos meses.',
  retomada: 'Receita recorrente retomada. Os próximos meses voltam a ser lançados.',
  removida: 'Modelo mandado para a lixeira. As receitas já lançadas continuam no histórico.',
};

export const load: PageServerLoad = ({ url }) => {
  const banco = obterBanco();
  const agora = new Date();
  const aviso = url.searchParams.get('aviso') ?? '';
  return {
    hoje: hoje(agora),
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
    categorias: CATEGORIAS_RECEITA,
    contas: listarContas(banco).map((c) => ({ id: c.id, nome: c.nome })),
    aviso: AVISOS[aviso] ?? null,
  };
};

export const actions: Actions = {
  criar: async ({ request }) => {
    const v = await validar(request, receitaRecorrenteForm, 'criar');
    if (!v.ok) return v.falha;
    const d = v.dados;
    const r = executar(
      'criar',
      () => {
        criarRecorrente(obterBanco(), {
          valorCentavos: d.valorCentavos,
          categoria: d.categoria,
          diaDoMes: d.diaDoMes,
          inicio: d.inicio,
          fim: d.fim,
          descricao: d.descricao,
          contaId: d.contaId,
          observacao: d.observacao,
        });
        return { acao: 'criar', ok: 'Receita recorrente criada.' };
      },
      { valores: v.valores },
    );
    if (falhou(r)) return r;
    redirect(303, '/receitas/recorrentes?aviso=criada');
  },
  pausar: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    const r = executar('pausar', () => pausarRecorrente(obterBanco(), id), { id });
    if (falhou(r)) return r;
    redirect(303, '/receitas/recorrentes?aviso=pausada');
  },
  retomar: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    const r = executar('retomar', () => retomarRecorrente(obterBanco(), id), { id });
    if (falhou(r)) return r;
    redirect(303, '/receitas/recorrentes?aviso=retomada');
  },
  remover: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    const r = executar('remover', () => removerRecorrente(obterBanco(), id), { id });
    if (falhou(r)) return r;
    redirect(303, '/receitas/recorrentes?aviso=removida');
  },
};

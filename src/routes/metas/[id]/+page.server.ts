import { error, redirect } from '@sveltejs/kit';
import { campo, executar, falhou, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import {
  editarMeta,
  movimentarMeta,
  obterMeta,
  obterMetaDetalhada,
  removerMeta,
  removerMovimentoMeta,
} from '$lib/server/servicos/metas';
import { formatarBRL } from '$lib/dominio/dinheiro';
import { hoje } from '$lib/dominio/datas';
import { metaForm, movimentoMetaForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  const banco = obterBanco();
  if (!obterMeta(banco, params.id)) error(404, 'Esta meta não existe ou está na lixeira.');
  const dia = hoje();
  return { meta: obterMetaDetalhada(banco, params.id, dia), hoje: dia };
};

export const actions: Actions = {
  salvar: async ({ request, params }) => {
    const v = await validar(request, metaForm, 'salvar');
    if (!v.ok) return v.falha;
    const r = executar('salvar', () => editarMeta(obterBanco(), params.id, v.dados), {
      valores: v.valores,
    });
    if (falhou(r)) return r;
    return { acao: 'salvar', ok: 'Meta salva.' };
  },
  movimentar: async ({ request, params }) => {
    const v = await validar(request, movimentoMetaForm, 'movimentar');
    if (!v.ok) return v.falha;
    const r = executar('movimentar', () => movimentarMeta(obterBanco(), params.id, v.dados), {
      valores: v.valores,
    });
    if (falhou(r)) return r;
    const verbo = v.dados.tipo === 'guardar' ? 'Guardado' : 'Retirado';
    return { acao: 'movimentar', ok: `${verbo}: ${formatarBRL(v.dados.valorCentavos)}.` };
  },
  removerMovimento: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    const r = executar('removerMovimento', () => removerMovimentoMeta(obterBanco(), id), { id });
    if (falhou(r)) return r;
    return {
      acao: 'removerMovimento',
      id,
      ok: 'Movimento removido. O total guardado foi atualizado.',
    };
  },
  remover: ({ params }) => {
    const r = executar('remover', () => removerMeta(obterBanco(), params.id));
    if (falhou(r)) return r;
    redirect(303, '/metas');
  },
};

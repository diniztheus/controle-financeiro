import { fail } from '@sveltejs/kit';
import { hoje } from '$lib/dominio/datas';
import { campo, executar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { definirLimiteMes, definirLimitePadrao, listarLimites } from '$lib/server/servicos/limite';
import { montarPainel } from '$lib/server/servicos/painel';
import { contasDesatualizadas } from '$lib/server/servicos/lembretes';
import { cartaoResumoDoPainel } from '$lib/server/servicos/resumoMes';
import { mesDaRota } from '$lib/server/rotas';
import { errosPorCampo, limiteForm, limiteMesForm, lerForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const banco = obterBanco();
  const agora = new Date();
  const mes = mesDaRota(url, agora);
  // Qual limite vale para o mês: o ajuste deste mês, se existir, senão o padrão.
  const temAjusteDoMes = listarLimites(banco).porMes.some((l) => l.mes === mes);
  return {
    painel: montarPainel(banco, mes, hoje(agora)),
    /** Contas com o saldo sem atualizar há mais dias que o configurado (lembrete). */
    saldosVelhos: contasDesatualizadas(banco, hoje(agora)),
    /** Nos primeiros dias do mês: o resumo do mês que acabou. */
    resumoAnterior: cartaoResumoDoPainel(banco, hoje(agora)),
    limiteDoMes: temAjusteDoMes ? ('mes' as const) : ('padrao' as const),
    /** Sem JavaScript, "Definir limite" abre o formulário pela URL. */
    editarLimite: url.searchParams.has('limite'),
  };
};

export const actions: Actions = {
  limite: async ({ request }) => {
    // Um só FormData: a escolha "mes" (só este mês) ou "padrao" (todos os meses) vem no campo `escopo`.
    const fd = await request.formData();
    const valores = lerForm(fd);
    const soEsteMes = campo(fd, 'escopo') === 'mes';
    const r = soEsteMes ? limiteMesForm.safeParse(valores) : limiteForm.safeParse(valores);
    if (!r.success) return fail(400, { acao: 'limite', erros: errosPorCampo(r.error), valores });

    const dados = r.data as { valor: number; mes?: string };
    return executar(
      'limite',
      () => {
        const banco = obterBanco();
        if (soEsteMes && dados.mes) {
          definirLimiteMes(banco, dados.mes, dados.valor);
          return {
            acao: 'limite',
            ok: dados.valor > 0 ? 'Limite deste mês salvo.' : 'Limite deste mês removido.',
          };
        }
        definirLimitePadrao(banco, dados.valor);
        return { acao: 'limite', ok: dados.valor > 0 ? 'Limite salvo.' : 'Limite removido.' };
      },
      { valores },
    );
  },
};

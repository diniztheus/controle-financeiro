import { error } from '@sveltejs/kit';
import { ehMes, hoje } from '$lib/dominio/datas';
import type { ItemFatura } from '$lib/dominio/cartoes';
import { executar, falhou, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import {
  desfazerPagamentoFatura,
  obterCartao,
  obterFatura,
  pagarFatura,
} from '$lib/server/servicos/cartoes';
import { pagarFaturaForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

/** Mês fora do formato AAAA-MM ou cartão inexistente / na lixeira: página não encontrada. */
function cartaoDaFatura(banco: ReturnType<typeof obterBanco>, id: string, mes: string) {
  if (!ehMes(mes)) error(404, 'Este mês não existe.');
  const cartao = obterCartao(banco, id);
  if (!cartao || cartao.removidoEm) error(404, 'Este cartão não existe ou está na lixeira.');
  return cartao;
}

export const load: PageServerLoad = ({ params }) => {
  const banco = obterBanco();
  const cartao = cartaoDaFatura(banco, params.id, params.mes);
  const agora = new Date();
  const fatura = obterFatura(banco, cartao.id, params.mes, hoje(agora));

  // Itens já vêm do mais recente; aqui agrupam-se por dia da compra.
  const dias: { data: string; itens: ItemFatura[] }[] = [];
  for (const item of fatura.itens) {
    const ultimo = dias.at(-1);
    if (ultimo && ultimo.data === item.data) ultimo.itens.push(item);
    else dias.push({ data: item.data, itens: [item] });
  }

  return { cartao, fatura, dias, hoje: hoje(agora) };
};

export const actions: Actions = {
  pagar: async ({ request, params }) => {
    if (!ehMes(params.mes)) error(404, 'Este mês não existe.');
    const v = await validar(request, pagarFaturaForm, 'pagar');
    if (!v.ok) return v.falha;
    const r = executar(
      'pagar',
      () =>
        pagarFatura(obterBanco(), params.id, params.mes, {
          pagaEm: v.dados.pagaEm,
          valorPagoCentavos: v.dados.valor,
        }),
      { valores: v.valores },
    );
    if (falhou(r)) return r;
    return { acao: 'pagar', ok: 'Fatura marcada como paga.' };
  },
  desfazer: ({ params }) => {
    if (!ehMes(params.mes)) error(404, 'Este mês não existe.');
    const r = executar('desfazer', () =>
      desfazerPagamentoFatura(obterBanco(), params.id, params.mes),
    );
    if (falhou(r)) return r;
    return { acao: 'desfazer', ok: 'Pagamento desfeito. A fatura volta a aberto.' };
  },
};

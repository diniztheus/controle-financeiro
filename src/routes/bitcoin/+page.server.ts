import { fail } from '@sveltejs/kit';
import { hoje } from '$lib/dominio/datas';
import { campo, executar, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import {
  buscarPrecoAutomatico,
  definirPrecoManual,
  movimentosNaLixeira,
  painelBitcoin,
  registrarMovimento,
  removerMovimento,
  restaurarMovimento,
} from '$lib/server/servicos/bitcoin';
import { btcForm, precoForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const banco = obterBanco();
  return {
    painel: painelBitcoin(banco),
    lixeira: movimentosNaLixeira(banco),
    hoje: hoje(),
    /** Conversor sem JavaScript: os valores vêm na URL (?sats=… ou ?reais=…). */
    conversor: {
      sats: url.searchParams.get('sats') ?? '',
      reais: url.searchParams.get('reais') ?? '',
    },
  };
};

export const actions: Actions = {
  registrar: async ({ request }) => {
    const v = await validar(request, btcForm, 'registrar');
    if (!v.ok) return v.falha;
    return executar(
      'registrar',
      () => {
        registrarMovimento(obterBanco(), {
          sats: v.dados.sats,
          valorCentavos: v.dados.valorCentavos,
          data: v.dados.data,
          nota: v.dados.nota,
        });
        const nomeTipo = v.dados.sats > 0 ? 'Compra' : 'Venda';
        return {
          acao: 'registrar',
          ok: `${nomeTipo} de ${Math.abs(v.dados.sats).toLocaleString('pt-BR')} sats registrada.`,
        };
      },
      { valores: v.valores },
    );
  },
  remover: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    return executar(
      'remover',
      () => {
        removerMovimento(obterBanco(), id);
        return { acao: 'remover', id, ok: 'Movimento mandado para a lixeira.' };
      },
      { id },
    );
  },
  restaurar: async ({ request }) => {
    const id = campo(await request.formData(), 'id');
    return executar(
      'restaurar',
      () => {
        restaurarMovimento(obterBanco(), id);
        return { acao: 'restaurar', id, ok: 'Movimento restaurado.' };
      },
      { id },
    );
  },
  preco: async ({ request }) => {
    const v = await validar(request, precoForm, 'preco');
    if (!v.ok) return v.falha;
    return executar(
      'preco',
      () => {
        definirPrecoManual(obterBanco(), v.dados.data, v.dados.preco);
        return { acao: 'preco', ok: 'Preço do dia salvo.' };
      },
      { valores: v.valores },
    );
  },
  buscarPreco: async () => {
    // Nunca lança: offline ou API fora devolvem ok false com a mensagem para a tela.
    const r = await buscarPrecoAutomatico(obterBanco());
    if (r.ok) return { acao: 'buscarPreco', ok: r.mensagem };
    return fail(502, { acao: 'buscarPreco', erro: r.mensagem });
  },
};

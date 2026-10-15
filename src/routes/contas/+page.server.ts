import { campo, executar, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import {
  atualizarSaldo,
  criarConta,
  listarContas,
  moverConta,
  totalDasContas,
} from '$lib/server/servicos/contas';
import { contaForm, saldoForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  const banco = obterBanco();
  const contas = listarContas(banco);
  return { contas, total: totalDasContas(banco, contas) };
};

export const actions: Actions = {
  criar: async ({ request }) => {
    const v = await validar(request, contaForm, 'criar');
    if (!v.ok) return v.falha;
    return executar(
      'criar',
      () => {
        const c = criarConta(obterBanco(), {
          nome: v.dados.nome,
          tipo: v.dados.tipo,
          saldoCentavos: v.dados.saldo,
        });
        return { acao: 'criar', ok: `Conta "${c.nome}" cadastrada.` };
      },
      { valores: v.valores },
    );
  },
  saldo: async ({ request }) => {
    const v = await validar(request, saldoForm, 'saldo');
    if (!v.ok) return v.falha;
    const id = v.valores.id ?? '';
    return executar(
      'saldo',
      () => {
        atualizarSaldo(obterBanco(), id, v.dados.saldo);
        return { acao: 'saldo', id, ok: 'Saldo atualizado.' };
      },
      { id, valores: v.valores },
    );
  },
  mover: async ({ request }) => {
    const fd = await request.formData();
    const id = campo(fd, 'id');
    const direcao = campo(fd, 'direcao') === 'subir' ? -1 : 1;
    return executar('mover', () => moverConta(obterBanco(), id, direcao), { id });
  },
};

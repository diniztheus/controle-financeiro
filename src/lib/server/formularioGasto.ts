/**
 * Ponte entre o formulário de gasto (validacao/nucleo.ts) e o serviço de gastos: converte a saída
 * do formulário em `DadosGasto` e renomeia os campos de erro do serviço para os do formulário
 * (cartaoId → cartao, numParcelas → parcelas), para a mensagem aparecer ao lado do campo certo.
 */
import { fail } from '@sveltejs/kit';
import type { GastoForm } from '../validacao/nucleo.ts';
import { falhou, type Falha } from './acoes.ts';
import type { DadosGasto } from './servicos/gastos.ts';

const CAMPO_DO_FORMULARIO: Record<string, string> = {
  cartaoId: 'cartao',
  numParcelas: 'parcelas',
};

export function dadosDoGasto(d: GastoForm): DadosGasto {
  return {
    valorCentavos: d.valor,
    descricao: d.descricao,
    categoriaId: d.categoriaId,
    data: d.data,
    contaId: d.contaId,
    meio: d.meio,
    cartaoId: d.cartaoId,
    numParcelas: d.numParcelas,
  };
}

/** Resultado de uma ação do serviço com os erros por campo já com os nomes do formulário. */
export function comCamposDoFormulario<T>(r: T | Falha): T | Falha {
  if (!falhou(r) || !r.data.erros) return r;
  const erros = Object.fromEntries(
    Object.entries(r.data.erros).map(([campo, msg]) => [CAMPO_DO_FORMULARIO[campo] ?? campo, msg]),
  );
  return fail(r.status, { ...r.data, erros });
}

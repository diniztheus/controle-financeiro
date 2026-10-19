import { error } from '@sveltejs/kit';
import { comparar, ehMes, mesAtual } from '$lib/dominio/datas';
import { obterBanco } from '$lib/server/db';
import { resumoDoMes } from '$lib/server/servicos/resumoMes';
import type { PageServerLoad } from './$types';

/** Mês fora do formato AAAA-MM ou depois do mês atual: página não encontrada. */
export const load: PageServerLoad = ({ params }) => {
  if (!ehMes(params.mes) || comparar(params.mes, mesAtual()) > 0) {
    error(404, 'Este mês não existe.');
  }
  return { mes: params.mes, resumo: resumoDoMes(obterBanco(), params.mes) };
};

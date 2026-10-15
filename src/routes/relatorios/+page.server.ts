import { obterBanco } from '$lib/server/db';
import {
  evolucaoPatrimonioMensal,
  fluxoDeCaixa,
  relatorioCategorias,
} from '$lib/server/servicos/relatorios';
import type { PageServerLoad } from './$types';

/** Quantos meses o relatório mostra; a URL aceita só estes valores (?meses=12). */
const OPCOES_MESES = [3, 6, 12, 24] as const;
const PADRAO_MESES = 6;

function lerMeses(texto: string | null): number {
  const n = Number(texto);
  return (OPCOES_MESES as readonly number[]).includes(n) ? n : PADRAO_MESES;
}

export const load: PageServerLoad = ({ url }) => {
  const banco = obterBanco();
  const meses = lerMeses(url.searchParams.get('meses'));
  const categorias = relatorioCategorias(banco, meses);
  const patrimonio = evolucaoPatrimonioMensal(banco, meses);
  const fluxo = fluxoDeCaixa(banco, meses);
  return {
    meses,
    opcoesMeses: OPCOES_MESES,
    de: categorias.meses[0] ?? '',
    ate: categorias.meses.at(-1) ?? '',
    categorias,
    patrimonio,
    fluxo,
  };
};

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** As recorrentes agora ficam na tela de receitas ("Repetir todo mês" e a lista "Recorrentes"). */
export const GET: RequestHandler = () => {
  redirect(308, '/receitas#recorrentes');
};

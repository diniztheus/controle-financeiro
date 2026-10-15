import { obterBanco } from '$lib/server/db';
import { ping } from '$lib/server/repos/sistema';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
  try {
    return { bancoConectado: ping(obterBanco()) };
  } catch {
    return { bancoConectado: false };
  }
};

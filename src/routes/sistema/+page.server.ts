import { fail } from '@sveltejs/kit';
import { obterBanco } from '$lib/server/db';
import { backupAgora, lerStatus } from '$lib/server/servicos/status';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  try {
    return { status: lerStatus(obterBanco()), erro: null };
  } catch (e) {
    console.error('[status]', e);
    return { status: null, erro: e instanceof Error ? e.message : String(e) };
  }
};

export const actions: Actions = {
  backup: () => {
    try {
      return { backup: backupAgora(obterBanco()) };
    } catch (e) {
      return fail(500, { erroBackup: e instanceof Error ? e.message : String(e) });
    }
  },
};

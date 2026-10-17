import { fail } from '@sveltejs/kit';
import { obterBanco } from '$lib/server/db';
import { lerConfigBackup } from '$lib/server/servicos/backups';
import { ultimaVerificacao } from '$lib/server/servicos/integridade';
import { backupAgora, lerStatus } from '$lib/server/servicos/status';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  const integridade = ultimaVerificacao();
  try {
    const banco = obterBanco();
    return {
      status: lerStatus(banco),
      erro: null,
      integridade,
      backupAuto: lerConfigBackup(banco),
    };
  } catch (e) {
    console.error('[status]', e);
    return {
      status: null,
      erro: e instanceof Error ? e.message : String(e),
      integridade,
      backupAuto: null,
    };
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

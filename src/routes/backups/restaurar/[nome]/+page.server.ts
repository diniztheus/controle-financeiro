import { error, fail, redirect } from '@sveltejs/kit';
import { join } from 'node:path';
import { campo, executar, falhou } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { nomeBackupValido, verificarArquivoBackup } from '$lib/server/db/backup';
import { listarBackupsDetalhados, restaurarBackup } from '$lib/server/servicos/backups';
import { nomeDoArquivo } from '$lib/ui/backupsFormato';
import type { Actions, PageServerLoad } from './$types';

/** Acha o backup pelo nome; nome inválido ou inexistente é 404. */
function acharBackup(nome: string) {
  if (!nomeBackupValido(nome)) error(404, 'Backup não encontrado.');
  const banco = obterBanco();
  const info = listarBackupsDetalhados(banco).find((b) => b.nome === nome);
  if (!info) error(404, 'Backup não encontrado.');
  return { banco, info };
}

export const load: PageServerLoad = ({ params }) => {
  const { banco, info } = acharBackup(params.nome);
  return {
    nome: info.nome,
    bytes: info.bytes,
    criadoEm: info.criadoEm.toISOString(),
    tipo: info.tipo,
    verificacao: verificarArquivoBackup(join(banco.config.backupsDir, info.nome)),
  };
};

export const actions: Actions = {
  restaurar: async ({ request, params }) => {
    acharBackup(params.nome);
    const fd = await request.formData();
    const palavra = campo(fd, 'palavra');
    const erros: Record<string, string> = {};
    if (!fd.has('entendi')) erros.entendi = 'Marque a caixa para confirmar que entendeu o aviso.';
    if (palavra.trim() !== 'restaurar') {
      erros.palavra = 'Digite a palavra restaurar, exatamente como aparece.';
    }
    if (Object.keys(erros).length) {
      return fail(400, { acao: 'restaurar', erros, valores: { palavra } });
    }
    const r = executar('restaurar', () => restaurarBackup(params.nome));
    if (falhou(r)) return r;
    // Fora de try: redirect() é uma exceção do SvelteKit.
    redirect(303, `/backups?restaurado=${encodeURIComponent(nomeDoArquivo(r.antesDeRestaurar))}`);
  },
};

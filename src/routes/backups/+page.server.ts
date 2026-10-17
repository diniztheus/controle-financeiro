import { campo, executar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import { nomeBackupValido } from '$lib/server/db/backup';
import {
  excluirBackup,
  listarBackupsDetalhados,
  lerConfigBackup,
  proximoBackupAutomatico,
  salvarConfigBackup,
} from '$lib/server/servicos/backups';
import { ultimaVerificacao, verificarIntegridade } from '$lib/server/servicos/integridade';
import { backupAgora } from '$lib/server/servicos/status';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const banco = obterBanco();
  const config = lerConfigBackup(banco);
  const backups = listarBackupsDetalhados(banco);
  const restaurado = url.searchParams.get('restaurado');
  return {
    pasta: banco.config.backupsDir,
    config,
    proximo: proximoBackupAutomatico(config, new Date()),
    backups: backups.map((b) => ({
      nome: b.nome,
      bytes: b.bytes,
      criadoEm: b.criadoEm.toISOString(),
      tipo: b.tipo,
    })),
    totalBytes: backups.reduce((soma, b) => soma + b.bytes, 0),
    integridade: ultimaVerificacao(),
    // Aviso depois de restaurar: só aceita um nome de backup válido (a URL pode ser qualquer coisa).
    restaurado: restaurado && nomeBackupValido(restaurado) ? restaurado : null,
  };
};

export const actions: Actions = {
  salvar: async ({ request }) => {
    const fd = await request.formData();
    const manterTexto = campo(fd, 'manter').trim();
    const valores = { manter: manterTexto };
    if (!/^\d+$/.test(manterTexto)) {
      return fail(400, {
        acao: 'salvar',
        erros: { manter: 'Digite um número inteiro de 1 a 365.' },
        valores,
      });
    }
    const ativo = fd.has('ativo');
    const manter = Number(manterTexto);
    return executar(
      'salvar',
      () => {
        salvarConfigBackup(obterBanco(), { ativo, manter });
        return { acao: 'salvar', ok: 'Configurações do backup automático salvas.' };
      },
      { valores },
    );
  },
  agora: () =>
    executar('agora', () => {
      const nome = backupAgora(obterBanco());
      return { acao: 'agora', ok: `Backup criado: ${nome}` };
    }),
  excluir: async ({ request }) => {
    const nome = campo(await request.formData(), 'nome');
    return executar(
      'excluir',
      () => {
        excluirBackup(obterBanco(), nome);
        return { acao: 'excluir', id: nome, ok: 'Backup excluído.' };
      },
      { id: nome },
    );
  },
  verificar: () =>
    executar('verificar', () => {
      const r = verificarIntegridade(obterBanco());
      return {
        acao: 'verificar',
        ok: r.ok
          ? 'Verificação concluída: nenhum problema encontrado.'
          : 'Verificação concluída: foram encontrados problemas. Veja abaixo.',
      };
    }),
};

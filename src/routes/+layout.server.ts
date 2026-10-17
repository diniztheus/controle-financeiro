import { obterBanco } from '$lib/server/db';
import { ping } from '$lib/server/repos/sistema';
import { pinAtivo } from '$lib/server/servicos/pin';
import { ultimaVerificacao } from '$lib/server/servicos/integridade';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
  const verificacao = ultimaVerificacao();
  const integridade = verificacao ? { ok: verificacao.ok, mensagens: verificacao.mensagens } : null;
  try {
    const banco = obterBanco();
    return { bancoConectado: ping(banco), integridade, pinAtivo: pinAtivo(banco) };
  } catch {
    return { bancoConectado: false, integridade, pinAtivo: false };
  }
};

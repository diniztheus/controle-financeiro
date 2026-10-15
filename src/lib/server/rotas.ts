/** Ajudas para os `load` das páginas. */
import { redirect } from '@sveltejs/kit';
import { ehMes, mesAtual, type Mes } from '../dominio/datas.ts';

/**
 * Mês pedido na URL (?mes=AAAA-MM). Sem o parâmetro, o mês atual; com um valor inválido,
 * redireciona para a mesma página sem ele (a URL errada não fica na barra).
 */
export function mesDaRota(url: URL, agora = new Date()): Mes {
  const m = url.searchParams.get('mes');
  if (m === null) return mesAtual(agora);
  if (ehMes(m)) return m;
  const limpa = new URL(url);
  limpa.searchParams.delete('mes');
  redirect(307, limpa.pathname + limpa.search);
}

/** O formulário foi enviado pelo `use:enhance` (JavaScript ligado)? */
export function viaEnhance(request: Request): boolean {
  return request.headers.has('x-sveltekit-action');
}

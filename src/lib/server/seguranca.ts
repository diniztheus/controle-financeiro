/**
 * Proteções de um site que só deve ser usado nesta máquina.
 *
 * 1. Host: só aceita pedidos endereçados a 127.0.0.1, localhost ou [::1]. Isso barra o ataque de
 *    "DNS rebinding" (um site malicioso que faz o próprio domínio apontar para 127.0.0.1).
 * 2. Origem: pedidos que alteram dados (POST, PUT, PATCH, DELETE) precisam vir desta mesma
 *    origem. Comparamos o cabeçalho Origin com o Host do próprio pedido, então funciona tanto em
 *    http://127.0.0.1:5173 quanto em http://localhost:5173, em qualquer porta, sem ORIGIN fixo.
 *
 * Substitui a checagem de CSRF embutida do SvelteKit (desligada em svelte.config.js), que no
 * adapter-node depende de um ORIGIN fixo e por isso recusava formulários vindos de localhost.
 */

const HOSTS_LOCAIS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface Pedido {
  metodo: string;
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
}

export interface Recusa {
  status: number;
  motivo: string;
}

/** "localhost:5173" → "localhost"; "[::1]:5173" → "[::1]". */
export function nomeDoHost(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function hostLocal(host: string | null): boolean {
  if (!host) return false;
  const nome = nomeDoHost(host);
  return nome !== null && HOSTS_LOCAIS.has(nome);
}

/** `null` = pode seguir; senão, a resposta de recusa. */
export function verificarPedido(p: Pedido): Recusa | null {
  if (!hostLocal(p.host)) {
    return { status: 403, motivo: 'Este site só atende em 127.0.0.1 ou localhost.' };
  }
  if (METODOS_SEGUROS.has(p.metodo.toUpperCase())) return null;

  if (p.origin && p.origin !== 'null') {
    let host: string;
    try {
      host = new URL(p.origin).host.toLowerCase();
    } catch {
      return { status: 403, motivo: 'Origem inválida.' };
    }
    if (host !== p.host!.toLowerCase()) {
      return { status: 403, motivo: 'Envio de formulário de outra origem recusado.' };
    }
    return null;
  }
  // Sem Origin (ou "null"): navegadores modernos ainda mandam Sec-Fetch-Site.
  if (p.secFetchSite && p.secFetchSite !== 'same-origin' && p.secFetchSite !== 'none') {
    return { status: 403, motivo: 'Envio de formulário de outra origem recusado.' };
  }
  if (p.origin === 'null') {
    return { status: 403, motivo: 'Envio de formulário de origem desconhecida recusado.' };
  }
  // Ferramentas locais (curl, scripts) não mandam Origin: são desta máquina.
  return null;
}

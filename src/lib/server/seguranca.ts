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
  /** Com ACESSO_REDE ligada, aceita também nomes e IPs da rede local (ver hostAceito). */
  acessoRede?: boolean;
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

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const NOME_UMA_ETIQUETA = /^[a-z0-9-]+$/;

/**
 * IPv4 de rede privada ou link-local (10/8, 172.16/12, 192.168/16, 169.254/16).
 * Quem chama já passou o host por `nomeDoHost`, que normaliza formas como "0xC0.0xA8.0.5".
 */
export function ipv4Privado(nome: string): boolean {
  const m = IPV4.exec(nome);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/**
 * Host aceito. Sempre: loopback (127.0.0.1, localhost, [::1]). Com `acessoRede`, também IPv4
 * privado, nome terminado em `.local` ou nome de uma só etiqueta ("meu-mac"). Nome com ponto
 * público (evil.com) nunca é aceito, para não abrir espaço para DNS rebinding.
 */
export function hostAceito(host: string | null, acessoRede = false): boolean {
  if (!host) return false;
  if (hostLocal(host)) return true;
  if (!acessoRede) return false;
  const nome = nomeDoHost(host);
  if (!nome) return false;
  if (ipv4Privado(nome)) return true;
  if (nome.endsWith('.local')) return true;
  return NOME_UMA_ETIQUETA.test(nome);
}

/** ACESSO_REDE=1 (no ambiente ou no .env). Desligada por padrão. */
export function acessoRedeLigado(env: Record<string, string | undefined> = process.env): boolean {
  return env.ACESSO_REDE?.trim() === '1';
}

/** `null` = pode seguir; senão, a resposta de recusa. */
export function verificarPedido(p: Pedido): Recusa | null {
  if (!hostAceito(p.host, p.acessoRede)) {
    return {
      status: 403,
      motivo: p.acessoRede
        ? 'Este site só atende nesta máquina ou na rede local.'
        : 'Este site só atende em 127.0.0.1 ou localhost.',
    };
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

// ---------------------------------------------------------------- PIN e acesso (gate)

/** Caminhos que funcionam sem PIN: a própria tela de PIN e os arquivos estáticos. */
const CAMINHOS_LIVRES = new Set([
  '/pin',
  '/pin/',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/service-worker.js',
  '/robots.txt',
]);
const PREFIXOS_LIVRES = ['/_app/', '/icons/'];

/** Caminho (com ou sem busca) é um dos livres? */
export function caminhoLivre(caminho: string): boolean {
  const [so = ''] = caminho.split('?');
  return CAMINHOS_LIVRES.has(so) || PREFIXOS_LIVRES.some((p) => so.startsWith(p));
}

/**
 * Destino de volta seguro para `voltar`: só caminho relativo ao próprio site. Começa com uma
 * única "/", sem "//" nem "\" (navegadores tratam "/\evil.com" como outro site) e sem caracteres
 * de controle (o navegador tira tab e quebra de linha, então "/\t/evil.com" viraria "//evil.com").
 */
export function ehDestinoSeguro(caminho: string | null | undefined): boolean {
  if (typeof caminho !== 'string' || !caminho.startsWith('/')) return false;
  if (caminho.startsWith('//') || caminho.includes('\\')) return false;
  for (const c of caminho) {
    const cod = c.charCodeAt(0);
    if (cod < 0x20 || cod === 0x7f) return false;
  }
  return true;
}

export interface AcessoPedido {
  pinAtivo: boolean;
  /** Caminho com busca, ex.: "/gastos?mes=2026-10". */
  caminho: string;
  metodo: string;
  /** Cookie de sessão válido (já conferido por sessaoPin.cookieValido). */
  cookieValido: boolean;
  hostEhLoopback: boolean;
  acessoRede: boolean;
  /** Porta do pedido, para a mensagem de orientação. */
  porta?: string;
}

export type DecisaoAcesso =
  | { acao: 'seguir' }
  | { acao: 'redirecionar'; para: string }
  | { acao: 'recusar'; status: number; motivo: string };

/**
 * Decide se a requisição pode seguir. Com PIN: sem cookie válido, navegação (GET/HEAD) vai para
 * /pin com `voltar`; os demais métodos recebem 401. Sem PIN: se o acesso pela rede está ligado e
 * o pedido não é desta máquina, recusa (403) até que o dono defina um PIN.
 */
export function decidirAcesso(a: AcessoPedido): DecisaoAcesso {
  if (caminhoLivre(a.caminho)) return { acao: 'seguir' };
  if (a.pinAtivo) {
    if (a.cookieValido) return { acao: 'seguir' };
    const metodo = a.metodo.toUpperCase();
    if (metodo === 'GET' || metodo === 'HEAD') {
      const voltar = ehDestinoSeguro(a.caminho) ? `?voltar=${encodeURIComponent(a.caminho)}` : '';
      return { acao: 'redirecionar', para: `/pin${voltar}` };
    }
    return { acao: 'recusar', status: 401, motivo: 'Entre com o PIN primeiro' };
  }
  if (a.acessoRede && !a.hostEhLoopback) {
    return {
      acao: 'recusar',
      status: 403,
      motivo: `Para acessar pela rede, defina um PIN em http://127.0.0.1:${a.porta || '5173'}/configuracoes`,
    };
  }
  return { acao: 'seguir' };
}

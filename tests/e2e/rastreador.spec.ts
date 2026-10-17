/**
 * Rastreador de links: começa no painel e segue os links internos (em largura, até 80 páginas
 * distintas), conferindo cada página. Roda depois dos outros e2e do mesmo banco, então já
 * encontra os cadastros que eles criaram (gastos, contas, receitas, faturas...).
 */
import { expect, test, type Page } from '@playwright/test';

const LIMITE_PAGINAS = 80;
/** `?mes=` navega mês a mês: depois de 3 meses de uma mesma rota, o resto é a mesma página. */
const LIMITE_MESES_POR_ROTA = 3;
/** Textos que denunciam valor vazado ou mal renderizado no corpo da página. */
const TEXTOS_SUSPEITOS = ['undefined', 'NaN', '[object'];
/**
 * Erros de console que não são bugs do site: o navegador pede favicon.ico e o service worker
 * sem ter um arquivo para cada um (o favicon é o favicon.svg, declarado no HTML).
 */
const IGNORADOS_NO_CONSOLE = [/\/favicon\.ico/, /service-worker/];

/**
 * Não seguidos: o que baixa arquivo (`/relatorios/exportar`, links com `download`), o que é
 * ação de formulário (`/pin?/sair` apaga o cookie) e o que não é http(s) (mailto:, tel:).
 */
function ehNavegacao(destino: URL): boolean {
  if (!/^https?:$/.test(destino.protocol)) return false;
  if (destino.pathname.startsWith('/relatorios/exportar')) return false;
  if (destino.pathname === '/pin' && destino.search.includes('/sair')) return false;
  return true;
}

interface Link {
  href: string;
  baixa: boolean;
}

/** Links da página, com o endereço já resolvido. Os de download vêm marcados. */
async function linksDaPagina(page: Page): Promise<Link[]> {
  const brutos = await page.$$eval('a[href]', (els) =>
    (els as HTMLAnchorElement[]).map((a) => ({ href: a.href, baixa: a.hasAttribute('download') })),
  );
  return brutos;
}

/** Chave de visita: caminho + busca, sem o fragmento. */
function chaveDe(url: URL): string {
  return url.pathname + url.search;
}

/** Confere uma página já carregada. Devolve os problemas encontrados (vazio = ok). */
async function conferirPagina(page: Page, status: number, erros: string[]): Promise<string[]> {
  const problemas: string[] = [];
  if (status >= 400) problemas.push(`resposta ${status}`);
  for (const e of erros) problemas.push(`erro de página: ${e}`);

  const dados = await page.evaluate(() => ({
    h1: document.querySelectorAll('h1').length,
    titulo: document.title,
    texto: document.body.innerText,
  }));
  if (dados.h1 !== 1) problemas.push(`${dados.h1} <h1> (deveria ser 1)`);
  if (!dados.titulo.startsWith('Controle Financeiro')) {
    problemas.push(`<title> "${dados.titulo}" não começa por "Controle Financeiro"`);
  }
  for (const suspeito of TEXTOS_SUSPEITOS) {
    if (dados.texto.includes(suspeito)) problemas.push(`texto "${suspeito}" no corpo`);
  }
  return problemas;
}

test('rastreia os links internos sem erro de página, console ou texto vazado', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(300_000);
  const origem = new URL(baseURL ?? 'http://127.0.0.1:4193').origin;
  const fila: URL[] = [new URL('/', origem)];
  const vistas = new Set<string>();
  const mesesPorRota = new Map<string, number>();
  const problemas: string[] = [];

  // Erros da página atual, preenchidos pelos ouvintes e lidos ao fim de cada carga.
  let erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const origemMsg = msg.location().url;
    if (IGNORADOS_NO_CONSOLE.some((re) => re.test(origemMsg) || re.test(msg.text()))) return;
    erros.push(`console: ${msg.text()}${origemMsg ? ` (${origemMsg})` : ''}`);
  });

  while (fila.length > 0 && vistas.size < LIMITE_PAGINAS) {
    const url = fila.shift()!;
    const chave = chaveDe(url);
    if (vistas.has(chave)) continue;

    const temMes = url.searchParams.has('mes');
    if (temMes) {
      const n = mesesPorRota.get(url.pathname) ?? 0;
      if (n >= LIMITE_MESES_POR_ROTA) continue;
      mesesPorRota.set(url.pathname, n + 1);
    }
    vistas.add(chave);

    erros = [];
    const resposta = await page.goto(url.href);
    const status = resposta?.status() ?? 0;
    for (const p of await conferirPagina(page, status, erros)) {
      problemas.push(`${chave}: ${p}`);
    }

    for (const link of await linksDaPagina(page)) {
      if (link.baixa) continue;
      const destino = new URL(link.href);
      if (destino.origin !== origem || !ehNavegacao(destino)) continue;
      destino.hash = '';
      if (!vistas.has(chaveDe(destino))) fila.push(destino);
    }
  }

  console.log(`rastreador: ${vistas.size} páginas visitadas`);
  // Ao menos o suficiente para dizer que o rastreador andou de verdade.
  expect(vistas.size, 'páginas visitadas').toBeGreaterThanOrEqual(10);
  expect(problemas, `problemas encontrados em ${vistas.size} páginas`).toEqual([]);
});

test('rotas inexistentes devolvem a página de erro 404, com o menu', async ({ page }) => {
  const rotas = ['/nao-existe', '/gastos/id-que-nao-existe', '/cartoes/x/faturas/2026-13'];
  for (const rota of rotas) {
    const resposta = await page.goto(rota);
    expect(resposta?.status(), rota).toBe(404);
    await expect(page.getByRole('heading', { level: 1 }), rota).toHaveText('Página não encontrada');
    await expect(page.getByRole('navigation', { name: 'Seções do site' }), rota).toBeVisible();
    await expect(page.getByTestId('codigo-erro'), rota).toContainText('Código 404');
    await expect(page, rota).toHaveTitle('Controle Financeiro · Página não encontrada');
  }
});

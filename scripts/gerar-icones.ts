/**
 * Gera os ícones PNG do app instalado (PWA) a partir de static/favicon.svg, renderizando o SVG
 * no Chromium do Playwright. Os PNG ficam versionados em static/icons/; rode `pnpm icones`
 * só quando mudar o favicon. Use PW_CHROMIUM_PATH se o Chromium do Playwright não estiver instalado.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
const PASTA = join(RAIZ, 'static', 'icons');
const svg = readFileSync(join(RAIZ, 'static', 'favicon.svg'), 'utf8');

const FUNDO = '<rect width="32" height="32" fill="#1f6b57"/>';
if (!svg.includes(FUNDO)) throw new Error('favicon.svg mudou: ajuste o FUNDO em gerar-icones.ts');

// Ícone "maskable": o fundo vai até a borda e o glifo fica encolhido na zona segura (círculo de 80%),
// para o sistema poder recortar em qualquer forma sem cortar as barras.
const interno = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const glifo = interno.replace(FUNDO, '');
const svgMascara = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${FUNDO}<g transform="translate(16 16) scale(0.72) translate(-16 -16)">${glifo}</g></svg>`;

const alvos = [
  { arquivo: 'icon-192.png', tamanho: 192, fonte: svg },
  { arquivo: 'icon-512.png', tamanho: 512, fonte: svg },
  { arquivo: 'icon-512-maskable.png', tamanho: 512, fonte: svgMascara },
  { arquivo: 'apple-touch-icon.png', tamanho: 180, fonte: svg },
];

mkdirSync(PASTA, { recursive: true });
const navegador = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
});
try {
  for (const alvo of alvos) {
    const pagina = await navegador.newPage({
      viewport: { width: alvo.tamanho, height: alvo.tamanho },
      deviceScaleFactor: 1,
    });
    const comTamanho = alvo.fonte.replace(
      '<svg ',
      `<svg width="${alvo.tamanho}" height="${alvo.tamanho}" `,
    );
    await pagina.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${comTamanho}</body></html>`,
    );
    await pagina.screenshot({
      path: join(PASTA, alvo.arquivo),
      omitBackground: true,
      clip: { x: 0, y: 0, width: alvo.tamanho, height: alvo.tamanho },
    });
    await pagina.close();
    console.log(`Gerado static/icons/${alvo.arquivo} (${alvo.tamanho}px)`);
  }
} finally {
  await navegador.close();
}

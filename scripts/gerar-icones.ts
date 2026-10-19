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

// O favicon é um quadrado azul arredondado com uma carteira branca (o mesmo logo do menu).
const COR = '#2f5bea';
const FUNDO = `<rect width="32" height="32" rx="7" fill="${COR}"/>`;
if (!svg.includes(FUNDO)) throw new Error('favicon.svg mudou: ajuste o FUNDO em gerar-icones.ts');

// Só o desenho (sem o fundo), para reaproveitar nos ícones de outros formatos.
const interno = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const glifo = interno.replace(FUNDO, '');
// Quadrado cheio, sem cantos: o "maskable" e o ícone da Apple (que não aceita transparência).
const QUADRADO = `<rect width="32" height="32" fill="${COR}"/>`;
// Ícone "maskable": o fundo vai até a borda e o desenho fica encolhido na zona segura (círculo de 80%),
// para o sistema poder recortar em qualquer forma sem cortar a carteira.
const svgMascara = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${QUADRADO}<g transform="translate(16 16) scale(0.8) translate(-16 -16)">${glifo}</g></svg>`;
const svgCheio = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${QUADRADO}${glifo}</svg>`;

const alvos = [
  { arquivo: 'icon-192.png', tamanho: 192, fonte: svg },
  { arquivo: 'icon-512.png', tamanho: 512, fonte: svg },
  { arquivo: 'icon-512-maskable.png', tamanho: 512, fonte: svgMascara },
  { arquivo: 'apple-touch-icon.png', tamanho: 180, fonte: svgCheio },
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

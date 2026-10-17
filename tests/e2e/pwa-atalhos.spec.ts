/**
 * App instalável, tema e atalhos de teclado no navegador. Não muda dados: só lê telas e
 * usa o tema salvo neste navegador (localStorage) e o diálogo de ajuda.
 */
import { expect, test } from '@playwright/test';

test('manifest válido, com ícones PNG acessíveis', async ({ page }) => {
  const resposta = await page.request.get('/manifest.webmanifest');
  expect(resposta.ok()).toBe(true);
  const manifest = await resposta.json();
  expect(manifest.name).toBe('Controle Financeiro');
  expect(manifest.short_name).toBe('Finanças');
  expect(manifest.lang).toBe('pt-BR');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

  for (const icone of manifest.icons as { src: string }[]) {
    const imagem = await page.request.get(icone.src);
    expect(imagem.status(), icone.src).toBe(200);
    expect(imagem.headers()['content-type'], icone.src).toContain('image/png');
  }

  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test('service worker é registrado', async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
    )
    .toBeGreaterThanOrEqual(1);
});

test('N abre o novo gasto com o valor já selecionado para digitar', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/\/gastos#novo$/);
  await expect(page.locator('#novo input[name="valor"]')).toBeFocused();
});

test('? abre a ajuda de atalhos e Esc fecha', async ({ page }) => {
  await page.goto('/');
  const ajuda = page.getByRole('dialog', { name: 'Atalhos de teclado' });
  await expect(ajuda).toBeHidden();
  await page.keyboard.press('?');
  await expect(ajuda).toBeVisible();
  await expect(ajuda.getByText('Novo gasto')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ajuda).toBeHidden();
});

test('atalhos não disparam ao digitar em um campo', async ({ page }) => {
  await page.goto('/gastos');
  const descricao = page.locator('#novo').getByLabel('Descrição');
  await descricao.click();
  await page.keyboard.type('nrbp?');
  await expect(descricao).toHaveValue('nrbp?');
  await expect(page).toHaveURL(/\/gastos$/);
  await expect(page.getByRole('dialog', { name: 'Atalhos de teclado' })).toBeHidden();
});

test('tema escuro salvo aplica após recarregar', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('tema', 'escuro'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.evaluate(() => localStorage.removeItem('tema'));
  await page.reload();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});

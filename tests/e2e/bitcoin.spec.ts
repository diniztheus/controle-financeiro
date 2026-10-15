/**
 * Bitcoin no navegador: preço do dia, compra, posição, conversor, lixeira e busca de preço.
 * Os testes rodam em sequência no mesmo banco temporário (ver playwright.config.ts).
 */
import { expect, test } from '@playwright/test';

test('preço do dia, compra e posição com preço médio', async ({ page }) => {
  await page.goto('/bitcoin');
  await expect(page.getByRole('heading', { level: 1, name: 'Bitcoin' })).toBeVisible();
  await page.locator('#p-preco').fill('400.000,00');
  await page.getByRole('button', { name: 'Salvar preço do dia' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Preço do dia salvo.' })).toBeVisible();
  await expect(page.getByTestId('preco-ref')).toContainText('400.000,00');

  const registrar = page.locator('form[action="?/registrar"]');
  await registrar.locator('#b-sats').fill('100000');
  await registrar.locator('#b-valor').fill('400,00');
  await registrar.locator('#b-nota').fill('Corretora e2e');
  await registrar.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Compra de 100.000 sats registrada.' }),
  ).toBeVisible();
  await expect(page.getByTestId('total-sats')).toContainText('100.000 sats');
  await expect(page.getByTestId('valor-atual')).toContainText('400,00');
  await expect(page.getByTestId('preco-medio')).toContainText('400.000,00');
  await expect(page.getByTestId('movimentos')).toContainText('Corretora e2e');
  // Com movimento, o gráfico aparece (role=img); a tabela tem os mesmos números.
  await expect(page.getByRole('img', { name: /Evolução da posição/ })).toBeVisible();
  // Depois de registrar, quantidade e valor são limpos.
  await expect(registrar.locator('#b-sats')).toHaveValue('');
});

test('venda maior que o saldo de sats é recusada', async ({ page }) => {
  await page.goto('/bitcoin');
  const registrar = page.locator('form[action="?/registrar"]');
  await registrar.getByLabel('Venda', { exact: true }).check();
  await registrar.locator('#b-sats').fill('999999999');
  await registrar.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(registrar.locator('.err').first()).toBeVisible();
  await expect(page.getByTestId('total-sats')).toContainText('100.000 sats');
});

test('conversor sats e reais usa o preço do dia', async ({ page }) => {
  await page.goto('/bitcoin');
  await page.locator('#cv-sats').fill('50000');
  await expect(page.getByRole('status').filter({ hasText: 'valem' })).toContainText('200,00');

  // Digitar em reais esvazia o campo de sats: só um dos dois vale por vez.
  await page.locator('#cv-reais').fill('100');
  await expect(page.locator('#cv-sats')).toHaveValue('');
  await expect(page.getByRole('status').filter({ hasText: 'compram' })).toContainText(
    '25.000 sats',
  );
});

test('conversor funciona sem JavaScript, pela URL', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/bitcoin?sats=50000');
  await expect(page.getByRole('status').filter({ hasText: 'valem' })).toContainText('200,00');
  await ctx.close();
});

test('remover um movimento, ver na lixeira e restaurar', async ({ page }) => {
  await page.goto('/bitcoin');
  await page
    .getByTestId('movimentos')
    .getByRole('button', { name: /para a lixeira/ })
    .first()
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Movimento mandado para a lixeira.' }),
  ).toBeVisible();
  await expect(page.getByTestId('total-sats')).toHaveText(/^\s*0 sats\b/);
  await expect(page.getByTestId('lixeira-bitcoin')).toContainText('Compra');

  await page.getByTestId('lixeira-bitcoin').getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Movimento restaurado.' })).toBeVisible();
  await expect(page.getByTestId('movimentos')).toContainText('Corretora e2e');
});

test('buscar preço mostra uma mensagem clara, com ou sem internet', async ({ page }) => {
  await page.goto('/bitcoin');
  await page.getByRole('button', { name: 'Buscar preço agora' }).click();
  await expect(page.locator('form.busca p').first()).toBeVisible({ timeout: 20_000 });
});

test('celular: sem rolagem lateral', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/bitcoin');
  const cabe = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(cabe).toBe(true);
});

test('a tela inicial mostra o bitcoin na composição do patrimônio', async ({ page }) => {
  await page.goto('/');
  const razao = page.getByLabel('Composição do patrimônio');
  await expect(razao).toContainText('Bitcoin');
  await expect(razao).toContainText('ao último preço informado');
});

// Banco compartilhado: o bitcoin que sobrar contaria no patrimônio dos outros testes.
test('limpeza: manda os movimentos restantes para a lixeira', async ({ page }) => {
  await page.goto('/bitcoin');
  const remover = page.getByTestId('movimentos').getByRole('button', { name: /para a lixeira/ });
  while ((await remover.count()) > 0) {
    await remover.first().click();
    await expect(page.getByRole('status').filter({ hasText: 'lixeira' })).toBeVisible();
    await page.goto('/bitcoin');
  }
  await expect(page.getByTestId('total-sats')).toHaveText(/^\s*0 sats\b/);
});

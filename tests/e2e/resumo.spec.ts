import { expect, test } from '@playwright/test';

// 2017 é um mês que nenhum outro teste usa: sem dados, o resumo sai todo zerado.
test('resumo de um mês sem dados mostra o título e os cartões zerados', async ({ page }) => {
  const resposta = await page.goto('/resumo/2017-03');
  expect(resposta?.status()).toBe(200);
  await expect(page).toHaveTitle('Controle Financeiro · Resumo de março de 2017');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Resumo de março de 2017' }),
  ).toBeVisible();
  await expect(page.getByTestId('resumo-entradas')).toContainText('0,00');
  await expect(page.getByTestId('resumo-gastos')).toContainText('0,00');
  await expect(page.getByTestId('resumo-sobra')).toContainText('0,00');
  await expect(page.getByTestId('resumo-taxa')).toHaveText('—');
});

test('mês inválido no resumo dá 404', async ({ page }) => {
  const resposta = await page.goto('/resumo/2017-13');
  expect(resposta?.status()).toBe(404);
});

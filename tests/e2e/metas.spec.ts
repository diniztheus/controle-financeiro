/**
 * Metas no navegador: criar, guardar, retirar, concluir e mandar para a lixeira.
 * Os testes rodam em sequência no mesmo banco temporário. Dados de teste com prazo em 2017,
 * para não mexer nos outros testes; a meta concluída não tem valor mensal.
 */
import { expect, test } from '@playwright/test';

const META = 'Meta E2E';

test('criar meta com nome, valor e prazo', async ({ page }) => {
  await page.goto('/metas');
  await expect(page.getByRole('heading', { level: 1, name: 'Metas' })).toBeVisible();
  await expect(page.getByText('Nenhuma meta ainda')).toBeVisible();

  await page.getByLabel('Nome da meta').fill(META);
  await page.getByLabel('Valor da meta (R$)').fill('3.000,00');
  await page.getByLabel('Prazo', { exact: false }).fill('2017-07-31');
  await page.getByRole('button', { name: 'Criar meta' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'criada.' })).toContainText(
    `Meta "${META}" criada.`,
  );
  await expect(page.getByTestId('lista-metas')).toContainText(META);
});

test('nome repetido é recusado com a mensagem no campo', async ({ page }) => {
  await page.goto('/metas');
  await page.getByLabel('Nome da meta').fill(META.toUpperCase());
  await page.getByLabel('Valor da meta (R$)').fill('100,00');
  await page.getByRole('button', { name: 'Criar meta' }).click();
  await expect(page.getByText(`Já existe a meta "${META}".`)).toBeVisible();
});

test('guardar e retirar pelo detalhe, com recusa de retirada maior', async ({ page }) => {
  await page.goto('/metas');
  await page.getByTestId('lista-metas').getByRole('link').filter({ hasText: META }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: META })).toBeVisible();
  await expect(page.getByText('não mexe em conta', { exact: false }).first()).toBeVisible();

  await page.getByLabel('Valor (R$)').fill('1.000,00');
  await page.getByLabel('Nota', { exact: false }).fill('Primeiro depósito');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toContainText(
    'R$ 1.000,00',
  );
  await expect(page.getByTestId('guardado')).toContainText('1.000,00');

  await page.getByRole('radio', { name: 'Retirar' }).check({ force: true });
  await page.getByLabel('Valor (R$)').fill('5.000,00');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText('Só há', { exact: false })).toBeVisible();
  await expect(page.getByTestId('guardado')).toContainText('1.000,00');
});

test('mandar para a lixeira e restaurar', async ({ page }) => {
  await page.goto('/metas');
  await page.getByTestId('lista-metas').getByRole('link').filter({ hasText: META }).first().click();
  await page.getByRole('button', { name: 'Mandar para a lixeira' }).click();
  await page.getByRole('button', { name: 'Sim, mandar para a lixeira' }).click();
  await expect(page).toHaveURL(/\/metas$/);
  // Era a única meta: a lista some (ou, havendo outras, não a mostra mais).
  await expect(page.getByTestId('lista-metas').filter({ hasText: META })).toHaveCount(0);

  await page.goto('/lixeira');
  await expect(page.getByTestId('lixeira-metas')).toContainText(META);
  await page.getByTestId('lixeira-metas').getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'restaurada' })).toContainText(META);
});

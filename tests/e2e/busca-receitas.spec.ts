/**
 * Busca de receitas e exportação de receitas, no navegador. O banco é compartilhado: as receitas
 * de teste ficam em 2019 (fora do painel dos outros testes) e nada vai para a lixeira.
 */
import { expect, test, type Page } from '@playwright/test';

const DESCRICAO = 'Receita Busca e2e';

/** Seletor Gastos | Receitas da própria busca (o menu do site também tem um link "Receitas"). */
const abas = (page: Page) => page.getByRole('navigation', { name: 'Procurar em' });
const PERIODO = 'de=2019-01-01&ate=2019-12-31';

test('lançar receitas de teste para a busca', async ({ page }) => {
  await page.goto('/receitas?mes=2019-06');
  const form = page.locator('#nova');

  await form.getByLabel('Valor (R$)').fill('4.200,00');
  await form.getByLabel('Descrição').fill(`${DESCRICAO} salário`);
  await form.getByLabel('Data', { exact: true }).fill('2019-06-05');
  await form.getByText('Salário', { exact: true }).click();
  await form.getByRole('button', { name: 'Lançar receita' }).click();
  await expect(page.getByTestId('receita-lancada')).toContainText('R$ 4.200,00');

  await form.getByLabel('Valor (R$)').fill('150,00');
  await form.getByLabel('Descrição').fill(`${DESCRICAO} freela`);
  await form.getByLabel('Data', { exact: true }).fill('2019-06-20');
  await form.getByText('Freelance', { exact: true }).click();
  await form.getByRole('button', { name: 'Lançar receita' }).click();
  await expect(page.getByTestId('receita-lancada')).toContainText('R$ 150,00');
});

test('busca de receitas: totais, contagem e link para a receita', async ({ page }) => {
  await page.goto(`/busca?tipo=receitas&q=${encodeURIComponent(DESCRICAO)}&${PERIODO}`);
  await expect(abas(page).getByRole('link', { name: 'Receitas' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByTestId('total-recebido')).toContainText('4.350,00');
  await expect(page.getByTestId('total-previsto')).toContainText('0,00');
  await expect(page.getByTestId('contagem')).toContainText('2 receitas');
  await expect(page.getByTestId('resultados')).toContainText(`${DESCRICAO} salário`);
  await expect(page.getByTestId('resultados')).toContainText(`${DESCRICAO} freela`);

  await page
    .getByTestId('resultados')
    .getByRole('link', { name: new RegExp(`${DESCRICAO} freela`) })
    .click();
  await expect(page).toHaveURL(/\/receitas\/[^/]+$/);
});

test('pelo formulário, sem JavaScript: valor mínimo e situação', async ({ page }) => {
  await page.goto('/busca?tipo=receitas');
  await page.locator('#b-q').fill(DESCRICAO);
  await page.locator('#b-de').fill('2019-01-01');
  await page.locator('#b-ate').fill('2019-12-31');
  await page.locator('#b-min').fill('3.000');
  await page.locator('#b-situacao').selectOption({ label: 'Recebidas' });
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();

  await expect(page.getByTestId('total-recebido')).toContainText('4.200,00');
  await expect(page.getByTestId('contagem')).toContainText('1 receita');
  await expect(page.getByTestId('resultados')).not.toContainText(`${DESCRICAO} freela`);
  await expect(page.locator('input[name="tipo"]')).toHaveValue('receitas');
  await expect(page.getByRole('link', { name: 'Limpar filtros' })).toHaveAttribute(
    'href',
    /tipo=receitas/,
  );
});

test('troca entre gastos e receitas pelo seletor', async ({ page }) => {
  await page.goto(`/busca?q=${encodeURIComponent(DESCRICAO)}&${PERIODO}`);
  await expect(abas(page).getByRole('link', { name: 'Gastos' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByTestId('resultados')).toHaveCount(0);

  await abas(page).getByRole('link', { name: 'Receitas' }).click();
  await expect(page).toHaveURL(/\/busca\?tipo=receitas$/);
  await expect(page.getByLabel('Situação')).toBeVisible();
  await expect(page.getByLabel('Pago com')).toHaveCount(0);

  await abas(page).getByRole('link', { name: 'Gastos' }).click();
  await expect(page).toHaveURL(/\/busca$/);
  await expect(page.getByLabel('Pago com')).toBeVisible();
});

test('situação inválida aparece no campo, sem derrubar a página', async ({ page }) => {
  await page.goto('/busca?tipo=receitas&situacao=talvez');
  await expect(page.locator('#b-situacao-erro')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Buscar lançamentos' })).toBeVisible();
});

test('exportar receitas: CSV com cabeçalhos seguros, JSON e tipo inválido', async ({ page }) => {
  await page.goto(`/busca?tipo=receitas&q=${encodeURIComponent(DESCRICAO)}&${PERIODO}`);
  const csv = await page.getByRole('link', { name: 'Exportar CSV' }).getAttribute('href');
  expect(csv).toMatch(/\/relatorios\/exportar\?de=2019-01&ate=2019-12&formato=csv&tipo=receitas$/);

  const resposta = await page.request.get(new URL(csv!, page.url()).toString());
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()['content-disposition']).toContain('receitas-2019-01-a-2019-12.csv');
  expect(resposta.headers()['content-type']).toContain('text/csv');
  expect(resposta.headers()['x-content-type-options']).toBe('nosniff');
  const texto = await resposta.text();
  expect(texto.startsWith('﻿Data;Descrição;Categoria;Valor;Conta;Situação;Recorrente')).toBe(true);
  expect(texto).toContain(`${DESCRICAO} freela`);
  expect(texto).toContain(';150,00;');

  const json = await page.request.get(
    '/relatorios/exportar?de=2019-01&ate=2019-12&formato=json&tipo=receitas',
  );
  expect(json.status()).toBe(200);
  expect(await json.text()).toContain('"valor": "150.00"');

  const invalido = await page.request.get(
    '/relatorios/exportar?de=2019-01&ate=2019-12&formato=csv&tipo=xml',
  );
  expect(invalido.status()).toBe(400);
  expect(await invalido.text()).toContain('Tipo inválido');

  // Sem `tipo`, a exportação continua sendo de gastos.
  const gastos = await page.request.get('/relatorios/exportar?de=2019-01&ate=2019-12&formato=csv');
  expect(gastos.status()).toBe(200);
  expect(gastos.headers()['content-disposition']).toContain('lancamentos-2019-01-a-2019-12.csv');
});

test('relatórios oferece a exportação de receitas', async ({ page }) => {
  await page.goto('/relatorios');
  const link = page.getByRole('link', { name: 'Exportar receitas (CSV)' });
  await expect(link).toHaveAttribute('href', /tipo=receitas/);
});

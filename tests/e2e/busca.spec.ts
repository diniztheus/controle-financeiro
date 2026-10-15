/**
 * Busca de lançamentos, exportação e limite por mês, no navegador.
 * Os testes rodam em sequência no mesmo banco temporário (ver playwright.config.ts).
 *
 * Os gastos de teste são lançados em março de 2019, fora do mês atual e dos relatórios
 * recentes: assim não mexem no painel dos testes seguintes. Não são mandados para a lixeira
 * (lá eles atrapalhariam os "Restaurar" do núcleo).
 */
import { expect, test, type Page } from '@playwright/test';

const CONTA = 'Conta Busca e2e';
const MERCADO = 'Mercado Busca e2e';
const PADARIA = 'Padaria Busca e2e';
const DE = '2019-01-01';
const ATE = '2019-12-31';
const PERIODO = `de=${DE}&ate=${ATE}`;

async function criarConta(page: Page, nome: string) {
  await page.goto('/contas');
  await page.getByLabel('Nome', { exact: true }).fill(nome);
  await page.getByLabel('Saldo de hoje (R$)').fill('0');
  await page.getByRole('button', { name: 'Cadastrar conta' }).click();
  await expect(page.getByRole('status')).toContainText(`Conta "${nome}" cadastrada.`);
}

async function lancar(
  page: Page,
  valor: string,
  descricao: string,
  categoria: string,
  data: string,
  conta?: string,
) {
  await page.goto('/gastos');
  const form = page.locator('#novo');
  await form.getByLabel('Valor (R$)').fill(valor);
  await form.getByLabel('Descrição').fill(descricao);
  await form.getByLabel('Data', { exact: true }).fill(data);
  await form.getByText(categoria, { exact: true }).click();
  if (conta) await form.getByLabel('Pago com').selectOption({ label: conta });
  await form.getByRole('button', { name: 'Lançar gasto' }).click();
  await expect(page.getByTestId('gasto-lancado')).toContainText('lançado');
}

test('busca por texto, valor e origem, com total e contagem', async ({ page }) => {
  await criarConta(page, CONTA);
  await lancar(page, '150', MERCADO, 'Mercado', '2019-03-10', CONTA);
  await lancar(page, '12,50', PADARIA, 'Alimentação', '2019-03-12');

  await page.goto(`/busca?q=Busca+e2e&${PERIODO}`);
  await expect(page.getByTestId('total-busca')).toContainText('162,50');
  await expect(page.getByTestId('contagem')).toContainText('2 lançamentos');
  await expect(page.getByTestId('resultados')).toContainText(MERCADO);
  await expect(page.getByTestId('resultados')).toContainText(PADARIA);

  // Pelo formulário, sem JavaScript: texto, período e valor mínimo.
  await page.goto('/busca');
  await page.locator('#b-q').fill('Busca e2e');
  await page.locator('#b-de').fill(DE);
  await page.locator('#b-ate').fill(ATE);
  await page.locator('#b-min').fill('100');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByTestId('total-busca')).toContainText('150,00');
  await expect(page.getByTestId('resultados')).not.toContainText(PADARIA);
  await expect(page.getByRole('link', { name: 'Limpar filtros' })).toBeVisible();

  await page.goto(`/busca?q=Busca+e2e&${PERIODO}&origem=${encodeURIComponent(CONTA)}`);
  await expect(page.getByTestId('contagem')).toContainText('1 lançamento');
  await expect(page.getByTestId('resultados')).toContainText(MERCADO);
  await expect(page.getByTestId('resultados')).not.toContainText(PADARIA);

  // Limpar filtros volta à busca sem parâmetros.
  await page.getByRole('link', { name: 'Limpar filtros' }).click();
  await expect(page).toHaveURL(/\/busca$/);
  await expect(page.locator('#b-q')).toHaveValue('');
});

test('o resultado leva ao gasto', async ({ page }) => {
  await page.goto(`/busca?q=Padaria+Busca&${PERIODO}`);
  await page
    .getByTestId('resultados')
    .getByRole('link', { name: /Padaria Busca e2e/ })
    .click();
  await expect(page).toHaveURL(/\/gastos\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Editar gasto' })).toBeVisible();
});

test('filtros inválidos aparecem por campo, sem derrubar a página', async ({ page }) => {
  await page.goto('/busca?min=abc');
  await expect(page.locator('#b-min-erro')).toContainText('valor inválido');
  await expect(page.getByRole('heading', { level: 1, name: 'Buscar lançamentos' })).toBeVisible();

  await page.goto('/busca?de=2026-10-20&ate=2026-10-01');
  await expect(page.locator('#b-ate-erro')).toContainText('antes da inicial');
});

test('exportar os resultados: CSV e JSON com cabeçalhos seguros', async ({ page }) => {
  await page.goto(`/busca?q=Busca+e2e&${PERIODO}`);
  const csv = await page.getByRole('link', { name: 'Exportar CSV' }).getAttribute('href');
  expect(csv).toMatch(/\/relatorios\/exportar\?de=2019-01&ate=2019-12&formato=csv$/);

  const resposta = await page.request.get(new URL(csv!, page.url()).toString());
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()['content-disposition']).toContain('attachment');
  expect(resposta.headers()['content-type']).toContain('text/csv');
  expect(resposta.headers()['x-content-type-options']).toBe('nosniff');
  const texto = await resposta.text();
  expect(texto.startsWith('﻿')).toBe(true);
  expect(texto).toContain(MERCADO);

  const json = await page.request.get('/relatorios/exportar?de=2026-13&ate=2026-10&formato=json');
  expect(json.status()).toBe(400);
  expect(await json.text()).toContain('Período inválido');

  const longo = await page.request.get('/relatorios/exportar?de=1900-01&ate=2026-10&formato=csv');
  expect(longo.status()).toBe(400);

  const formato = await page.request.get('/relatorios/exportar?de=2026-01&ate=2026-02&formato=xml');
  expect(formato.status()).toBe(400);
  expect(await formato.text()).toContain('Formato inválido');
});

test('limite deste mês e limite padrão na home', async ({ page }) => {
  // Só este mês: vale para o mês atual e aparece como "deste mês".
  await page.goto('/');
  await page.getByRole('link', { name: 'Definir limite' }).click();
  await page.locator('#limite-valor').fill('800,00');
  await page.getByLabel('Só este mês').check();
  await page.getByRole('button', { name: 'Salvar limite' }).click();
  await expect(page.getByRole('status')).toContainText('Limite deste mês salvo.');
  await expect(page.getByTestId('limite-tipo')).toContainText('Limite deste mês');
  await expect(page.getByTestId('limite')).toContainText('800,00');

  // Padrão: todos os meses. O mês tem ajuste próprio, então o de 800 continua valendo.
  await page.getByRole('link', { name: 'Alterar limite' }).click();
  await expect(page.getByLabel('Só este mês')).toBeChecked();
  await page.getByLabel('Todos os meses (padrão)').check();
  await page.locator('#limite-valor').fill('500');
  await page.getByRole('button', { name: 'Salvar limite' }).click();
  await expect(page.getByRole('status')).toContainText('Limite salvo.');
  await expect(page.getByTestId('limite')).toContainText('800,00');

  // Limpeza: zera o ajuste do mês (o mês volta ao padrão) e depois remove o padrão.
  await page.getByRole('link', { name: 'Alterar limite' }).click();
  await page.getByLabel('Só este mês').check();
  await page.locator('#limite-valor').fill('');
  await page.getByRole('button', { name: 'Salvar limite' }).click();
  await expect(page.getByRole('status')).toContainText('Limite deste mês removido.');
  await expect(page.getByTestId('limite-tipo')).toContainText('Limite padrão');
  await page.getByRole('link', { name: 'Alterar limite' }).click();
  await page.getByLabel('Todos os meses (padrão)').check();
  await page.locator('#limite-valor').fill('');
  await page.getByRole('button', { name: 'Salvar limite' }).click();
  await expect(page.getByRole('status')).toContainText('Limite removido.');
  await expect(page.getByRole('link', { name: 'Definir limite' })).toBeVisible();
});

// Banco compartilhado: a conta de teste sai da lista (vai para a lixeira de contas).
test('limpeza: manda a conta de teste para a lixeira', async ({ page }) => {
  await page.goto('/contas');
  await page
    .getByTestId('lista-contas')
    .locator('li', { hasText: CONTA })
    .getByRole('link', { name: 'Editar' })
    .click();
  await page.getByRole('button', { name: 'Mandar para a lixeira' }).click();
  await page.getByRole('button', { name: 'Sim, mandar para a lixeira' }).click();
  await expect(page).toHaveURL(/\/contas$/);
  await expect(page.getByTestId('lista-contas').locator('li', { hasText: CONTA })).toHaveCount(0);
});

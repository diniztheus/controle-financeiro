/**
 * Fluxo de caixa na tela: a home mostra entradas e sobra do mês (ou "Nenhuma receita neste mês"),
 * e /relatorios traz a seção "Receitas e despesas" com gráfico, tabela mês a mês e receitas por
 * categoria.
 *
 * Este arquivo não cria receitas: o banco é compartilhado e o mês atual tem que ficar sem
 * receitas para o painel. Os números de receita são testados nos testes de unidade e no
 * receitas.spec.ts (que usa 2019).
 */
import { expect, test } from '@playwright/test';

test('home sem receitas no mês atual mostra a linha discreta com link para receitas', async ({
  page,
}) => {
  await page.goto('/');
  const painel = page.getByTestId('painel-mes');
  await expect(painel.getByText('Nenhuma receita neste mês.')).toBeVisible();
  await expect(painel.getByRole('link', { name: 'Lançar receita' })).toHaveAttribute(
    'href',
    '/receitas#nova',
  );
  await expect(page.getByTestId('entradas-mes')).toHaveCount(0);
  await expect(page.getByTestId('sobra-mes')).toHaveCount(0);
});

test('home continua sem rolagem lateral no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largura).toBeLessThanOrEqual(390);
});

test('relatórios: seção de receitas e despesas com gráfico, tabela e categorias', async ({
  page,
}) => {
  await page.goto('/relatorios?meses=12');
  const secao = page.getByRole('region', { name: 'Receitas e despesas' });
  await expect(secao).toBeVisible();

  // Gráfico e tabela existem juntos; sem nenhuma receita nem gasto no período, aparece o aviso.
  const grafico = secao.getByRole('img', { name: /Entradas e saídas de cada mês/ });
  const vazio = secao.getByText('Nenhuma receita nem gasto nestes meses');
  await expect(grafico.or(vazio)).toBeVisible();

  if (await grafico.isVisible()) {
    await expect(grafico).toHaveAttribute('aria-label', /Entradas e saídas de cada mês/);
    await expect(secao.getByText('Entradas', { exact: true }).first()).toBeVisible();
    await expect(secao.getByText('Saídas', { exact: true }).first()).toBeVisible();

    const tabela = secao.locator('table');
    await expect(tabela.getByRole('columnheader', { name: 'Taxa de poupança' })).toBeVisible();
    await expect(tabela.locator('tbody tr')).toHaveCount(12);
    await expect(tabela.locator('tfoot')).toContainText('Total do período');
    await expect(
      secao.getByRole('heading', { level: 3, name: 'Receitas por categoria' }),
    ).toBeVisible();
  }
});

test('relatórios: a tabela de fluxo rola dentro do próprio contêiner no celular', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/relatorios?meses=24');
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largura).toBeLessThanOrEqual(390);

  const secao = page.getByRole('region', { name: 'Receitas e despesas' });
  const tabela = secao.locator('table');
  if (await tabela.count()) {
    const contorno = await secao
      .locator('.rolagem')
      .first()
      .evaluate((el) => ({
        posicao: getComputedStyle(el).position,
        rolagem: getComputedStyle(el).overflowX,
      }));
    expect(contorno).toEqual({ posicao: 'relative', rolagem: 'auto' });
  }
});

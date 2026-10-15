/**
 * Relatórios no navegador: períodos, seções, gráficos com tabela alternativa e exportação.
 * O banco é compartilhado entre os testes: o gasto e a conta criados aqui vão para a lixeira
 * no último teste, para não mexer no patrimônio dos outros.
 */
import { expect, test } from '@playwright/test';

const CONTA = 'Relatório E2E';
const GASTO = 'Relatório e2e';

test('períodos pela URL, seções e sem rolagem lateral no celular', async ({ page }) => {
  await page.goto('/relatorios');
  await expect(page.getByRole('heading', { level: 1, name: 'Relatórios' })).toBeVisible();
  for (const titulo of [
    'Evolução do patrimônio',
    'Gastos por categoria nos meses',
    'Comparativo mês a mês',
    'Maiores gastos',
  ]) {
    await expect(page.getByRole('region', { name: titulo })).toBeVisible();
  }
  const periodo = page.getByRole('navigation', { name: 'Período dos relatórios' });
  await expect(periodo.getByRole('link', { name: '6', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );

  await periodo.getByRole('link', { name: '12', exact: true }).click();
  await expect(page).toHaveURL(/\/relatorios\?meses=12$/);
  await expect(periodo.getByRole('link', { name: '12', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );

  // Valor fora da lista volta ao padrão, sem erro.
  await page.goto('/relatorios?meses=999');
  await expect(
    page.getByRole('navigation', { name: 'Período dos relatórios' }).getByRole('link', {
      name: '6',
      exact: true,
    }),
  ).toHaveAttribute('aria-current', 'true');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/relatorios?meses=24');
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largura).toBeLessThanOrEqual(390);
});

test('gasto e conta criados pela tela aparecem nos relatórios', async ({ page }) => {
  await page.goto('/contas');
  await page.getByLabel('Nome', { exact: true }).fill(CONTA);
  await page.getByLabel('Saldo de hoje (R$)').fill('2.500,00');
  await page.getByRole('button', { name: 'Cadastrar conta' }).click();
  await expect(page.getByRole('status')).toContainText(`Conta "${CONTA}" cadastrada.`);

  await page.goto('/gastos');
  const form = page.locator('#novo');
  await form.getByLabel('Valor (R$)').fill('987,65');
  await form.getByLabel('Descrição').fill(GASTO);
  await form.getByText('Mercado', { exact: true }).click();
  await form.getByRole('button', { name: 'Lançar gasto' }).click();
  await expect(page.getByTestId('gasto-lancado')).toContainText('R$ 987,65');

  await page.goto('/relatorios?meses=12');
  const categorias = page.getByRole('region', { name: 'Gastos por categoria nos meses' });
  await expect(categorias.getByRole('row', { name: /Mercado/ })).toBeVisible();
  await expect(categorias.getByRole('row', { name: /Total do mês/ })).toBeVisible();

  const maiores = page.getByRole('region', { name: 'Maiores gastos' });
  await expect(maiores.getByRole('link', { name: new RegExp(GASTO) })).toBeVisible();
  await expect(maiores).toContainText('R$ 987,65');

  // Evolução: gráfico com resumo e tabela mês a mês (uma linha por mês do período).
  const evolucao = page.getByRole('region', { name: 'Evolução do patrimônio' });
  await expect(evolucao.getByRole('img', { name: /Patrimônio mês a mês/ })).toBeVisible();
  await evolucao.getByText('Ver os números mês a mês').click();
  await expect(evolucao.locator('tbody tr')).toHaveCount(12);

  // Comparativo: gráfico de barras e tabela com a variação.
  const comparativo = page.getByRole('region', { name: 'Comparativo mês a mês' });
  await expect(comparativo.getByRole('img', { name: /Gasto total de cada mês/ })).toBeVisible();
  await expect(comparativo.locator('tbody tr')).toHaveCount(12);
});

test('exportar leva o período escolhido', async ({ page }) => {
  await page.goto('/relatorios?meses=3');
  const csv = page.getByRole('link', { name: 'Exportar CSV' });
  await expect(csv).toHaveAttribute('href', /formato=csv/);
  await expect(csv).toHaveAttribute('href', /de=\d{4}-\d{2}&ate=\d{4}-\d{2}/);
  await expect(page.getByRole('link', { name: 'Exportar JSON' })).toHaveAttribute(
    'href',
    /formato=json/,
  );
  await expect(page.getByRole('link', { name: 'Buscar lançamentos' })).toHaveAttribute(
    'href',
    '/busca',
  );
});

// Limpeza: o gasto e a conta de teste vão para a lixeira, para o patrimônio voltar ao que era.
test('limpeza: manda o gasto e a conta de teste para a lixeira', async ({ page }) => {
  await page.goto('/relatorios?meses=24');
  const maiores = page.getByRole('region', { name: 'Maiores gastos' });
  const linkGasto = maiores.getByRole('link', { name: new RegExp(GASTO) });
  while ((await linkGasto.count()) > 0) {
    await linkGasto.first().click();
    await page.getByRole('button', { name: 'Mandar para a lixeira' }).click();
    await page.getByRole('button', { name: 'Sim, mandar para a lixeira' }).click();
    await expect(page.getByText('Gasto mandado para a lixeira.')).toBeVisible();
    await page.goto('/relatorios?meses=24');
  }

  await page.goto('/contas');
  const linha = page.getByTestId('lista-contas').locator('li', { hasText: CONTA });
  if ((await linha.count()) > 0) {
    await linha.getByRole('link', { name: 'Editar' }).click();
    await page.getByRole('button', { name: 'Mandar para a lixeira' }).click();
    await page.getByRole('button', { name: 'Sim, mandar para a lixeira' }).click();
    await expect(page).toHaveURL(/\/contas(\?.*)?$/);
  }
  await page.goto('/contas');
  await expect(page.locator('[data-testid="lista-contas"] li', { hasText: CONTA })).toHaveCount(0);
});

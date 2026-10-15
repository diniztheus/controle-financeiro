import { expect, test } from '@playwright/test';

test('a página inicial mostra o banco criado e o esquema em dia', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Controle Financeiro/);
  await expect(page.getByTestId('status')).toHaveAttribute('data-ok', 'sim');
  await expect(page.getByTestId('veredito')).toHaveText('Tudo ok');
  await expect(page.getByTestId('indicador-banco')).toContainText('Banco conectado');
  await expect(page.getByTestId('linha-tabelas')).toContainText('11');
  await expect(page.getByTestId('linha-migrations')).toContainText(/\d{4}_[a-z_]+/);
  await expect(page.getByTestId('caminho-banco')).toContainText('controle-financeiro-e2e');
  await expect(page.getByTestId('caminho-banco')).toContainText('financas.db');

  // Seções futuras aparecem desabilitadas.
  await expect(page.getByRole('link', { name: 'Painel' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'Gastos' })).toHaveCount(0);
});

for (const host of ['127.0.0.1', 'localhost']) {
  test(`backup pelo site funciona aberto em ${host}`, async ({ page, baseURL }) => {
    const url = new URL(baseURL!);
    url.hostname = host;
    await page.goto(url.href);
    await page.getByRole('button', { name: 'Fazer backup agora' }).click();
    await expect(page.getByTestId('backup-feito')).toContainText(
      /financas-\d{4}-\d{2}-\d{2}-\d{6}/,
    );
  });
}

test('formulário de outra origem e Host estranho são recusados', async ({ request }) => {
  const outraOrigem = await request.post('/?/backup', {
    headers: { origin: 'http://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
    data: '',
  });
  expect(outraOrigem.status()).toBe(403);
  const rebinding = await request.get('/', { headers: { host: 'evil.example:4173' } });
  expect(rebinding.status()).toBe(403);
});

test('backup sob demanda pelo site', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Fazer backup agora' }).click();
  await expect(page.getByTestId('backup-feito')).toContainText(/financas-\d{4}-\d{2}-\d{2}-\d{6}/);
  await expect(page.getByText('Nenhum backup ainda')).toHaveCount(0);
});

test('sem rolagem horizontal no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largura).toBeLessThanOrEqual(390);
  // Como na v3, o menu some no celular em vez de ficar cortado.
  await expect(page.getByRole('navigation', { name: 'Seções' })).toBeHidden();
  await expect(page.getByTestId('indicador-banco')).toBeVisible();
});

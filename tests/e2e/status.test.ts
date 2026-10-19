import { expect, test } from '@playwright/test';

test('a página de estado mostra o banco criado e o esquema em dia', async ({ page }) => {
  await page.goto('/sistema');

  await expect(page).toHaveTitle(/Controle Financeiro/);
  await expect(page.getByTestId('status')).toHaveAttribute('data-ok', 'sim');
  await expect(page.getByTestId('veredito')).toHaveText('Tudo ok');
  await expect(page.getByTestId('indicador-banco')).toContainText('Banco conectado');
  await expect(page.getByTestId('linha-tabelas')).toContainText('15');
  await expect(page.getByTestId('linha-migrations')).toContainText(/\d{4}_[a-z_]+/);
  await expect(page.getByTestId('caminho-banco')).toContainText('controle-financeiro-e2e');
  await expect(page.getByTestId('caminho-banco')).toContainText('financas.db');

  // Todas as seções do plano já existem: o menu tem link para cada uma e nada "em breve".
  for (const nome of ['Gastos', 'Receitas', 'Contas', 'Cartões', 'Bitcoin', 'Relatórios']) {
    await expect(page.getByRole('link', { name: nome, exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText('em breve', { exact: false })).toHaveCount(0);
});

for (const host of ['127.0.0.1', 'localhost']) {
  test(`backup pelo site funciona aberto em ${host}`, async ({ page, baseURL }) => {
    const url = new URL(baseURL!);
    url.hostname = host;
    url.pathname = '/sistema';
    await page.goto(url.href);
    await page.getByRole('button', { name: 'Fazer backup agora' }).click();
    await expect(page.getByTestId('backup-feito')).toContainText(
      /financas-\d{4}-\d{2}-\d{2}-\d{6}/,
    );
  });
}

test('formulário de outra origem e Host estranho são recusados', async ({ request }) => {
  const outraOrigem = await request.post('/sistema?/backup', {
    headers: { origin: 'http://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
    data: '',
  });
  expect(outraOrigem.status()).toBe(403);
  const rebinding = await request.get('/', { headers: { host: 'evil.example:4173' } });
  expect(rebinding.status()).toBe(403);
});

test('backup sob demanda pelo site', async ({ page }) => {
  await page.goto('/sistema');
  await page.getByRole('button', { name: 'Fazer backup agora' }).click();
  await expect(page.getByTestId('backup-feito')).toContainText(/financas-\d{4}-\d{2}-\d{2}-\d{6}/);
  await expect(page.getByText('Nenhum backup ainda')).toHaveCount(0);
});

test('sem rolagem horizontal no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const rota of ['/', '/gastos', '/contas', '/categorias', '/lixeira', '/sistema']) {
    await page.goto(rota);
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(largura, rota).toBeLessThanOrEqual(390);
  }
  // No celular as seções viram abas embaixo; o "+" abre a escolha entre gasto e receita
  // e o "Mais" mostra o resto das seções.
  await page.goto('/');
  const abas = page.getByRole('navigation', { name: 'Seções' });
  await expect(abas).toBeVisible();
  await abas.getByRole('button', { name: 'Novo lançamento' }).click();
  await expect(page.getByRole('link', { name: 'Novo gasto' }).last()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nova receita' }).last()).toBeVisible();
  await page.keyboard.press('Escape');
  await abas.getByRole('button', { name: 'Mais' }).click();
  await expect(page.locator('#folha-mais').getByRole('link', { name: 'Cartões' })).toBeVisible();
});

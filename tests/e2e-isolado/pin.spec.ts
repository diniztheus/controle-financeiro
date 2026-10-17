import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Servidor isolado: o PIN muda o acesso ao site inteiro. Cada teste termina sem PIN.
// Ordem importa (um arquivo, um worker): o teste de bloqueio fica por último.

async function definirPin(page: Page, pin: string) {
  await page.goto('/configuracoes');
  await page.locator('#d-novo').fill(pin);
  await page.locator('#d-confirmar').fill(pin);
  await page.getByRole('button', { name: 'Definir PIN' }).click();
  await expect(page.getByText('PIN definido. Esta sessão continua conectada.')).toBeVisible();
}

async function removerPin(page: Page, pinAtual: string) {
  await page.goto('/configuracoes');
  await page.locator('#r-atual').fill(pinAtual);
  await page.getByRole('button', { name: 'Remover PIN' }).click();
  await expect(page.getByText('PIN removido.')).toBeVisible();
}

async function entrarNaTela(page: Page, pin: string) {
  await page.locator('#pin').fill(pin);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function novoContexto(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  return { ctx, page: await ctx.newPage() };
}

test('definir PIN pede a senha em outra sessão e volta ao destino', async ({ browser }) => {
  const dono = await novoContexto(browser);
  await definirPin(dono.page, '1234');

  const visitante = await novoContexto(browser);
  await visitante.page.goto('/contas');
  await expect(visitante.page).toHaveURL(/\/pin\?voltar=/);
  await expect(visitante.page.getByRole('heading', { name: 'Controle Financeiro' })).toBeVisible();

  await entrarNaTela(visitante.page, '9999');
  await expect(visitante.page.getByText('PIN incorreto')).toBeVisible();

  await entrarNaTela(visitante.page, '1234');
  await expect(visitante.page).toHaveURL(/\/contas(\?|$)/);

  // Sair volta ao PIN.
  await visitante.page.getByRole('button', { name: 'Sair' }).click();
  await expect(visitante.page).toHaveURL(/\/pin$/);

  await visitante.ctx.close();
  await removerPin(dono.page, '1234');
  await dono.ctx.close();
});

test('alterar PIN derruba a sessão antiga e exige o novo', async ({ browser }) => {
  const dono = await novoContexto(browser);
  await definirPin(dono.page, '1234');

  await dono.page.locator('#a-atual').fill('1234');
  await dono.page.locator('#a-novo').fill('5678');
  await dono.page.locator('#a-confirmar').fill('5678');
  await dono.page.getByRole('button', { name: 'Alterar PIN' }).click();
  await expect(dono.page.getByText('PIN alterado. Esta sessão continua conectada.')).toBeVisible();

  // A sessão desta aba continua válida após a troca.
  await dono.page.goto('/contas');
  await expect(dono.page).toHaveURL(/\/contas(\?|$)/);

  const outra = await novoContexto(browser);
  await outra.page.goto('/contas');
  await expect(outra.page).toHaveURL(/\/pin/);
  await entrarNaTela(outra.page, '1234');
  await expect(outra.page.getByText('PIN incorreto')).toBeVisible();
  await entrarNaTela(outra.page, '5678');
  await expect(outra.page).toHaveURL(/\/contas(\?|$)/);

  await outra.ctx.close();
  await removerPin(dono.page, '5678');
  await dono.ctx.close();
});

test('voltar malicioso cai na página inicial', async ({ browser }) => {
  const dono = await novoContexto(browser);
  await definirPin(dono.page, '4321');

  const visitante = await novoContexto(browser);
  await visitante.page.goto('/pin?voltar=//evil.com');
  await entrarNaTela(visitante.page, '4321');
  await visitante.page.waitForURL((u) => u.pathname === '/');
  expect(new URL(visitante.page.url()).hostname).toBe('127.0.0.1');

  await visitante.ctx.close();
  await removerPin(dono.page, '4321');
  await dono.ctx.close();
});

test('cookie adulterado é recusado', async ({ browser }) => {
  const dono = await novoContexto(browser);
  await definirPin(dono.page, '1357');

  const visitante = await novoContexto(browser);
  const url = dono.page.url();
  await visitante.ctx.addCookies([{ name: 'cf_sessao', value: 'v1.9999999999999.00ff00ff', url }]);
  await visitante.page.goto('/contas');
  await expect(visitante.page).toHaveURL(/\/pin/);

  await visitante.ctx.close();
  await removerPin(dono.page, '1357');
  await dono.ctx.close();
});

test('remover PIN deixa o site livre de novo', async ({ browser }) => {
  const dono = await novoContexto(browser);
  await definirPin(dono.page, '2468');
  await removerPin(dono.page, '2468');

  const visitante = await novoContexto(browser);
  await visitante.page.goto('/contas');
  await expect(visitante.page).toHaveURL(/\/contas(\?|$)/);

  await visitante.ctx.close();
  await dono.ctx.close();
});

test('cinco erros bloqueiam a entrada por um tempo', async ({ browser }) => {
  test.setTimeout(120_000);
  const dono = await novoContexto(browser);
  await definirPin(dono.page, '1111');

  const visitante = await novoContexto(browser);
  await visitante.page.goto('/contas');
  for (let i = 0; i < 5; i++) {
    await entrarNaTela(visitante.page, '0000');
    await expect(visitante.page.getByText(/PIN incorreto|Muitas tentativas/)).toBeVisible();
  }
  await expect(visitante.page.getByText(/Muitas tentativas. Tente de novo em \d+ s/)).toBeVisible();

  // Espera o bloqueio de 30 s passar; depois o PIN certo entra e zera as tentativas.
  await visitante.page.waitForTimeout(31_000);
  await entrarNaTela(visitante.page, '1111');
  await expect(visitante.page).toHaveURL(/\/contas(\?|$)/);

  await visitante.ctx.close();
  await removerPin(dono.page, '1111');
  await dono.ctx.close();
});

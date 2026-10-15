/**
 * Cartões no navegador: cadastro, arquivar, faturas, pagar e desfazer pagamento.
 * Os testes rodam em sequência no mesmo banco temporário (ver playwright.config.ts).
 * Dados de teste sempre em 2019, para não mexer no mês atual; ao final, todas as faturas
 * criadas ficam pagas (dívida em aberto reduziria o patrimônio dos outros testes).
 */
import { expect, test, type Page } from '@playwright/test';

const CARTAO = 'Cartão E2E';

/** Id do cartão a partir da URL da página de detalhe (/cartoes/<id>). */
function idDoCartao(page: Page): string {
  return new URL(page.url()).pathname.split('/')[2]!;
}

async function abrirCartao(page: Page) {
  await page.goto('/cartoes');
  await page.getByRole('link', { name: CARTAO, exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: CARTAO })).toBeVisible();
}

test('cadastrar cartão com fechamento e vencimento', async ({ page }) => {
  await page.goto('/cartoes');
  await expect(page.getByRole('heading', { level: 1, name: 'Cartões' })).toBeVisible();
  await expect(page.getByText('Nenhum cartão ainda')).toBeVisible();
  await expect(
    page.getByText('se o vencimento é até o dia do fechamento', { exact: false }),
  ).toBeVisible();

  await page.getByLabel('Nome', { exact: true }).fill(CARTAO);
  await page.getByLabel('Limite (R$)').fill('5.000,00');
  await page.getByLabel('Dia do fechamento').fill('5');
  await page.getByLabel('Dia do vencimento').fill('15');
  await page.getByRole('button', { name: 'Cadastrar cartão' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'cadastrado.' })).toContainText(
    `Cartão "${CARTAO}" cadastrado.`,
  );
  const lista = page.getByTestId('lista-cartoes');
  await expect(lista).toContainText(CARTAO);
  await expect(lista).toContainText('Fecha dia 5 · vence dia 15');
  await expect(lista).toContainText('Limite');
});

test('nome repetido é recusado com a mensagem no campo', async ({ page }) => {
  await page.goto('/cartoes');
  await page.getByLabel('Nome', { exact: true }).fill(CARTAO.toUpperCase());
  await page.getByLabel('Dia do fechamento').fill('3');
  await page.getByLabel('Dia do vencimento').fill('10');
  await page.getByRole('button', { name: 'Cadastrar cartão' }).click();
  await expect(page.getByLabel('Nome', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(`Já existe o cartão "${CARTAO}".`)).toBeVisible();
});

test('editar mostra o aviso de compras novas; arquivar e desarquivar', async ({ page }) => {
  await abrirCartao(page);
  await expect(
    page.getByText('Mudar fechamento ou vencimento vale só para compras novas'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Arquivar cartão' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cartão arquivado' })).toBeVisible();
  await page.goto('/cartoes');
  await expect(page.getByTestId('lista-arquivados')).toContainText(CARTAO);
  // Sem cartão ativo, a lista some e aparece o estado vazio.
  await expect(page.getByTestId('lista-cartoes')).toHaveCount(0);
  await expect(page.getByText('Nenhum cartão ainda')).toBeVisible();

  await page.getByTestId('lista-arquivados').getByRole('button', { name: 'Desarquivar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'de volta às listas' })).toBeVisible();
  await expect(page.getByTestId('lista-cartoes')).toContainText(CARTAO);
});

test('compra parcelada cai nas faturas dos meses certos', async ({ page }) => {
  await page.goto('/gastos');
  const form = page.locator('#novo');
  await form.getByLabel('Valor (R$)').fill('300,00');
  await form.getByLabel('Descrição').fill('Compra e2e');
  await form.getByText('Mercado', { exact: true }).click();
  await form.locator('input[name="data"]').fill('2019-03-10');
  await form.locator('input[name="meio"][value="cartao"]').check();
  await form.locator('select[name="cartao"]').selectOption({ label: CARTAO });
  await form.locator('input[name="parcelas"]').fill('3');
  await form.getByRole('button', { name: 'Lançar gasto' }).click();
  await expect(page.getByTestId('gasto-lancado')).toContainText('lançado');

  await abrirCartao(page);
  const faturas = page.getByTestId('faturas');
  // Compra de 10/03 com fechamento dia 5: a 1ª parcela cai em abril (vence 15/04).
  await expect(faturas).toContainText('Abril de 2019');
  await expect(faturas).toContainText('Maio de 2019');
  await expect(faturas).toContainText('Junho de 2019');
  await expect(faturas).not.toContainText('Março de 2019');
  await expect(faturas).toContainText('Vencida');
  await expect(faturas).toContainText('100,00');
});

test('fatura: marcar como paga, desfazer e a dívida do cartão', async ({ page }) => {
  await abrirCartao(page);
  await page.getByRole('link', { name: 'Abril de 2019' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: /Fatura de abril de 2019/ }),
  ).toBeVisible();
  await expect(page.getByText('Pagar a fatura não altera o saldo das contas.')).toBeVisible();
  await expect(page.getByText('Compra e2e')).toBeVisible();
  await expect(page.getByText('1/3')).toBeVisible();
  await expect(page.getByTestId('total-fatura')).toContainText('100,00');

  await page.getByRole('button', { name: 'Marcar como paga' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'marcada como paga' })).toBeVisible();
  await expect(page.getByTestId('situacao-fatura')).toHaveText('Paga');

  await page.getByRole('button', { name: 'Desfazer pagamento' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pagamento desfeito' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marcar como paga' })).toBeVisible();
});

test('mês inválido na URL dá 404', async ({ page }) => {
  await abrirCartao(page);
  const id = idDoCartao(page);
  const resposta = await page.goto(`/cartoes/${id}/faturas/2019-13`);
  expect(resposta?.status()).toBe(404);
});

test('sem JavaScript: a fatura abre e paga pela própria página', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/cartoes');
  await page.getByRole('link', { name: CARTAO, exact: true }).first().click();
  const id = idDoCartao(page);

  await page.goto(`/cartoes/${id}/faturas/2019-05`);
  await expect(
    page.getByRole('heading', { level: 1, name: /Fatura de maio de 2019/ }),
  ).toBeVisible();
  await expect(page.getByText('Compra e2e')).toBeVisible();
  await page.getByRole('button', { name: 'Marcar como paga' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'marcada como paga' })).toBeVisible();
  await ctx.close();
});

test('pagar todas as faturas de teste deixa a dívida do cartão em zero', async ({ page }) => {
  await abrirCartao(page);
  for (const mes of ['abril', 'junho']) {
    await page.getByRole('link', { name: new RegExp(`^${mes} de 2019$`, 'i') }).click();
    await page.getByRole('button', { name: 'Marcar como paga' }).click();
    await expect(page.getByTestId('situacao-fatura')).toHaveText('Paga');
    await abrirCartao(page);
  }
  await expect(page.getByTestId('a-pagar')).toContainText('0,00');
});

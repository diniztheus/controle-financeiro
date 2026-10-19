/**
 * Gastos no cartão no navegador: lançar compra parcelada, ver as parcelas nas faturas, editar,
 * pagar fatura e ver a dívida no painel. Dados sempre em 2019 e, no fim, todas as faturas criadas
 * são pagas (a dívida não pode sobrar para os outros testes do banco compartilhado).
 */
import { expect, test, type Page } from '@playwright/test';

const CARTAO = 'Cartão Gastos E2E';

/** Cria o cartão (fechamento 5, vencimento 15) e devolve o id dele pelo link da lista. */
async function criarCartao(page: Page): Promise<string> {
  await page.goto('/cartoes');
  const form = page.locator('form', {
    has: page.getByRole('button', { name: 'Cadastrar cartão' }),
  });
  await form.getByLabel('Nome', { exact: true }).fill(CARTAO);
  await form.getByLabel('Dia do fechamento').fill('5');
  await form.getByLabel('Dia do vencimento').fill('15');
  await form.getByRole('button', { name: 'Cadastrar cartão' }).click();
  await expect(page.getByRole('status')).toContainText(`Cartão "${CARTAO}" cadastrado`);
  return idDoCartao(page);
}

/** Id do cartão de teste, pelo link da lista de cartões. */
async function idDoCartao(page: Page): Promise<string> {
  await page.goto('/cartoes');
  const href = await page
    .locator('a[href^="/cartoes/"]')
    .filter({ hasText: CARTAO })
    .first()
    .getAttribute('href');
  return href!.split('/')[2]!;
}

/** Lança a compra no cartão; o formulário de gastos mostra a prévia antes de enviar. */
async function lancarCompra(page: Page, descricao: string, parcelas: string) {
  await page.goto('/gastos');
  const form = page.locator('#novo');
  await form.getByLabel('Valor (R$)').fill('1.000,00');
  await form.getByLabel('Descrição').fill(descricao);
  await form.getByText('Mercado', { exact: true }).click();
  await form.getByRole('radio', { name: 'Cartão', exact: true }).check();
  await form.getByRole('combobox', { name: 'Cartão', exact: true }).selectOption({ label: CARTAO });
  await form.getByLabel('Parcelas').fill(parcelas);
  await form.getByLabel('Data', { exact: true }).fill('2019-03-10');
  await expect(page.locator('#g-previa')).toContainText('10x de R$ 100,00');
  await expect(page.locator('#g-previa')).toContainText('fatura de abr/2019, vence 15/04');
  await form.getByRole('button', { name: 'Lançar gasto' }).click();
  await expect(page.getByTestId('gasto-lancado')).toContainText('R$ 1.000,00');
}

/** Marca a fatura do mês como paga (data e valor já vêm preenchidos). */
async function pagarFatura(page: Page, cartaoId: string, mes: string) {
  await page.goto(`/cartoes/${cartaoId}/faturas/${mes}`);
  await page.getByRole('button', { name: 'Marcar como paga' }).click();
  await expect(page.getByRole('status')).toContainText('Fatura marcada como paga.');
}

test('compra parcelada cai nas faturas certas, bloqueia edição paga e zera a dívida do cartão ao pagar', async ({
  page,
}) => {
  const cartaoId = await criarCartao(page);

  // Parcelas fora do limite são recusadas no campo, com a mensagem do servidor.
  await page.goto('/gastos');
  const form = page.locator('#novo');
  await form.getByLabel('Valor (R$)').fill('50');
  await form.getByLabel('Descrição').fill('Erro e2e');
  await form.getByText('Mercado', { exact: true }).click();
  await form.getByRole('radio', { name: 'Cartão', exact: true }).check();
  await form.getByRole('combobox', { name: 'Cartão', exact: true }).selectOption({ label: CARTAO });
  await form.getByLabel('Parcelas').fill('25');
  await form.getByRole('button', { name: 'Lançar gasto' }).click();
  await expect(form.getByText(/24 parcelas/)).toBeVisible();
  await expect(form.getByLabel('Parcelas')).toHaveAttribute('aria-invalid', 'true');

  await lancarCompra(page, 'Notebook e2e', '10');

  // A 1ª parcela cai em março (competência) e na fatura de abril.
  await page.goto('/gastos?mes=2019-03');
  await expect(page.getByTestId('lancamentos')).toContainText('Notebook e2e');
  await expect(page.getByTestId('lancamentos')).toContainText('1/10');
  await page.goto(`/cartoes/${cartaoId}/faturas/2019-04`);
  await expect(page.getByTestId('total-fatura')).toContainText('100,00');
  await expect(page.getByTestId('itens-fatura')).toContainText('Notebook e2e');

  // Ao pagar a fatura de abril, a compra não pode mais ser editada.
  await pagarFatura(page, cartaoId, '2019-04');
  await page.goto('/gastos?mes=2019-03');
  await page.getByTestId('lancamentos').getByText('Notebook e2e').click();
  await page.getByLabel('Valor (R$)').fill('900');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('desfaça o pagamento da fatura de 04/2019 primeiro')).toBeVisible();

  // O painel não desconta o cartão do patrimônio: a dívida fica só na tela de cartões.
  await page.goto('/');
  await expect(page.getByTestId('cartoes-a-pagar')).toHaveCount(0);
  await page.goto(`/cartoes/${cartaoId}`);
  await expect(page.getByTestId('a-pagar')).toContainText('900');

  // Pagar todas as demais faturas da compra zera a dívida.
  for (const mes of [
    '2019-05',
    '2019-06',
    '2019-07',
    '2019-08',
    '2019-09',
    '2019-10',
    '2019-11',
    '2019-12',
    '2020-01',
  ]) {
    await pagarFatura(page, cartaoId, mes);
  }
  await page.goto(`/cartoes/${cartaoId}`);
  await expect(page.getByTestId('a-pagar')).toContainText('0,00');
});

test('sem JavaScript: lançar compra no cartão redireciona e mostra a confirmação', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/gastos');
  const form = page.locator('#novo');
  await form.getByLabel('Valor (R$)').fill('300');
  await form.getByLabel('Descrição').fill('Sem JS cartão e2e');
  await form.getByText('Mercado', { exact: true }).click();
  await form.getByRole('radio', { name: 'Cartão', exact: true }).check();
  await form.getByRole('combobox', { name: 'Cartão', exact: true }).selectOption({ label: CARTAO });
  // Janeiro e fevereiro de 2019: meses que o teste anterior ainda não pagou nem usou.
  await form.getByLabel('Parcelas').fill('2');
  await form.getByLabel('Data', { exact: true }).fill('2019-01-01');
  await form.getByRole('button', { name: 'Lançar gasto' }).click();
  await expect(page.getByTestId('gasto-lancado')).toContainText('R$ 300,00');
  await expect(page.getByTestId('lancamentos')).toContainText('Sem JS cartão e2e');

  await ctx.close();

  // As duas faturas (janeiro e fevereiro de 2019) são pagas no fim, como no outro teste.
  const com = await browser.newPage();
  const cartaoId = await idDoCartao(com);
  for (const mes of ['2019-01', '2019-02']) {
    await pagarFatura(com, cartaoId, mes);
  }
  await com.close();
});

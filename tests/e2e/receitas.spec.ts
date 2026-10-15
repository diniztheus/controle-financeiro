/**
 * Receitas no navegador. O banco é compartilhado: as receitas de teste ficam em março de 2019
 * (fora do mês atual, para não mexer no painel) e nada vai para a lixeira.
 */
import { expect, test, type Page } from '@playwright/test';

const MES = '2019-03';

async function criarConta(page: Page, nome: string) {
  // Saldo zero: não muda o patrimônio dos outros testes.
  await page.goto('/contas');
  await page.getByLabel('Nome', { exact: true }).fill(nome);
  await page.getByLabel('Saldo de hoje (R$)').fill('0');
  await page.getByRole('button', { name: 'Cadastrar conta' }).click();
  await expect(page.getByRole('status')).toContainText(`Conta "${nome}" cadastrada.`);
}

test('lançar receita, ver no mês e no total por categoria', async ({ page }) => {
  await criarConta(page, 'Conta Receitas E2E');

  await page.goto(`/receitas?mes=${MES}`);
  await expect(page.getByText('Nada recebido em março')).toBeVisible();
  const form = page.locator('#nova');
  await form.getByLabel('Valor (R$)').fill('4.200,00');
  await form.getByLabel('Descrição').fill('Salário e2e');
  await form.getByLabel('Data', { exact: true }).fill('2019-03-05');
  await form.getByText('Salário', { exact: true }).click();
  await form.getByLabel('Recebido em').selectOption({ label: 'Conta Receitas E2E' });
  await form.getByLabel('Observação').fill('Pago na folha');
  await form.getByRole('button', { name: 'Lançar receita' }).click();

  await expect(page.getByTestId('receita-lancada')).toContainText('R$ 4.200,00');
  // O formulário limpa valor, descrição e observação; a data e a categoria ficam.
  await expect(form.getByLabel('Valor (R$)')).toHaveValue('');
  await expect(form.getByLabel('Observação')).toHaveValue('');
  await expect(form.getByLabel('Data', { exact: true })).toHaveValue('2019-03-05');
  await expect(page.getByTestId('lista-receitas')).toContainText('Salário e2e');
  await expect(page.getByTestId('total-receitas')).toContainText('4.200');
  await expect(page.getByTestId('receitas-categorias')).toContainText('Salário');
  await expect(page.getByTestId('receitas-categorias')).toContainText('100%');

  // Próximo lançamento sugere a última categoria usada.
  await page.reload();
  await expect(page.locator('#nova').getByLabel('Salário')).toBeChecked();
});

test('editar receita pela lista e salvar', async ({ page }) => {
  await page.goto(`/receitas?mes=${MES}`);
  await page.getByTestId('lista-receitas').getByText('Salário e2e').click();
  await expect(page.getByRole('heading', { name: 'Editar receita' })).toBeVisible();
  await page.getByLabel('Valor (R$)').fill('4.300,00');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page).toHaveURL(new RegExp(`/receitas\\?mes=${MES}`));
  await expect(page.getByTestId('lista-receitas')).toContainText('R$ 4.300,00');
  await expect(page.getByTestId('total-receitas')).toContainText('4.300');
});

test('erro de valor mantém o que foi digitado e marca o campo', async ({ page }) => {
  await page.goto('/receitas');
  const form = page.locator('#nova');
  await form.getByLabel('Valor (R$)').fill('12,345');
  await form.getByLabel('Descrição').fill('Fica no campo');
  await form.getByRole('button', { name: 'Lançar receita' }).click();
  await expect(form.getByText('Valor inválido')).toBeVisible();
  await expect(form.getByLabel('Valor (R$)')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByLabel('Descrição')).toHaveValue('Fica no campo');
});

test('mês sem receitas e navegação pelo menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Receitas', exact: true }).click();
  await expect(page).toHaveURL(/\/receitas/);
  await expect(page.getByRole('heading', { name: 'Receitas', level: 1 })).toBeVisible();

  // 2018: nenhum outro teste lança receitas nesse ano (o banco é compartilhado).
  await page.goto('/receitas?mes=2018-04');
  await expect(page.getByTestId('mes-atual')).toHaveText('Abril de 2018');
  await expect(page.getByText('Nada recebido em abril')).toBeVisible();
  await page.getByRole('link', { name: 'Próximo mês' }).click();
  await expect(page.getByTestId('mes-atual')).toHaveText('Maio de 2018');
});

test('receita inexistente dá 404', async ({ page }) => {
  const resposta = await page.goto('/receitas/nao-existe');
  expect(resposta?.status()).toBe(404);
});

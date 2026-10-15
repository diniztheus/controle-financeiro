/**
 * Fluxos do núcleo no navegador, contra o site compilado e uma pasta de dados temporária.
 * Os testes rodam em sequência no mesmo banco; cada um usa nomes próprios.
 */
import { expect, test, type Page } from '@playwright/test';

async function criarConta(page: Page, nome: string, saldo: string) {
  await page.goto('/contas');
  await page.getByLabel('Nome', { exact: true }).fill(nome);
  await page.getByLabel('Saldo de hoje (R$)').fill(saldo);
  await page.getByRole('button', { name: 'Cadastrar conta' }).click();
  await expect(page.getByRole('status')).toContainText(`Conta "${nome}" cadastrada.`);
}

async function lancar(page: Page, valor: string, descricao: string, categoria: string) {
  await page.goto('/gastos');
  const form = page.locator('#novo');
  await form.getByLabel('Valor (R$)').fill(valor);
  await form.getByLabel('Descrição').fill(descricao);
  await form.getByText(categoria, { exact: true }).click();
  await form.getByRole('button', { name: 'Lançar gasto' }).click();
  await expect(page.getByTestId('gasto-lancado')).toContainText('lançado');
}

test('lançar gasto e ver no painel, sem mexer no saldo', async ({ page }) => {
  await criarConta(page, 'Conta E2E', '1.000,00');

  await page.goto('/gastos');
  const form = page.locator('#novo');
  await form.getByLabel('Valor (R$)').fill('42,90');
  await form.getByLabel('Descrição').fill('Almoço e2e');
  await form.getByText('Mercado', { exact: true }).click();
  await form.getByLabel('Pago com').selectOption({ label: 'Conta E2E' });
  await form.getByRole('button', { name: 'Lançar gasto' }).click();
  await expect(page.getByTestId('gasto-lancado')).toContainText('R$ 42,90');
  // O formulário volta limpo e a lista já mostra o gasto.
  await expect(form.getByLabel('Valor (R$)')).toHaveValue('');
  await expect(page.getByTestId('lancamentos')).toContainText('Almoço e2e');

  // Próximo lançamento já sugere a última categoria usada.
  await page.reload();
  await expect(page.locator('#novo').getByLabel('Mercado')).toBeChecked();

  await page.goto('/');
  await expect(page.getByTestId('total-mes')).toContainText('42');
  await expect(page.getByTestId('categorias-mes')).toContainText('Mercado');
  await expect(page.getByTestId('lancamentos')).toContainText('Almoço e2e');
  await expect(page.getByTestId('lancamentos')).toContainText('Conta E2E');
  // Regra da casa: gasto não altera saldo.
  await expect(page.getByTestId('patrimonio')).toContainText('1.000');
});

test('erro de valor mantém o que foi digitado e marca o campo', async ({ page }) => {
  await page.goto('/gastos');
  const form = page.locator('#novo');
  await form.getByLabel('Valor (R$)').fill('12,345');
  await form.getByLabel('Descrição').fill('Fica no campo');
  await form.getByRole('button', { name: 'Lançar gasto' }).click();
  await expect(form.getByText('Valor inválido')).toBeVisible();
  await expect(form.getByLabel('Valor (R$)')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByLabel('Descrição')).toHaveValue('Fica no campo');
});

test('editar um gasto, mandar para a lixeira e desfazer', async ({ page }) => {
  await lancar(page, '10', 'Pão e2e', 'Alimentação');
  await page.getByTestId('lancamentos').getByText('Pão e2e').click();
  await expect(page.getByRole('heading', { name: 'Editar gasto' })).toBeVisible();
  await page.getByLabel('Valor (R$)').fill('11,50');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page).toHaveURL(/\/gastos\?mes=/);
  await expect(page.getByTestId('lancamentos')).toContainText('R$ 11,50');

  await page.getByTestId('lancamentos').getByText('Pão e2e').click();
  await page.getByRole('button', { name: 'Mandar para a lixeira' }).click();
  await page.getByRole('button', { name: 'Sim, mandar para a lixeira' }).click();
  await expect(page.getByText('Gasto mandado para a lixeira.')).toBeVisible();
  await expect(page.getByTestId('lancamentos')).not.toContainText('Pão e2e');

  await page.goto('/lixeira');
  await expect(page.getByTestId('lixeira-gastos')).toContainText('Pão e2e');
  await page.getByTestId('lixeira-gastos').getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByRole('status')).toContainText('Gasto restaurado.');
  await page.goto('/gastos');
  await expect(page.getByTestId('lancamentos')).toContainText('Pão e2e');
});

test('atualizar saldo grava o histórico e muda o patrimônio', async ({ page }) => {
  await criarConta(page, 'Poupança E2E', '500');
  const linha = page.getByTestId('lista-contas').locator('li', { hasText: 'Poupança E2E' });
  await linha.getByLabel('Novo saldo de Poupança E2E').fill('650,25');
  await linha.getByRole('button', { name: 'Atualizar saldo' }).click();
  await expect(linha.getByRole('status')).toContainText('Saldo atualizado.');
  await expect(linha).toContainText('650');

  await linha.getByRole('link', { name: 'Editar' }).click();
  await expect(page.getByTestId('historico').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('historico')).toContainText('R$ 650,25');
  await expect(page.getByTestId('historico')).toContainText('R$ 500,00');
});

test('categoria nova aparece no lançamento; arquivada some', async ({ page }) => {
  await page.goto('/categorias');
  await page.getByLabel('Nome', { exact: true }).last().fill('Pets e2e');
  await page.getByRole('button', { name: 'Criar categoria' }).click();
  await expect(page.getByRole('status')).toContainText('Categoria "Pets e2e" criada.');

  await page.goto('/gastos');
  await expect(page.locator('#novo').getByText('Pets e2e', { exact: true })).toBeVisible();

  await page.goto('/categorias');
  const linha = page.getByTestId('lista-categorias').locator('li', { hasText: 'Pets e2e' });
  await linha.getByRole('button', { name: 'Editar' }).click();
  await linha.getByRole('button', { name: 'Arquivar' }).click();
  await expect(page.getByRole('heading', { name: 'Arquivadas' })).toBeVisible();

  await page.goto('/gastos');
  await expect(page.locator('#novo').getByText('Pets e2e', { exact: true })).toHaveCount(0);
});

test('limite do mês no painel mostra quanto resta', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Definir limite|Alterar limite/ }).click();
  await page.getByLabel('Limite por mês (R$)').fill('5.000,00');
  await page.getByRole('button', { name: 'Salvar limite' }).click();
  await expect(page.getByTestId('limite')).toContainText('Limite de R$ 5.000,00');
  await expect(page.getByTestId('limite')).toContainText('Restam');
});

test('navegar entre meses pela URL e pelos botões', async ({ page }) => {
  await page.goto('/gastos?mes=2020-01');
  await expect(page.getByTestId('mes-atual')).toHaveText('Janeiro de 2020');
  await expect(page.getByText('Nada lançado em janeiro')).toBeVisible();
  await page.getByRole('link', { name: 'Próximo mês' }).click();
  await expect(page.getByTestId('mes-atual')).toHaveText('Fevereiro de 2020');
  // Mês inválido na URL cai no mês atual, sem erro.
  await page.goto('/?mes=2020-13');
  await expect(page.getByTestId('painel-mes')).toBeVisible();
});

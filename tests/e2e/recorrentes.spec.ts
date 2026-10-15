/**
 * Receitas recorrentes no navegador. O banco é compartilhado: os modelos de teste começam e
 * terminam em 2019, em meses que nenhum outro teste usa (março e abril de 2019 são do
 * receitas.spec.ts). Sempre com "até" preenchido: sem ele o modelo geraria até o mês atual.
 * Nada vai para a lixeira.
 */
import { expect, test, type Page } from '@playwright/test';

async function criarModelo(
  page: Page,
  d: {
    valor: string;
    descricao: string;
    categoria: string;
    dia: string;
    inicio: string;
    fim: string;
  },
) {
  await page.goto('/receitas/recorrentes');
  const form = page.locator('#nova');
  await form.getByLabel('Valor (R$)').fill(d.valor);
  await form.getByLabel('Descrição').fill(d.descricao);
  await form.getByText(d.categoria, { exact: true }).click();
  await form.getByLabel('Dia do mês').fill(d.dia);
  await form.getByLabel('A partir de').fill(d.inicio);
  await form.getByLabel('Até').fill(d.fim);
  await form.getByRole('button', { name: 'Criar receita recorrente' }).click();
  await expect(page.getByTestId('recorrente-aviso')).toContainText('Receita recorrente criada.');
}

function modelo(page: Page, nome: string) {
  return page.getByTestId('lista-recorrentes').locator('li', { hasText: nome });
}

test('criar receita recorrente: lança as receitas dos meses já chegados, sem duplicar', async ({
  page,
}) => {
  // Início 10/08: o dia 5 de agosto fica de fora. Set, out e nov saem, e o fim (30/11) para.
  await criarModelo(page, {
    valor: '3.000,00',
    descricao: 'Bolsa e2e',
    categoria: 'Bolsa',
    dia: '5',
    inicio: '2019-08-10',
    fim: '2019-11-30',
  });

  const item = modelo(page, 'Bolsa e2e');
  await expect(item).toContainText('Bolsa');
  await expect(item).toContainText('Encerrada');
  await expect(item).toContainText('3 lançadas');

  // Recarregar várias vezes não lança de novo (idempotente).
  await page.reload();
  await page.reload();
  await expect(modelo(page, 'Bolsa e2e')).toContainText('3 lançadas');

  // As receitas geradas aparecem como receitas comuns, com o selo "Recorrente".
  await page.goto('/receitas?mes=2019-09');
  await expect(page.getByTestId('lista-receitas')).toContainText('Bolsa e2e');
  await expect(page.getByTestId('lista-receitas')).toContainText('R$ 3.000,00');
  await expect(
    page.getByTestId('lista-receitas').getByText('Recorrente', { exact: true }),
  ).toBeVisible();
  await page.goto('/receitas?mes=2019-08');
  await expect(page.getByText('Nada recebido em agosto')).toBeVisible();
});

test('erro de datas mostra a mensagem e mantém o que foi digitado', async ({ page }) => {
  await page.goto('/receitas/recorrentes');
  const form = page.locator('#nova');
  await form.getByLabel('Valor (R$)').fill('500');
  await form.getByLabel('Descrição').fill('Fica no campo');
  await form.getByLabel('Dia do mês').fill('10');
  await form.getByLabel('A partir de').fill('2019-10-01');
  await form.getByLabel('Até').fill('2019-09-01');
  await form.getByRole('button', { name: 'Criar receita recorrente' }).click();
  await expect(form.getByText('A data final é antes da inicial')).toBeVisible();
  await expect(form.getByLabel('Descrição')).toHaveValue('Fica no campo');
});

test('pausar um modelo; retomar um modelo cujo fim já passou é recusado', async ({ page }) => {
  await criarModelo(page, {
    valor: '1.000,00',
    descricao: 'Aluguel e2e',
    categoria: 'Outros',
    dia: '20',
    inicio: '2019-08-01',
    fim: '2019-12-31',
  });
  const item = modelo(page, 'Aluguel e2e');
  await expect(item).toContainText('5 lançadas');

  await item.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByTestId('recorrente-aviso')).toContainText('pausada');
  await expect(modelo(page, 'Aluguel e2e')).toContainText('Pausada');

  // O fim (31/12/2019) já passou: retomar só depois de editar a data final.
  await modelo(page, 'Aluguel e2e').getByRole('button', { name: 'Retomar' }).click();
  await expect(page.getByRole('alert')).toContainText('Edite a data final para retomar');
  await expect(modelo(page, 'Aluguel e2e')).toContainText('Pausada');
});

test('editar o modelo não muda as receitas já lançadas', async ({ page }) => {
  await page.goto('/receitas/recorrentes');
  await modelo(page, 'Bolsa e2e').getByRole('link', { name: 'Editar' }).click();
  await expect(page.getByRole('heading', { name: 'Editar receita recorrente' })).toBeVisible();
  await expect(page.getByText('Mudanças valem só para os próximos meses')).toBeVisible();

  await page.getByLabel('Valor (R$)').fill('3.200,00');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByTestId('recorrente-aviso')).toContainText('Modelo salvo.');
  await expect(modelo(page, 'Bolsa e2e')).toContainText('3.200,00');

  // A receita de setembro, já lançada, continua com o valor antigo.
  await page.goto('/receitas?mes=2019-09');
  await expect(page.getByTestId('lista-receitas')).toContainText('R$ 3.000,00');
  await expect(page.getByTestId('lista-receitas')).not.toContainText('R$ 3.200,00');
});

test('a tela de receitas leva às recorrentes', async ({ page }) => {
  await page.goto('/receitas');
  await page.getByRole('link', { name: 'Receitas recorrentes' }).click();
  await expect(page).toHaveURL(/\/receitas\/recorrentes$/);
  await expect(page.getByRole('heading', { name: 'Receitas recorrentes', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar às receitas' }).click();
  await expect(page).toHaveURL(/\/receitas/);
});

test('modelo inexistente dá 404', async ({ page }) => {
  const resposta = await page.goto('/receitas/recorrentes/nao-existe');
  expect(resposta?.status()).toBe(404);
});

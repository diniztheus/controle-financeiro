/**
 * Confirmação de recebimento no navegador. O banco é compartilhado: o modelo de teste começa e
 * termina em 2019 (fevereiro a abril), meses que nenhum outro teste de receitas usa como total.
 * Tudo é checado dentro das linhas deste modelo, porque outros testes também geram previstas.
 * Nada vai para a lixeira de forma ambígua: a receita de "não recebi" fica lá.
 */
import { expect, test } from '@playwright/test';

const DESCRICAO = 'Aluguel confirmacao e2e';

test.describe.configure({ mode: 'serial' });

test('recorrente gera previstas; confirmar, não recebi e desfazer mudam os totais', async ({
  page,
}) => {
  await page.goto('/receitas/recorrentes');
  const form = page.locator('#nova');
  await form.getByLabel('Valor (R$)').fill('2.500,00');
  await form.getByLabel('Descrição').fill(DESCRICAO);
  await form.getByText('Freelance', { exact: true }).click();
  await form.getByLabel('Dia do mês').fill('5');
  await form.getByLabel('A partir de').fill('2019-02-01');
  await form.getByLabel('Até').fill('2019-04-30');
  await form.getByRole('button', { name: 'Criar receita recorrente' }).click();
  await expect(page.getByTestId('recorrente-aviso')).toContainText('Receita recorrente criada.');

  // Fevereiro: a receita gerada é prevista (selo "Prevista", valor em cinza) e não soma.
  await page.goto('/receitas?mes=2019-02');
  const lista = page.getByTestId('lista-receitas');
  await expect(lista.locator('li', { hasText: DESCRICAO })).toContainText('Prevista');
  await expect(page.getByTestId('total-receitas')).toContainText(/R\$\s*0,00/);

  // "A receber" traz as três previstas de 2019 (já vencidas).
  const aReceber = page.getByTestId('a-receber');
  const linhas = aReceber.locator('li', { hasText: DESCRICAO });
  await expect(linhas).toHaveCount(3);

  // Confirma a de fevereiro com outro valor: o total passa a contar o valor real.
  const fevereiro = linhas.filter({ hasText: 'fevereiro' });
  await fevereiro.getByLabel('Valor (R$)').fill('2.600,00');
  // A data real muda só dentro do mês da previsão (dia 5 -> dia 8).
  await fevereiro.getByLabel('Data', { exact: true }).fill('2019-02-08');
  await fevereiro.getByRole('button', { name: 'Recebi', exact: true }).click();
  await expect(page.getByTestId('receita-aviso')).toContainText('Recebimento confirmado.');
  await expect(page.getByTestId('total-receitas')).toContainText(/R\$\s*2.600,00/);
  await expect(lista.locator('li', { hasText: DESCRICAO })).not.toContainText('Prevista');
  await expect(aReceber.locator('li', { hasText: DESCRICAO })).toHaveCount(2);

  // "Não recebi" em março: a prevista vai para a lixeira e some de "A receber".
  const marco = aReceber.locator('li', { hasText: DESCRICAO }).filter({ hasText: 'março' });
  await marco.getByRole('button', { name: 'Não recebi' }).click();
  await expect(page.getByText('Receita mandada para a lixeira.')).toBeVisible();
  await expect(aReceber.locator('li', { hasText: DESCRICAO })).toHaveCount(1);

  // Desfaz a confirmação de fevereiro: volta a prevista e deixa o total.
  await page.goto('/receitas?mes=2019-02');
  const confirmada = page
    .getByTestId('lista-receitas')
    .locator('li', { hasText: DESCRICAO })
    .filter({ hasText: /R\$\s*2.600,00/ });
  await confirmada.getByRole('button', { name: 'Desfazer confirmação' }).click();
  await expect(page.getByTestId('receita-aviso')).toContainText('Confirmação desfeita.');
  await expect(
    page.getByTestId('lista-receitas').locator('li', { hasText: DESCRICAO }),
  ).toContainText('Prevista');
  await expect(page.getByTestId('total-receitas')).toContainText(/R\$\s*0,00/);
  await expect(
    page
      .getByTestId('a-receber')
      .locator('li', { hasText: DESCRICAO })
      .filter({ hasText: 'fevereiro' }),
  ).toHaveCount(1);
});

test('detalhe de uma prevista: confirmar pela tela da receita', async ({ page }) => {
  await page.goto('/receitas?mes=2019-04');
  await page
    .getByTestId('lista-receitas')
    .locator('li', { hasText: DESCRICAO })
    .getByRole('link')
    .click();
  await expect(page.getByTestId('receita-prevista')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar recebimento' }).click();

  await expect(page.getByTestId('receita-aviso')).toContainText('Recebimento confirmado.');
  await expect(page.getByTestId('total-receitas')).toContainText(/R\$\s*2.500,00/);
});

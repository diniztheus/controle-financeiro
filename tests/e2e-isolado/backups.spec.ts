/**
 * Backups na tela: lançar, fazer backup, restaurar (com confirmação), excluir, configurar o
 * automático e as recusas (nome inválido, palavra não digitada). Roda no servidor isolado
 * (banco próprio), porque restaurar troca o banco inteiro. Os testes estão em série e a
 * ordem importa: o primeiro cria o backup que os seguintes usam.
 */
import { expect, test } from '@playwright/test';

const ANTES = 'Gasto antes do backup e2e';
const DEPOIS = 'Gasto depois do backup e2e';

test.describe.configure({ mode: 'serial' });

async function lancarGasto(page: import('@playwright/test').Page, descricao: string) {
  await page.goto('/gastos');
  const form = page.locator('#novo');
  await form.getByLabel('Valor (R$)').fill('12,34');
  await form.getByLabel('Descrição').fill(descricao);
  await form.locator('input[name="categoriaId"]').first().check({ force: true });
  await form.getByRole('button', { name: 'Lançar gasto' }).click();
  await expect(page.getByTestId('gasto-lancado')).toBeVisible();
}

test('backup, lançar outro gasto e restaurar: o segundo some, o primeiro volta', async ({
  page,
}) => {
  await lancarGasto(page, ANTES);

  await page.goto('/backups');
  await page.getByRole('button', { name: 'Fazer backup agora' }).click();
  const feito = page.getByTestId('backup-feito');
  await expect(feito).toContainText('Backup criado: financas-');
  const nome = (await feito.innerText()).replace('Backup criado:', '').trim();

  await lancarGasto(page, DEPOIS);
  await expect(page.locator('body')).toContainText(DEPOIS);

  await page.goto('/backups');
  const linha = page.locator(`[data-nome="${nome}"]`);
  await linha.getByRole('link', { name: /Restaurar/ }).click();
  await expect(page).toHaveURL(new RegExp(`/backups/restaurar/${nome}$`));
  await expect(page.getByTestId('verificacao-ok')).toBeVisible();

  // O botão só habilita com a caixa marcada e a palavra digitada.
  const botao = page.getByRole('button', { name: 'Restaurar este backup' });
  await expect(botao).toBeDisabled();
  await page.getByLabel('Entendi que o banco atual será substituído').check();
  await expect(botao).toBeDisabled();
  await page.getByLabel('Digite restaurar para confirmar').fill('restaurar');
  await expect(botao).toBeEnabled();
  await botao.click();

  await expect(page).toHaveURL(/\/backups\?restaurado=/);
  const aviso = page.getByTestId('restaurado');
  await expect(aviso).toContainText('Antes de restaurar');
  await expect(aviso).toContainText('financas-antes-de-restaurar-');
  await expect(page.locator('[data-tipo="antes-de-restaurar"]').first()).toBeVisible();

  await page.goto('/gastos');
  await expect(page.locator('body')).toContainText(ANTES);
  await expect(page.locator('body')).not.toContainText(DEPOIS);
});

test('excluir um backup "Antes de restaurar" pede confirmação', async ({ page }) => {
  await page.goto('/backups');
  const linha = page
    .locator('li[data-testid="backup-linha"]', {
      has: page.locator('[data-tipo="antes-de-restaurar"]'),
    })
    .first();
  const nome = await linha.getAttribute('data-nome');
  expect(nome).toMatch(/^financas-antes-de-restaurar-/);

  await linha.locator('summary').click();
  await linha.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(page.getByText('Backup excluído.')).toBeVisible();
  await expect(page.locator(`[data-nome="${nome}"]`)).toHaveCount(0);
});

test('backup automático: desligar e mudar o "manter", depois religar', async ({ page }) => {
  await page.goto('/backups');
  await page.getByLabel('Fazer backup automático todo dia').uncheck();
  await page.getByLabel('Manter os últimos').fill('5');
  await page.getByRole('button', { name: 'Salvar' }).first().click();
  await expect(page.getByTestId('auto-salvo')).toBeVisible();
  await expect(page.getByTestId('auto-situacao')).toHaveText('Desligado');
  await expect(page.getByTestId('auto-proximo')).toHaveText('desligado');

  await page.reload();
  await expect(page.getByLabel('Fazer backup automático todo dia')).not.toBeChecked();
  await expect(page.getByLabel('Manter os últimos')).toHaveValue('5');

  await page.getByLabel('Fazer backup automático todo dia').check();
  await page.getByLabel('Manter os últimos').fill('30');
  await page.getByRole('button', { name: 'Salvar' }).first().click();
  await expect(page.getByTestId('auto-situacao')).toHaveText('Ligado');
  await expect(page.getByTestId('auto-proximo')).not.toHaveText('desligado');
});

test('nome inválido ou inexistente na URL de restaurar dá 404', async ({ page }) => {
  const invalido = await page.goto('/backups/restaurar/arquivo-qualquer.txt');
  expect(invalido?.status()).toBe(404);
  const inexistente = await page.goto('/backups/restaurar/financas-1999-01-01-000000.db');
  expect(inexistente?.status()).toBe(404);
});

test('sem JavaScript, restaurar sem digitar a palavra mostra erro e não restaura', async ({
  browser,
}, info) => {
  const contexto = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: info.project.use.baseURL,
  });
  const semJs = await contexto.newPage();
  try {
    await semJs.goto('/backups');
    const nome = await semJs
      .locator('[data-testid="backup-linha"]')
      .first()
      .getAttribute('data-nome');
    await semJs.goto(`/backups/restaurar/${nome}`);
    await semJs.getByLabel('Entendi que o banco atual será substituído').check();
    await semJs.getByRole('button', { name: 'Restaurar este backup' }).click();
    await expect(
      semJs.getByRole('alert').filter({ hasText: 'Digite a palavra restaurar' }),
    ).toBeVisible();
    // Sem JS o formulário envia para a própria página (com ?/restaurar), que segue aberta.
    await expect(semJs).toHaveURL(new RegExp(`/backups/restaurar/${nome}(\\?/restaurar)?$`));
  } finally {
    await contexto.close();
  }
});

test('verificar a integridade mostra o resultado e /sistema traz as duas linhas', async ({
  page,
}) => {
  await page.goto('/backups');
  await page.getByRole('button', { name: 'Verificar agora' }).click();
  await expect(page.getByTestId('verificacao-feita')).toContainText('Verificação concluída');

  await page.goto('/sistema');
  await expect(page.getByTestId('linha-integridade')).toBeVisible();
  await expect(page.getByTestId('linha-backup-auto')).toBeVisible();
});

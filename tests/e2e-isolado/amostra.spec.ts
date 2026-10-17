import { expect, test } from '@playwright/test';

// Banco só deste servidor: aqui cabem testes que mudam o estado do site inteiro.
test('servidor isolado responde com banco próprio', async ({ page }) => {
  await page.goto('/sistema');
  await expect(page.getByTestId('caminho-banco')).toContainText('controle-financeiro-e2e-isolado');
});

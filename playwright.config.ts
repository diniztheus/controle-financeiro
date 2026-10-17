import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Testes no navegador contra o site compilado, com uma pasta de dados temporária
 * (nunca o ~/ControleFinanceiro real) e numa porta separada para não brigar com `pnpm start`.
 *
 * Se o Chromium do Playwright não estiver instalado (`pnpm exec playwright install chromium`),
 * aponte PW_CHROMIUM_PATH para um Chromium/Chrome já existente.
 */
const PORTA = Number(process.env.E2E_PORT ?? 4173);
const DADOS_E2E = join(tmpdir(), `controle-financeiro-e2e-${PORTA}`);
// Segundo servidor, com banco só dele, para testes que mudam o estado do site inteiro (PIN,
// restaurar backup, banco com defeito): rodando no mesmo banco dos outros, quebrariam todos.
const PORTA_ISOLADO = PORTA + 1;
const DADOS_ISOLADO = join(tmpdir(), `controle-financeiro-e2e-isolado-${PORTA_ISOLADO}`);
const navegador = {
  ...devices['Desktop Chrome'],
  launchOptions: process.env.PW_CHROMIUM_PATH
    ? { executablePath: process.env.PW_CHROMIUM_PATH }
    : {},
};

export default defineConfig({
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      testDir: 'tests/e2e',
      use: { ...navegador, baseURL: `http://127.0.0.1:${PORTA}` },
    },
    {
      name: 'isolado',
      testDir: 'tests/e2e-isolado',
      use: { ...navegador, baseURL: `http://127.0.0.1:${PORTA_ISOLADO}` },
    },
  ],
  webServer: [
    {
      command: 'node scripts/limpar-e2e.ts && pnpm build && node scripts/iniciar.ts',
      url: `http://127.0.0.1:${PORTA}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { PORT: String(PORTA), DADOS_DIR: DADOS_E2E },
    },
    {
      // Usa o build que o servidor acima acabou de gerar (os servidores sobem em sequência).
      command: 'node scripts/limpar-e2e.ts && node scripts/iniciar.ts',
      url: `http://127.0.0.1:${PORTA_ISOLADO}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PORT: String(PORTA_ISOLADO), DADOS_DIR: DADOS_ISOLADO },
    },
  ],
});

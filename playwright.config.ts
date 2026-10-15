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

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: 'node scripts/limpar-e2e.ts && pnpm build && node scripts/iniciar.ts',
    url: `http://127.0.0.1:${PORTA}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PORT: String(PORTA), DADOS_DIR: DADOS_E2E },
  },
});

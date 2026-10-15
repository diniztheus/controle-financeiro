import { sveltekit } from '@sveltejs/kit/vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  // Sem o relatório de tempo por plugin no fim do build (só ruído para quem usa o app).
  build: { rolldownOptions: { checks: { bundlerTimings: false } } },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    // Rede de segurança: mesmo que um teste esqueça de passar uma pasta própria,
    // ele nunca cai no ~/ControleFinanceiro real.
    env: { DADOS_DIR: join(tmpdir(), 'controle-financeiro-vitest') },
  },
});

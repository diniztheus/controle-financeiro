/**
 * Sobe o site já compilado (pasta build/) escutando só em 127.0.0.1.
 *
 *   pnpm start     → compila e chama este script
 *   pnpm preview   → só este script (usa o build que já existe)
 *
 * Variáveis opcionais (no ambiente ou no .env): PORT (padrão 5173), DADOS_DIR.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { carregarEnv, lerConfig } from '../src/lib/server/config.ts';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
carregarEnv(raiz);

const env = process.env;
env.HOST ||= '127.0.0.1';
env.PORT ||= '5173';
// Sem ORIGIN fixo de propósito: o site aceita http://127.0.0.1:PORT e http://localhost:PORT
// (a checagem de origem está em src/lib/server/seguranca.ts).

if (env.HOST !== '127.0.0.1' && env.HOST !== 'localhost') {
  console.warn(`Atenção: HOST=${env.HOST} deixa o site visível para outras máquinas da rede.`);
}

const entrada = join(raiz, 'build', 'index.js');
if (!existsSync(entrada)) {
  console.error('Não achei o site compilado (pasta build/). Rode `pnpm start` ou `pnpm build`.');
  process.exit(1);
}

const cfg = lerConfig();
console.log('');
console.log('  Controle Financeiro');
console.log(`  Endereço: http://${env.HOST}:${env.PORT}`);
console.log(`  Dados:    ${cfg.dadosDir}`);
console.log('  Para parar: Ctrl+C');
console.log('');

await import(pathToFileURL(entrada).href);

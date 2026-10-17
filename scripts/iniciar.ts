/**
 * Sobe o site já compilado (pasta build/) escutando só em 127.0.0.1.
 *
 *   pnpm start     → compila e chama este script
 *   pnpm preview   → só este script (usa o build que já existe)
 *
 * Variáveis opcionais (no ambiente ou no .env): PORT (padrão 5173), DADOS_DIR.
 */
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { carregarEnv, lerConfig } from '../src/lib/server/config.ts';
import { acessoRedeLigado } from '../src/lib/server/seguranca.ts';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
carregarEnv(raiz);

const env = process.env;
// ACESSO_REDE=1 (no .env) deixa o site atender a rede local. Desligado, fica só nesta máquina.
const redeLigada = acessoRedeLigado(env);
env.HOST ||= redeLigada ? '0.0.0.0' : '127.0.0.1';
env.PORT ||= '5173';
// Sem ORIGIN fixo de propósito: o site aceita http://127.0.0.1:PORT e http://localhost:PORT
// (a checagem de origem está em src/lib/server/seguranca.ts).

if (redeLigada) {
  console.warn('Atenção: ACESSO_REDE=1. O site fica visível na rede local (Wi-Fi/cabo).');
  console.warn('Defina um PIN em Configurações antes de usar pela rede.');
} else if (env.HOST !== '127.0.0.1' && env.HOST !== 'localhost') {
  console.warn(`Atenção: HOST=${env.HOST} deixa o site visível para outras máquinas da rede.`);
}

/** IPv4 das placas de rede desta máquina (para mostrar o endereço da rede local). */
function enderecosDaRede(): string[] {
  const achados: string[] = [];
  for (const itens of Object.values(networkInterfaces())) {
    for (const i of itens ?? []) if (i.family === 'IPv4' && !i.internal) achados.push(i.address);
  }
  return achados;
}

const entrada = join(raiz, 'build', 'index.js');
if (!existsSync(entrada)) {
  console.error('Não achei o site compilado (pasta build/). Rode `pnpm start` ou `pnpm build`.');
  process.exit(1);
}

const cfg = lerConfig();
console.log('');
console.log('  Controle Financeiro');
if (redeLigada && env.HOST === '0.0.0.0') {
  console.log(`  Neste computador: http://127.0.0.1:${env.PORT}`);
  for (const ip of enderecosDaRede()) console.log(`  Na rede local:    http://${ip}:${env.PORT}`);
} else {
  console.log(`  Endereço: http://${env.HOST}:${env.PORT}`);
}
console.log(`  Dados:    ${cfg.dadosDir}`);
console.log('  Para parar: Ctrl+C');
console.log('');

await import(pathToFileURL(entrada).href);

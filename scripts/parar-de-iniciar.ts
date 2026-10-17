/**
 * pnpm parar-de-iniciar [--simular]
 *
 * Desfaz o que o `pnpm iniciar-com-o-computador` criou: desativa o serviço e remove os arquivos
 * (serviço do sistema, atalho na área de trabalho). Não mexe no banco de dados nem no código.
 *
 * --simular mostra o que seria removido, sem remover nada.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarEnv } from '../src/lib/server/config.ts';
import {
  opcoesDoComputador,
  planejarParada,
  portaDoAmbiente,
  sistemaSuportado,
  type Comando,
} from '../src/lib/server/inicio/comum.ts';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function rodarComando(c: Comando): void {
  try {
    execFileSync(c.exec, c.args, { stdio: 'ignore' });
  } catch (erro) {
    if (c.ignorarErro) return;
    throw new Error(`Não consegui rodar: ${c.texto} (${(erro as Error).message})`, { cause: erro });
  }
}

function main(): number {
  const simular = process.argv.slice(2).includes('--simular');
  const desconhecidos = process.argv.slice(2).filter((a) => a !== '--simular');
  if (desconhecidos.length > 0) {
    console.error(`Opção desconhecida: ${desconhecidos[0]}`);
    console.error('Uso: pnpm parar-de-iniciar [--simular]');
    return 2;
  }

  carregarEnv(raiz);
  const sistema = sistemaSuportado();
  if (!sistema) {
    console.error(`Sistema "${process.platform}" não suportado. Use macOS, Windows ou Linux.`);
    return 1;
  }

  const opcoes = opcoesDoComputador(portaDoAmbiente(process.env), true, sistema);
  const plano = planejarParada(opcoes);

  if (plano.remover.length === 0) {
    console.log('Nada para remover: o site não está configurado para iniciar com o computador.');
    return 0;
  }

  console.log('Controle Financeiro: parar de iniciar com o computador');
  for (const caminho of plano.remover) console.log(`  - Remover: ${caminho}`);
  for (const c of plano.desativar) console.log(`  - Desativar: ${c.texto}`);
  console.log('');

  if (simular) {
    console.log('Simulação: nada foi removido. Rode sem --simular para aplicar.');
    return 0;
  }

  for (const c of plano.desativar) rodarComando(c);
  for (const caminho of plano.remover) {
    if (!existsSync(caminho)) continue;
    unlinkSync(caminho);
    console.log(`Removido: ${caminho}`);
  }
  for (const aviso of plano.avisos) console.log(`Aviso: ${aviso}`);
  console.log('Pronto. O site não sobe mais sozinho. Para voltar: pnpm iniciar-com-o-computador');
  return 0;
}

try {
  process.exit(main());
} catch (erro) {
  console.error(`Erro: ${(erro as Error).message}`);
  process.exit(1);
}

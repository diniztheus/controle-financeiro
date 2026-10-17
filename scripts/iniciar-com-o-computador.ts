/**
 * pnpm iniciar-com-o-computador [--simular] [--atalho] [--porta N]
 *
 * Faz o site subir sozinho ao entrar no computador:
 *   macOS    LaunchAgent (launchd) em ~/Library/LaunchAgents
 *   Windows  script .vbs oculto na pasta Startup
 *   Linux    serviço de usuário do systemd (ou autostart, se o systemd do usuário não existir)
 *
 * --atalho  cria também um atalho na área de trabalho que abre o site.
 * --simular mostra o que seria criado e não escreve nada nem ativa nada.
 * --porta   porta do site (padrão: PORT do .env ou 5173).
 *
 * Para desfazer: pnpm parar-de-iniciar.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { carregarEnv } from '../src/lib/server/config.ts';
import {
  compararVersoes,
  opcoesDoComputador,
  planejarInicio,
  portaDoAmbiente,
  sistemaSuportado,
  VERSAO_NODE_MINIMA,
  validarPorta,
  type ArquivoPlano,
  type Comando,
  type Sistema,
} from '../src/lib/server/inicio/comum.ts';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOMES_SISTEMA: Record<Sistema, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
};

const AJUDA = `Uso: pnpm iniciar-com-o-computador [--simular] [--atalho] [--porta N]

  --simular   mostra o que seria criado, sem escrever nada
  --atalho    cria também um atalho na área de trabalho que abre o site
  --porta N   porta do site (padrão: PORT do .env ou 5173)

Para desfazer: pnpm parar-de-iniciar`;

class ErroDeUso extends Error {}

function lerOpcoes(argumentos: string[]): {
  simular: boolean;
  atalho: boolean;
  porta?: number;
} {
  const opcoes: { simular: boolean; atalho: boolean; porta?: number } = {
    simular: false,
    atalho: false,
  };
  for (let i = 0; i < argumentos.length; i++) {
    const arg = argumentos[i]!;
    if (arg === '--simular') opcoes.simular = true;
    else if (arg === '--atalho') opcoes.atalho = true;
    else if (arg === '--porta') {
      const valor = argumentos[++i];
      if (valor === undefined) throw new ErroDeUso('--porta precisa de um número.');
      try {
        opcoes.porta = validarPorta(valor);
      } catch (erro) {
        throw new ErroDeUso((erro as Error).message);
      }
    } else if (arg === '--ajuda' || arg === '-h') {
      console.log(AJUDA);
      process.exit(0);
    } else {
      throw new ErroDeUso(`Opção desconhecida: ${arg}`);
    }
  }
  return opcoes;
}

function rodarComando(c: Comando): void {
  try {
    execFileSync(c.exec, c.args, { stdio: 'inherit' });
  } catch (erro) {
    if (c.ignorarErro) return;
    throw new Error(`Não consegui rodar: ${c.texto} (${(erro as Error).message})`, { cause: erro });
  }
}

async function perguntarSimNao(texto: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const resposta = await rl.question(`${texto} (s/N) `);
    return /^s(im)?$/i.test(resposta.trim());
  } finally {
    rl.close();
  }
}

function gravar(arquivo: ArquivoPlano): void {
  mkdirSync(dirname(arquivo.caminho), { recursive: true });
  const existia = existsSync(arquivo.caminho);
  if (arquivo.utf16) {
    // BOM + UTF-16LE: o WScript lê assim, sem estragar acentos do caminho.
    writeFileSync(
      arquivo.caminho,
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(arquivo.conteudo, 'utf16le')]),
    );
  } else {
    writeFileSync(arquivo.caminho, arquivo.conteudo, 'utf8');
  }
  if (arquivo.executavel) chmodSync(arquivo.caminho, 0o755);
  console.log(`  ${existia ? 'Atualizado' : 'Criado'}: ${arquivo.caminho}`);
}

async function main(): Promise<number> {
  const argumentos = lerOpcoes(process.argv.slice(2));
  carregarEnv(raiz);

  if (compararVersoes(process.versions.node, VERSAO_NODE_MINIMA) < 0) {
    console.error(
      `Precisa de Node ${VERSAO_NODE_MINIMA} ou mais novo (este é ${process.versions.node}).`,
    );
    return 1;
  }
  const sistema = sistemaSuportado();
  if (!sistema) {
    console.error(`Sistema "${process.platform}" não suportado. Use macOS, Windows ou Linux.`);
    return 1;
  }
  if (!existsSync(resolve(raiz, 'build', 'index.js'))) {
    console.error('Não achei o site compilado (pasta build/). Rode `pnpm build` antes.');
    return 1;
  }

  const porta = argumentos.porta ?? portaDoAmbiente(process.env);
  const opcoes = opcoesDoComputador(porta, argumentos.atalho, sistema);
  const plano = planejarInicio(opcoes);

  console.log('');
  console.log(`Controle Financeiro: iniciar com o computador (${NOMES_SISTEMA[sistema]})`);
  console.log(`Site: http://127.0.0.1:${porta}`);
  console.log('Vou criar:');
  for (const arquivo of plano.arquivos) {
    console.log(`  - ${arquivo.descricao}: ${arquivo.caminho}`);
  }
  for (const pasta of plano.pastas) {
    console.log(`  - Pasta: ${pasta}`);
  }
  console.log('');

  if (argumentos.simular) {
    console.log('Simulação: nada foi criado nem ativado. Rode sem --simular para aplicar.');
    if (plano.ativar.length > 0) {
      console.log('Ativaria com:');
      for (const c of plano.ativar) console.log(`  ${c.texto}`);
    }
    return 0;
  }

  for (const pasta of plano.pastas) mkdirSync(pasta, { recursive: true });
  for (const arquivo of plano.arquivos) gravar(arquivo);

  if (plano.ativar.length > 0) {
    const ativar = await perguntarSimNao('Ativar agora?');
    if (ativar) {
      for (const c of plano.ativar) rodarComando(c);
      console.log('Ativado.');
    } else {
      console.log('Para ativar agora, rode:');
      for (const c of plano.ativar) console.log(`  ${c.texto}`);
    }
  }
  for (const aviso of plano.avisos) console.log(`Aviso: ${aviso}`);
  console.log('');
  console.log('Pronto. Para desfazer: pnpm parar-de-iniciar');
  return 0;
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((erro: unknown) => {
    if (erro instanceof ErroDeUso) {
      console.error(erro.message);
      console.error('');
      console.error(AJUDA);
      process.exit(2);
    }
    console.error(`Erro: ${(erro as Error).message}`);
    process.exit(1);
  });

/**
 * Iniciar com o computador: tipos, detecção e geradores comuns.
 *
 * Os geradores e os planos são puros: montam texto e caminhos, sem tocar o disco. Quem escreve
 * os arquivos ou ativa o serviço são os scripts (`pnpm iniciar-com-o-computador`,
 * `pnpm parar-de-iniciar`), e só eles. `opcoesDoComputador` é a única função que lê o sistema.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, win32 } from 'node:path';
import { raizDoProjeto } from '../config.ts';
import { pastaAreaDeTrabalhoLinux, planoLinux } from './linux.ts';
import { planoMac } from './macos.ts';
import { planoWindows } from './windows.ts';

export type Sistema = 'darwin' | 'win32' | 'linux';

export const NOME_APP = 'Controle Financeiro';
export const LABEL_LAUNCHD = 'com.controlefinanceiro.site';
export const NOME_UNIDADE_SYSTEMD = 'controle-financeiro.service';
export const PORTA_PADRAO = 5173;
export const VERSAO_NODE_MINIMA = '22.18.0';

/** Um comando a rodar (ativar ou desativar). `texto` é o que mostramos ao usuário. */
export interface Comando {
  exec: string;
  args: string[];
  texto: string;
  /** Se falhar (ex.: serviço que não estava carregado), segue em frente sem erro. */
  ignorarErro?: boolean;
}

export interface ArquivoPlano {
  caminho: string;
  conteudo: string;
  descricao: string;
  /** Marca como executável (arquivos .desktop no Linux). */
  executavel?: boolean;
  /** Grava em UTF-16LE com BOM (o WScript lê arquivos .vbs assim, sem estragar acentos). */
  utf16?: boolean;
}

export interface OpcoesInicio {
  sistema: Sistema;
  /** Pasta do projeto (onde ficam scripts/ e build/). */
  raiz: string;
  /** Caminho do Node que vai rodar o site. */
  node: string;
  porta: number;
  /** Se deve criar o atalho na área de trabalho. */
  atalho: boolean;
  /** Pasta pessoal do usuário. */
  home: string;
  /** Pasta da área de trabalho (já resolvida). */
  areaDeTrabalho: string;
  /** Windows: pasta AppData\Roaming. */
  appData?: string;
  /** macOS: uid do usuário, para `launchctl gui/<uid>`. */
  uid?: number;
  /** Linux: se o systemd do usuário está disponível (senão usa ~/.config/autostart). */
  systemdDisponivel?: boolean;
}

export interface PlanoInicio {
  arquivos: ArquivoPlano[];
  /** Pastas que precisam existir antes de gravar os arquivos. */
  pastas: string[];
  /** Comandos que ativam o serviço (rodados só sem --simular). */
  ativar: Comando[];
  avisos: string[];
}

export interface PlanoParada {
  /** Arquivos que existam e devem ser removidos. */
  remover: string[];
  /** Comandos que desativam o serviço antes de remover. */
  desativar: Comando[];
  avisos: string[];
}

export function sistemaSuportado(plataforma: string = process.platform): Sistema | null {
  return plataforma === 'darwin' || plataforma === 'win32' || plataforma === 'linux'
    ? plataforma
    : null;
}

/** Valida uma porta (1 a 65535). Lança RangeError com mensagem em português. */
export function validarPorta(valor: string | number): number {
  const texto = String(valor).trim();
  const numero = Number(texto);
  if (!/^\d+$/.test(texto) || !Number.isInteger(numero) || numero < 1 || numero > 65535) {
    throw new RangeError(`Porta inválida: ${valor}. Use um número entre 1 e 65535.`);
  }
  return numero;
}

/** Porta do site: PORT do ambiente (ou do .env, já carregado pelo script), padrão 5173. */
export function portaDoAmbiente(env: NodeJS.ProcessEnv = process.env): number {
  const bruto = env.PORT?.trim();
  return bruto ? validarPorta(bruto) : PORTA_PADRAO;
}

export function urlLocal(porta: number): string {
  return `http://127.0.0.1:${porta}`;
}

/** Node que está rodando este script. */
export function descobrirNode(): string {
  return process.execPath;
}

/** Escapa texto para dentro de elementos XML (plist). */
export function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function citarShell(texto: string): string {
  return /^[A-Za-z0-9_/.:=@%+,-]+$/.test(texto) ? texto : `'${texto.replace(/'/g, `'\\''`)}'`;
}

/** Monta um comando com os argumentos citados, só para mostrar ao usuário. */
export function comando(exec: string, args: string[], ignorarErro = false): Comando {
  const texto = [exec, ...args].map(citarShell).join(' ');
  return ignorarErro ? { exec, args, texto, ignorarErro } : { exec, args, texto };
}

/**
 * Plano de instalação para o sistema de `opcoes`. Não escreve nada: só descreve.
 */
export function planejarInicio(opcoes: OpcoesInicio): PlanoInicio {
  switch (opcoes.sistema) {
    case 'darwin':
      return planoMac(opcoes);
    case 'win32':
      return planoWindows(opcoes);
    case 'linux':
      return planoLinux(opcoes);
  }
}

/** Plano de remoção (desfazer). Não remove nada: só lista o que existe e o que desativar. */
export function planejarParada(
  opcoes: OpcoesInicio,
  existe: (caminho: string) => boolean = existsSync,
): PlanoParada {
  // No Linux o arquivo pode ser o do systemd ou o de autostart (se a instalação mudou): listamos os dois.
  const candidatos = new Set<string>();
  for (const systemdDisponivel of [true, false]) {
    const plano = planejarInicio({ ...opcoes, atalho: true, systemdDisponivel });
    for (const arquivo of plano.arquivos) candidatos.add(arquivo.caminho);
  }
  const remover = [...candidatos].filter((caminho) => existe(caminho));
  const desativar = planoDesativar(opcoes);
  return { remover, desativar, avisos: avisosDeParada(opcoes.sistema) };
}

function planoDesativar(opcoes: OpcoesInicio): Comando[] {
  if (opcoes.sistema === 'darwin') {
    const uid = opcoes.uid ?? 0;
    return [comando('launchctl', ['bootout', `gui/${uid}/${LABEL_LAUNCHD}`], true)];
  }
  if (opcoes.sistema === 'linux' && opcoes.systemdDisponivel) {
    return [
      comando('systemctl', ['--user', 'disable', '--now', NOME_UNIDADE_SYSTEMD], true),
      comando('systemctl', ['--user', 'daemon-reload'], true),
    ];
  }
  return [];
}

function avisosDeParada(sistema: Sistema): string[] {
  if (sistema === 'win32') {
    return [
      'No Windows o site continua rodando até você fechar o processo do Node (ou reiniciar).',
    ];
  }
  return [];
}

/**
 * Descreve o computador onde o script roda: pastas, Node, porta e (no Linux) se o systemd do
 * usuário está disponível. É a única função deste módulo que lê o sistema.
 */
export function opcoesDoComputador(
  porta: number,
  atalho: boolean,
  sistema: Sistema | null = sistemaSuportado(),
): OpcoesInicio {
  if (!sistema) {
    throw new Error(`Sistema "${process.platform}" não suportado. Use macOS, Windows ou Linux.`);
  }
  const home = homedir();
  const opcoes: OpcoesInicio = {
    sistema,
    raiz: raizDoProjeto(),
    node: descobrirNode(),
    porta,
    atalho,
    home,
    areaDeTrabalho: join(home, 'Desktop'),
  };
  if (sistema === 'win32') {
    opcoes.areaDeTrabalho = win32.join(home, 'Desktop');
    opcoes.appData = process.env.APPDATA ?? win32.join(home, 'AppData', 'Roaming');
  }
  if (sistema === 'darwin') {
    opcoes.uid = process.getuid?.() ?? 0;
  }
  if (sistema === 'linux') {
    const arquivoDirs = join(home, '.config', 'user-dirs.dirs');
    const userDirs = existsSync(arquivoDirs) ? readFileSync(arquivoDirs, 'utf8') : undefined;
    opcoes.areaDeTrabalho = pastaAreaDeTrabalhoLinux(home, userDirs);
    opcoes.systemdDisponivel = systemdUsuarioDisponivel();
  }
  return opcoes;
}

function systemdUsuarioDisponivel(): boolean {
  const resultado = spawnSync('systemctl', ['--user', 'show-environment'], { stdio: 'ignore' });
  return resultado.status === 0;
}

/** Compara "22.23.2" com "22.18.0". Negativo se a1 < a2. */
export function compararVersoes(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diferenca = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diferenca !== 0) return diferenca;
  }
  return 0;
}

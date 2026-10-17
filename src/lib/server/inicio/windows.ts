/**
 * Windows: script .vbs oculto na pasta Startup (roda `node scripts\iniciar.ts` sem janela)
 * e atalho .url na área de trabalho. Usa path.win32, então os caminhos saem certos em qualquer
 * sistema. Só gera texto e caminhos; ver comum.ts.
 */
import { win32 } from 'node:path';
import {
  comando,
  NOME_APP,
  urlLocal,
  type ArquivoPlano,
  type OpcoesInicio,
  type PlanoInicio,
} from './comum.ts';

/** Literal de texto para VBScript: aspas dobradas. */
function vbs(texto: string): string {
  return `"${texto.replace(/"/g, '""')}"`;
}

export interface OpcoesVbs {
  node: string;
  raiz: string;
  porta: number;
}

/** Script VBScript que sobe o site sem janela. Gravar em UTF-16LE (ver ArquivoPlano.utf16). */
export function gerarVbsInicio({ node, raiz, porta }: OpcoesVbs): string {
  const iniciar = win32.join(raiz, 'scripts', 'iniciar.ts');
  return [
    "' Controle Financeiro: sobe o site em segundo plano, sem janela, ao entrar no Windows.",
    "' Para desativar: pnpm parar-de-iniciar (ou apague este arquivo).",
    'Set sh = CreateObject("WScript.Shell")',
    `sh.CurrentDirectory = ${vbs(raiz)}`,
    `sh.Environment("PROCESS")("PORT") = ${vbs(String(porta))}`,
    `sh.Run ${vbs(`"${node}" "${iniciar}"`)}, 0, False`,
    '',
  ].join('\r\n');
}

/** Pasta Startup do usuário (inicia com o Windows). */
export function caminhoStartupWindows(appData: string): string {
  return win32.join(
    appData,
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
    'controle-financeiro.vbs',
  );
}

/** Atalho .url (abre a URL no navegador padrão). */
export function gerarAtalhoUrl(url: string): string {
  return `[InternetShortcut]\r\nURL=${url}\r\n`;
}

export function caminhoAtalhoWindows(areaDeTrabalho: string): string {
  return win32.join(areaDeTrabalho, `${NOME_APP}.url`);
}

export function planoWindows(opcoes: OpcoesInicio): PlanoInicio {
  if (!opcoes.appData) throw new Error('Windows: falta a pasta AppData do usuário.');
  const caminhoVbs = caminhoStartupWindows(opcoes.appData);
  const arquivos: ArquivoPlano[] = [
    {
      caminho: caminhoVbs,
      conteudo: gerarVbsInicio({ node: opcoes.node, raiz: opcoes.raiz, porta: opcoes.porta }),
      descricao: 'Inicialização com o Windows (pasta Startup)',
      utf16: true,
    },
  ];
  if (opcoes.atalho) {
    arquivos.push({
      caminho: caminhoAtalhoWindows(opcoes.areaDeTrabalho),
      conteudo: gerarAtalhoUrl(urlLocal(opcoes.porta)),
      descricao: 'Atalho na área de trabalho',
    });
  }
  return {
    arquivos,
    pastas: [win32.dirname(caminhoVbs)],
    ativar: [comando('wscript.exe', [caminhoVbs])],
    avisos: ['Ele inicia sozinho no próximo login. O comando acima inicia agora.'],
  };
}

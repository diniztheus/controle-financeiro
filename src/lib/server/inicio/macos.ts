/**
 * macOS: LaunchAgent (launchd) que sobe o site ao entrar, e atalho .webloc na área de trabalho.
 * Só gera texto e caminhos; ver comum.ts.
 */
import { dirname, join } from 'node:path';
import {
  comando,
  escaparXml,
  LABEL_LAUNCHD,
  NOME_APP,
  urlLocal,
  type ArquivoPlano,
  type OpcoesInicio,
  type PlanoInicio,
} from './comum.ts';

export interface OpcoesPlist {
  node: string;
  raiz: string;
  porta: number;
  /** Pasta dos logs (stdout e stderr). */
  logs: string;
}

const linhaString = (texto: string, nivel = 1) =>
  `${'\t'.repeat(nivel)}<string>${escaparXml(texto)}</string>`;

/** Plist do LaunchAgent: roda `node scripts/iniciar.ts` na pasta do projeto. */
export function gerarPlistLaunchd({ node, raiz, porta, logs }: OpcoesPlist): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '\t<key>Label</key>',
    linhaString(LABEL_LAUNCHD),
    '\t<key>ProgramArguments</key>',
    '\t<array>',
    linhaString(node, 2),
    linhaString(join(raiz, 'scripts', 'iniciar.ts'), 2),
    '\t</array>',
    '\t<key>WorkingDirectory</key>',
    linhaString(raiz),
    '\t<key>RunAtLoad</key>',
    '\t<true/>',
    '\t<key>KeepAlive</key>',
    '\t<dict>',
    '\t\t<key>SuccessfulExit</key>',
    '\t\t<false/>',
    '\t</dict>',
    '\t<key>StandardOutPath</key>',
    linhaString(join(logs, 'saida.log')),
    '\t<key>StandardErrorPath</key>',
    linhaString(join(logs, 'erro.log')),
    '\t<key>EnvironmentVariables</key>',
    '\t<dict>',
    '\t\t<key>PORT</key>',
    linhaString(String(porta), 2),
    '\t</dict>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

export function caminhoPlist(home: string): string {
  return join(home, 'Library', 'LaunchAgents', `${LABEL_LAUNCHD}.plist`);
}

export function pastaLogsMac(home: string): string {
  return join(home, 'Library', 'Logs', 'ControleFinanceiro');
}

export function caminhoAtalhoMac(areaDeTrabalho: string): string {
  return join(areaDeTrabalho, `${NOME_APP}.webloc`);
}

/** Atalho .webloc (plist XML com a URL). Abre o site no navegador padrão. */
export function gerarAtalhoMac(url: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '\t<key>URL</key>',
    linhaString(url),
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

export function planoMac(opcoes: OpcoesInicio): PlanoInicio {
  const plist = caminhoPlist(opcoes.home);
  const logs = pastaLogsMac(opcoes.home);
  const uid = opcoes.uid ?? 0;
  const arquivos: ArquivoPlano[] = [
    {
      caminho: plist,
      conteudo: gerarPlistLaunchd({
        node: opcoes.node,
        raiz: opcoes.raiz,
        porta: opcoes.porta,
        logs,
      }),
      descricao: 'Serviço do macOS (sobe o site ao entrar)',
    },
  ];
  if (opcoes.atalho) {
    arquivos.push({
      caminho: caminhoAtalhoMac(opcoes.areaDeTrabalho),
      conteudo: gerarAtalhoMac(urlLocal(opcoes.porta)),
      descricao: 'Atalho na área de trabalho',
    });
  }
  return {
    arquivos,
    pastas: [dirname(plist), logs],
    ativar: [
      // Se já estava carregado, tira antes; na primeira vez o erro é esperado.
      comando('launchctl', ['bootout', `gui/${uid}/${LABEL_LAUNCHD}`], true),
      comando('launchctl', ['bootstrap', `gui/${uid}`, plist]),
    ],
    avisos: [`Logs do site em: ${logs}`],
  };
}

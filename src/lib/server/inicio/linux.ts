/**
 * Linux: serviço de usuário do systemd (sobe o site ao entrar) e, sem systemd do usuário,
 * entrada em ~/.config/autostart. Também gera o atalho .desktop da área de trabalho.
 * Só gera texto e caminhos; ver comum.ts.
 */
import { dirname, join } from 'node:path';
import {
  comando,
  NOME_APP,
  type Comando,
  NOME_UNIDADE_SYSTEMD,
  urlLocal,
  type ArquivoPlano,
  type OpcoesInicio,
  type PlanoInicio,
} from './comum.ts';

const SEGURO = /^[A-Za-z0-9_/.:@+=,-]+$/;

/**
 * Cita um argumento para ExecStart= do systemd: aspas duplas, `\` e `"` escapados, `$` dobrado
 * (senão o systemd expande variáveis) e `%` dobrado (senão vira especificador).
 */
export function quotarSystemd(argumento: string): string {
  if (SEGURO.test(argumento)) return argumento;
  const escapado = argumento
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '$$$$')
    .replace(/%/g, '%%');
  return `"${escapado}"`;
}

/** Cita um argumento para Exec= de um arquivo .desktop (XDG). */
export function quotarExecDesktop(argumento: string): string {
  if (SEGURO.test(argumento)) return argumento;
  const escapado = argumento.replace(/(["`$\\])/g, '\\$1').replace(/%/g, '%%');
  return `"${escapado}"`;
}

export interface OpcoesServico {
  node: string;
  raiz: string;
  porta: number;
}

/** Serviço de usuário do systemd: WantedBy=default.target sobe no login. */
export function gerarUnitSystemd({ node, raiz, porta }: OpcoesServico): string {
  const iniciar = join(raiz, 'scripts', 'iniciar.ts');
  return [
    '[Unit]',
    'Description=Controle Financeiro (site local de finanças)',
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    `WorkingDirectory=${raiz.replace(/%/g, '%%')}`,
    `Environment=PORT=${porta}`,
    `ExecStart=${quotarSystemd(node)} ${quotarSystemd(iniciar)}`,
    'Restart=on-failure',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

/** Entrada de autostart (fallback sem systemd do usuário). */
export function gerarDesktopAutostart({ node, raiz, porta }: OpcoesServico): string {
  const iniciar = join(raiz, 'scripts', 'iniciar.ts');
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${NOME_APP} (servidor)`,
    `Exec=env PORT=${porta} ${quotarExecDesktop(node)} ${quotarExecDesktop(iniciar)}`,
    `Path=${raiz}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

/** Atalho .desktop (tipo Link) que abre a URL no navegador. */
export function gerarDesktopEntry(url: string): string {
  return [
    '[Desktop Entry]',
    'Type=Link',
    `Name=${NOME_APP}`,
    `URL=${url}`,
    'Icon=web-browser',
    '',
  ].join('\n');
}

export function caminhoUnitSystemd(home: string): string {
  return join(home, '.config', 'systemd', 'user', NOME_UNIDADE_SYSTEMD);
}

export function caminhoAutostartLinux(home: string): string {
  return join(home, '.config', 'autostart', 'controle-financeiro.desktop');
}

export function caminhoAtalhoLinux(areaDeTrabalho: string): string {
  return join(areaDeTrabalho, `${NOME_APP}.desktop`);
}

/**
 * Pasta da área de trabalho segundo ~/.config/user-dirs.dirs (funciona com nomes localizados,
 * como "Área de Trabalho"). Sem o arquivo, usa ~/Desktop.
 */
export function pastaAreaDeTrabalhoLinux(home: string, userDirs?: string): string {
  const achado = userDirs?.match(/^XDG_DESKTOP_DIR="(.+)"\s*$/m)?.[1];
  if (achado?.startsWith('$HOME')) return join(home, achado.slice('$HOME'.length));
  if (achado?.startsWith('/')) return achado;
  return join(home, 'Desktop');
}

export function planoLinux(opcoes: OpcoesInicio): PlanoInicio {
  const servico = { node: opcoes.node, raiz: opcoes.raiz, porta: opcoes.porta };
  const arquivos: ArquivoPlano[] = [];
  const pastas: string[] = [];
  const avisos: string[] = [];
  let ativar: Comando[] = [];

  if (opcoes.systemdDisponivel) {
    const unidade = caminhoUnitSystemd(opcoes.home);
    arquivos.push({
      caminho: unidade,
      conteudo: gerarUnitSystemd(servico),
      descricao: 'Serviço do systemd (sobe o site ao entrar)',
    });
    pastas.push(dirname(unidade));
    ativar = [
      comando('systemctl', ['--user', 'daemon-reload']),
      comando('systemctl', ['--user', 'enable', '--now', NOME_UNIDADE_SYSTEMD]),
    ];
  } else {
    const autostart = caminhoAutostartLinux(opcoes.home);
    arquivos.push({
      caminho: autostart,
      conteudo: gerarDesktopAutostart(servico),
      descricao: 'Inicialização com a sessão (systemd do usuário indisponível)',
      executavel: true,
    });
    pastas.push(dirname(autostart));
    avisos.push('Sem systemd do usuário: o site sobe no próximo login gráfico, não agora.');
  }

  if (opcoes.atalho) {
    arquivos.push({
      caminho: caminhoAtalhoLinux(opcoes.areaDeTrabalho),
      conteudo: gerarDesktopEntry(urlLocal(opcoes.porta)),
      descricao: 'Atalho na área de trabalho',
      executavel: true,
    });
  }
  return { arquivos, pastas, ativar, avisos };
}

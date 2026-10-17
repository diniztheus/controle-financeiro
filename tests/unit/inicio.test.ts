import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  compararVersoes,
  escaparXml,
  planejarInicio,
  planejarParada,
  portaDoAmbiente,
  type OpcoesInicio,
} from '../../src/lib/server/inicio/comum.ts';
import {
  pastaAreaDeTrabalhoLinux,
  quotarExecDesktop,
  quotarSystemd,
  gerarDesktopAutostart,
  gerarDesktopEntry,
  gerarUnitSystemd,
} from '../../src/lib/server/inicio/linux.ts';
import {
  caminhoPlist,
  gerarAtalhoMac,
  gerarPlistLaunchd,
} from '../../src/lib/server/inicio/macos.ts';
import {
  caminhoStartupWindows,
  gerarAtalhoUrl,
  gerarVbsInicio,
} from '../../src/lib/server/inicio/windows.ts';

const RAIZ = resolve(__dirname, '../..');
const SCRIPT_INICIAR = join(RAIZ, 'scripts', 'iniciar-com-o-computador.ts');
const SCRIPT_PARAR = join(RAIZ, 'scripts', 'parar-de-iniciar.ts');

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cf-inicio-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** Opções de teste: caminhos fictícios, nada é lido nem escrito. */
function opcoes(extra: Partial<OpcoesInicio> = {}): OpcoesInicio {
  return {
    sistema: 'darwin',
    raiz: '/Users/ana/Meu Projeto & Cia/site',
    node: '/usr/local/bin/node',
    porta: 5173,
    atalho: false,
    home: '/Users/ana',
    areaDeTrabalho: '/Users/ana/Desktop',
    uid: 501,
    ...extra,
  };
}

describe('escapes', () => {
  it('escapaXml protege os caracteres especiais', () => {
    expect(escaparXml(`a & b <c> "d" 'e'`)).toBe('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;');
  });

  it('quotarSystemd deixa caminhos simples e cita os com espaço, $ e %', () => {
    expect(quotarSystemd('/usr/bin/node')).toBe('/usr/bin/node');
    expect(quotarSystemd('/x/Meu Projeto')).toBe('"/x/Meu Projeto"');
    expect(quotarSystemd('/x/$HOME 100%/"q"')).toBe('"/x/$$HOME 100%%/\\"q\\""');
  });

  it('quotarExecDesktop cita aspas, crase, $ e barra', () => {
    expect(quotarExecDesktop('/a b/`c`')).toBe('"/a b/\\`c\\`"');
    expect(quotarExecDesktop('/a/100%')).toBe('"/a/100%%"');
  });
});

describe('porta e versões', () => {
  it('portaDoAmbiente usa PORT ou 5173 e recusa valores inválidos', () => {
    expect(portaDoAmbiente({})).toBe(5173);
    expect(portaDoAmbiente({ PORT: ' 8080 ' })).toBe(8080);
    expect(() => portaDoAmbiente({ PORT: 'abc' })).toThrow(RangeError);
    expect(() => portaDoAmbiente({ PORT: '0' })).toThrow(RangeError);
    expect(() => portaDoAmbiente({ PORT: '70000' })).toThrow(RangeError);
  });

  it('compararVersoes compara versões do Node', () => {
    expect(compararVersoes('22.23.2', '22.18.0')).toBeGreaterThan(0);
    expect(compararVersoes('22.17.9', '22.18.0')).toBeLessThan(0);
    expect(compararVersoes('22.18.0', '22.18.0')).toBe(0);
  });
});

describe('macOS', () => {
  it('plist do LaunchAgent (caminho com espaço e &)', () => {
    expect(
      gerarPlistLaunchd({
        node: '/usr/local/bin/node',
        raiz: '/Users/ana/Meu Projeto & Cia/site',
        porta: 5173,
        logs: '/Users/ana/Library/Logs/ControleFinanceiro',
      }),
    ).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
      <plist version="1.0">
      <dict>
      	<key>Label</key>
      	<string>com.controlefinanceiro.site</string>
      	<key>ProgramArguments</key>
      	<array>
      		<string>/usr/local/bin/node</string>
      		<string>/Users/ana/Meu Projeto &amp; Cia/site/scripts/iniciar.ts</string>
      	</array>
      	<key>WorkingDirectory</key>
      	<string>/Users/ana/Meu Projeto &amp; Cia/site</string>
      	<key>RunAtLoad</key>
      	<true/>
      	<key>KeepAlive</key>
      	<dict>
      		<key>SuccessfulExit</key>
      		<false/>
      	</dict>
      	<key>StandardOutPath</key>
      	<string>/Users/ana/Library/Logs/ControleFinanceiro/saida.log</string>
      	<key>StandardErrorPath</key>
      	<string>/Users/ana/Library/Logs/ControleFinanceiro/erro.log</string>
      	<key>EnvironmentVariables</key>
      	<dict>
      		<key>PORT</key>
      		<string>5173</string>
      	</dict>
      </dict>
      </plist>
      "
    `);
  });

  it('caminho do plist fica em ~/Library/LaunchAgents (HOME temporário)', () => {
    expect(caminhoPlist(home)).toBe(
      join(home, 'Library', 'LaunchAgents', 'com.controlefinanceiro.site.plist'),
    );
  });

  it('atalho .webloc com a URL', () => {
    expect(gerarAtalhoMac('http://127.0.0.1:5173')).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
      <plist version="1.0">
      <dict>
      	<key>URL</key>
      	<string>http://127.0.0.1:5173</string>
      </dict>
      </plist>
      "
    `);
  });

  it('planejarInicio descreve bootout + bootstrap sem escrever nada', () => {
    const plano = planejarInicio(
      opcoes({ home, areaDeTrabalho: join(home, 'Desktop'), atalho: true }),
    );
    expect(plano.arquivos.map((a) => a.caminho)).toEqual([
      join(home, 'Library', 'LaunchAgents', 'com.controlefinanceiro.site.plist'),
      join(home, 'Desktop', 'Controle Financeiro.webloc'),
    ]);
    expect(plano.pastas).toContain(join(home, 'Library', 'Logs', 'ControleFinanceiro'));
    expect(plano.ativar.map((c) => c.args)).toEqual([
      ['bootout', 'gui/501/com.controlefinanceiro.site'],
      [
        'bootstrap',
        'gui/501',
        join(home, 'Library', 'LaunchAgents', 'com.controlefinanceiro.site.plist'),
      ],
    ]);
    expect(readdirSync(home)).toEqual([]);
  });
});

describe('Windows', () => {
  const appData = 'C:\\Users\\Ana\\AppData\\Roaming';

  it('script VBS oculto (aspas dobradas, PORT, caminho com espaço)', () => {
    expect(
      gerarVbsInicio({
        node: 'C:\\Program Files\\nodejs\\node.exe',
        raiz: 'C:\\Users\\Ana\\Meu Projeto "B"',
        porta: 5173,
      }),
    ).toMatchInlineSnapshot(`
      "' Controle Financeiro: sobe o site em segundo plano, sem janela, ao entrar no Windows.
      ' Para desativar: pnpm parar-de-iniciar (ou apague este arquivo).
      Set sh = CreateObject("WScript.Shell")
      sh.CurrentDirectory = "C:\\Users\\Ana\\Meu Projeto ""B"""
      sh.Environment("PROCESS")("PORT") = "5173"
      sh.Run """C:\\Program Files\\nodejs\\node.exe"" ""C:\\Users\\Ana\\Meu Projeto ""B""\\scripts\\iniciar.ts""", 0, False
      "
    `);
  });

  it('caminho da pasta Startup', () => {
    expect(caminhoStartupWindows(appData)).toBe(
      'C:\\Users\\Ana\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\controle-financeiro.vbs',
    );
  });

  it('atalho .url', () => {
    expect(gerarAtalhoUrl('http://127.0.0.1:5173')).toMatchInlineSnapshot(`
      "[InternetShortcut]
      URL=http://127.0.0.1:5173
      "
    `);
  });

  it('planejarInicio marca o VBS para gravar em UTF-16 e não usa caminhos POSIX', () => {
    const plano = planejarInicio(
      opcoes({
        sistema: 'win32',
        raiz: 'C:\\Users\\Ana\\Controle',
        node: 'C:\\node.exe',
        home: 'C:\\Users\\Ana',
        appData,
        areaDeTrabalho: 'C:\\Users\\Ana\\Desktop',
        atalho: true,
        uid: undefined,
      }),
    );
    expect(plano.arquivos[0]!.utf16).toBe(true);
    expect(plano.arquivos[0]!.caminho).toMatch(/\\Startup\\controle-financeiro\.vbs$/);
    expect(plano.arquivos[1]!.caminho).toBe('C:\\Users\\Ana\\Desktop\\Controle Financeiro.url');
    expect(plano.ativar[0]!.exec).toBe('wscript.exe');
  });
});

describe('Linux', () => {
  it('unidade do systemd (caminho com espaço e %)', () => {
    expect(
      gerarUnitSystemd({ node: '/usr/bin/node', raiz: '/home/ana/Meu Projeto 100%', porta: 5173 }),
    ).toMatchInlineSnapshot(`
      "[Unit]
      Description=Controle Financeiro (site local de finanças)
      After=network.target

      [Service]
      Type=simple
      WorkingDirectory=/home/ana/Meu Projeto 100%%
      Environment=PORT=5173
      ExecStart=/usr/bin/node "/home/ana/Meu Projeto 100%%/scripts/iniciar.ts"
      Restart=on-failure
      RestartSec=5

      [Install]
      WantedBy=default.target
      "
    `);
  });

  it('entrada de autostart (fallback)', () => {
    expect(gerarDesktopAutostart({ node: '/usr/bin/node', raiz: '/home/ana/site', porta: 8080 }))
      .toMatchInlineSnapshot(`
      "[Desktop Entry]
      Type=Application
      Name=Controle Financeiro (servidor)
      Exec=env PORT=8080 /usr/bin/node /home/ana/site/scripts/iniciar.ts
      Path=/home/ana/site
      Terminal=false
      X-GNOME-Autostart-enabled=true
      "
    `);
  });

  it('atalho .desktop (tipo Link)', () => {
    expect(gerarDesktopEntry('http://127.0.0.1:5173')).toMatchInlineSnapshot(`
      "[Desktop Entry]
      Type=Link
      Name=Controle Financeiro
      URL=http://127.0.0.1:5173
      Icon=web-browser
      "
    `);
  });

  it('pasta da área de trabalho segue user-dirs.dirs (nome localizado)', () => {
    expect(
      pastaAreaDeTrabalhoLinux('/home/ana', 'XDG_DESKTOP_DIR="$HOME/Área de Trabalho"\n'),
    ).toBe(join('/home/ana', 'Área de Trabalho'));
    expect(pastaAreaDeTrabalhoLinux('/home/ana')).toBe(join('/home/ana', 'Desktop'));
  });

  it('com systemd: unidade em ~/.config/systemd/user e ativação com systemctl', () => {
    const plano = planejarInicio(
      opcoes({
        sistema: 'linux',
        home,
        areaDeTrabalho: join(home, 'Desktop'),
        systemdDisponivel: true,
        uid: undefined,
      }),
    );
    expect(plano.arquivos[0]!.caminho).toBe(
      join(home, '.config', 'systemd', 'user', 'controle-financeiro.service'),
    );
    expect(plano.ativar.map((c) => c.texto)).toEqual([
      'systemctl --user daemon-reload',
      'systemctl --user enable --now controle-financeiro.service',
    ]);
  });

  it('sem systemd: cai no autostart e não promete iniciar agora', () => {
    const plano = planejarInicio(
      opcoes({
        sistema: 'linux',
        home,
        areaDeTrabalho: join(home, 'Desktop'),
        systemdDisponivel: false,
        uid: undefined,
      }),
    );
    expect(plano.arquivos[0]!.caminho).toBe(
      join(home, '.config', 'autostart', 'controle-financeiro.desktop'),
    );
    expect(plano.ativar).toEqual([]);
    expect(plano.avisos.length).toBe(1);
  });
});

describe('planos e remoção', () => {
  it('sem --atalho só o serviço é planejado', () => {
    expect(planejarInicio(opcoes({ atalho: false })).arquivos).toHaveLength(1);
    expect(planejarInicio(opcoes({ atalho: true })).arquivos).toHaveLength(2);
  });

  it('planejarParada lista só o que existe', () => {
    const existentes = new Set([
      join(home, 'Library', 'LaunchAgents', 'com.controlefinanceiro.site.plist'),
    ]);
    const parada = planejarParada(opcoes({ home, areaDeTrabalho: join(home, 'Desktop') }), (c) =>
      existentes.has(c),
    );
    expect(parada.remover).toEqual([
      join(home, 'Library', 'LaunchAgents', 'com.controlefinanceiro.site.plist'),
    ]);
    expect(parada.desativar[0]!.ignorarErro).toBe(true);
    expect(planejarParada(opcoes({ home }), () => false).remover).toEqual([]);
  });
});

describe('scripts (--simular, HOME temporário)', () => {
  function rodar(script: string, args: string[]) {
    return spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData') },
    });
  }

  it('iniciar --simular não escreve nada e sai com 0', () => {
    const resultado = rodar(SCRIPT_INICIAR, ['--simular', '--atalho', '--porta', '5180']);
    expect(resultado.status, resultado.stderr).toBe(0);
    expect(resultado.stdout).toContain('Simulação: nada foi criado');
    expect(resultado.stdout).toContain('5180');
    expect(readdirSync(home)).toEqual([]);
  });

  it('porta inválida sai com código 2', () => {
    const resultado = rodar(SCRIPT_INICIAR, ['--porta', '99999']);
    expect(resultado.status).toBe(2);
    expect(resultado.stderr).toContain('Porta inválida');
    expect(readdirSync(home)).toEqual([]);
  });

  it('opção desconhecida sai com código 2', () => {
    const resultado = rodar(SCRIPT_INICIAR, ['--xis']);
    expect(resultado.status).toBe(2);
  });

  it('parar sem nada configurado sai com 0 e não remove nada', () => {
    const resultado = rodar(SCRIPT_PARAR, ['--simular']);
    expect(resultado.status, resultado.stderr).toBe(0);
    expect(resultado.stdout).toContain('Nada para remover');
    expect(readdirSync(home)).toEqual([]);
  });
});

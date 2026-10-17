import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../../src/lib/server/db/conexao';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import { definirPin, removerPin } from '../../src/lib/server/servicos/pin';
import { criarCookie, cookieValido } from '../../src/lib/server/sessaoPin';
import {
  acessoRedeLigado,
  caminhoLivre,
  decidirAcesso,
  ehDestinoSeguro,
  hostAceito,
  verificarPedido,
  type AcessoPedido,
} from '../../src/lib/server/seguranca';
import { bancoEmMemoria } from './ajuda-banco';

const T0 = new Date('2026-10-17T12:00:00Z');
const HORA = 60 * 60 * 1000;

let banco: Banco;

beforeEach(() => {
  banco = bancoEmMemoria();
});
afterEach(() => banco.sqlite.close());

// ---------------------------------------------------------------- cookie de sessão

describe('cookie de sessão', () => {
  beforeEach(() => definirPin(banco, '1234', undefined, T0));

  it('formato v1.<expiraEmMs>.<hmac hex> e opções seguras', () => {
    const c = criarCookie(banco, { lembrar: false, agora: T0 });
    expect(c.nome).toBe('cf_sessao');
    expect(c.valor).toMatch(/^v1\.\d+\.[0-9a-f]{64}$/);
    expect(c.opcoes).toEqual({ httpOnly: true, sameSite: 'strict', path: '/' });
  });

  it('manter conectado: 30 dias de maxAge; sem ele, sem maxAge', () => {
    expect(criarCookie(banco, { lembrar: true, agora: T0 }).opcoes.maxAge).toBe(30 * 24 * 3600);
    expect(criarCookie(banco, { lembrar: false, agora: T0 }).opcoes).not.toHaveProperty('maxAge');
  });

  it('sem "manter conectado" vale 12 horas; com ele, 30 dias', () => {
    const curto = criarCookie(banco, { lembrar: false, agora: T0 }).valor;
    const longo = criarCookie(banco, { lembrar: true, agora: T0 }).valor;
    expect(cookieValido(banco, curto, new Date(T0.getTime() + 11 * HORA))).toBe(true);
    expect(cookieValido(banco, curto, new Date(T0.getTime() + 13 * HORA))).toBe(false);
    expect(cookieValido(banco, longo, new Date(T0.getTime() + 13 * HORA))).toBe(true);
    expect(cookieValido(banco, longo, new Date(T0.getTime() + 31 * 24 * HORA))).toBe(false);
  });

  it('cookie adulterado é recusado (assinatura ou expiração trocadas)', () => {
    const valor = criarCookie(banco, { lembrar: true, agora: T0 }).valor;
    const [v = '', exp = '', hmac = ''] = valor.split('.');
    const trocaUltimo = hmac.slice(0, -1) + (hmac.endsWith('0') ? '1' : '0');
    const expEstendida = `${v}.${Number(exp) + 10 * 24 * HORA}.${hmac}`;
    expect(cookieValido(banco, `${v}.${exp}.${trocaUltimo}`, T0)).toBe(false);
    expect(cookieValido(banco, expEstendida, T0)).toBe(false);
    expect(cookieValido(banco, valor, T0)).toBe(true);
  });

  it.each([
    undefined,
    null,
    '',
    'v1',
    'v1.1.2',
    'v2.9999999999999.' + 'a'.repeat(64),
    'v1.abc.' + 'a'.repeat(64),
    'v1.9999999999999.' + 'A'.repeat(64),
    'x'.repeat(300),
  ])('formato ruim %j é recusado sem lançar', (valor) => {
    expect(cookieValido(banco, valor, T0)).toBe(false);
  });

  it('trocar o PIN derruba o cookie antigo; remover o PIN também', () => {
    const valor = criarCookie(banco, { lembrar: true, agora: T0 }).valor;
    removerPin(banco, '1234', T0);
    expect(cookieValido(banco, valor, T0)).toBe(false);
    definirPin(banco, '1234', undefined, T0);
    expect(cookieValido(banco, valor, T0)).toBe(false);
  });

  it('sem PIN não há cookie: criar lança e validar dá falso', () => {
    removerPin(banco, '1234', T0);
    expect(() => criarCookie(banco, { lembrar: true, agora: T0 })).toThrow(ErroDeNegocio);
    expect(cookieValido(banco, 'v1.9999999999999.' + 'a'.repeat(64), T0)).toBe(false);
  });
});

// ---------------------------------------------------------------- gate

const base: AcessoPedido = {
  pinAtivo: false,
  caminho: '/gastos',
  metodo: 'GET',
  cookieValido: false,
  hostEhLoopback: true,
  acessoRede: false,
};
const com = (p: Partial<AcessoPedido>) => decidirAcesso({ ...base, ...p });

describe('caminhos livres (valem sempre)', () => {
  it.each([
    '/pin',
    '/pin?voltar=%2Fgastos',
    '/_app/immutable/chunks/x.js',
    '/favicon.svg',
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/service-worker.js',
    '/robots.txt',
  ])('%s passa com PIN e sem cookie, mesmo em POST', (caminho) => {
    expect(com({ pinAtivo: true, caminho })).toEqual({ acao: 'seguir' });
    expect(com({ pinAtivo: true, caminho, metodo: 'POST' })).toEqual({ acao: 'seguir' });
    expect(caminhoLivre(caminho)).toBe(true);
  });

  it('caminho comum não é livre', () => {
    expect(caminhoLivre('/gastos')).toBe(false);
    expect(caminhoLivre('/pinos')).toBe(false);
  });
});

describe('com PIN ativo', () => {
  const sem = { pinAtivo: true };

  it('navegação sem cookie vai para /pin com voltar (caminho e busca)', () => {
    expect(com({ ...sem, caminho: '/gastos' })).toEqual({
      acao: 'redirecionar',
      para: '/pin?voltar=%2Fgastos',
    });
    expect(com({ ...sem, caminho: '/ok?a=1' })).toEqual({
      acao: 'redirecionar',
      para: '/pin?voltar=%2Fok%3Fa%3D1',
    });
    expect(com({ ...sem, caminho: '/', metodo: 'HEAD' })).toEqual({
      acao: 'redirecionar',
      para: '/pin?voltar=%2F',
    });
  });

  it.each(['//evil.com', '/\\evil', 'http://x', '/\t/evil.com', '/a\nb', 'gastos'])(
    'voltar malicioso %j cai em /pin sem voltar',
    (caminho) => {
      expect(com({ ...sem, caminho })).toEqual({ acao: 'redirecionar', para: '/pin' });
    },
  );

  it('outros métodos sem cookie recebem 401', () => {
    expect(com({ ...sem, metodo: 'POST' })).toEqual({
      acao: 'recusar',
      status: 401,
      motivo: 'Entre com o PIN primeiro',
    });
    expect(com({ ...sem, metodo: 'DELETE' }).acao).toBe('recusar');
  });

  it('com cookie válido segue, qualquer método', () => {
    expect(com({ ...sem, cookieValido: true })).toEqual({ acao: 'seguir' });
    expect(com({ ...sem, cookieValido: true, metodo: 'POST' })).toEqual({ acao: 'seguir' });
  });

  it('vale também em localhost, não só na rede', () => {
    expect(com({ ...sem, hostEhLoopback: true, acessoRede: false }).acao).toBe('redirecionar');
  });
});

describe('sem PIN', () => {
  it('segue no próprio computador', () => {
    expect(com({ acessoRede: true, hostEhLoopback: true })).toEqual({ acao: 'seguir' });
    expect(com({ acessoRede: false, hostEhLoopback: false })).toEqual({ acao: 'seguir' });
  });

  it('pela rede, sem PIN, recusa 403 com orientação', () => {
    const r = com({ acessoRede: true, hostEhLoopback: false });
    expect(r).toEqual({
      acao: 'recusar',
      status: 403,
      motivo: 'Para acessar pela rede, defina um PIN em http://127.0.0.1:5173/configuracoes',
    });
    expect(com({ acessoRede: true, hostEhLoopback: false, porta: '4000' })).toMatchObject({
      motivo: expect.stringContaining('http://127.0.0.1:4000/configuracoes'),
    });
  });

  it('a tela de PIN continua livre mesmo assim', () => {
    expect(com({ acessoRede: true, hostEhLoopback: false, caminho: '/pin' })).toEqual({
      acao: 'seguir',
    });
  });
});

describe('destino de volta (voltar)', () => {
  it.each(['/', '/gastos', '/gastos?mes=2026-10', '/a/b/c'])('seguro: %s', (c) =>
    expect(ehDestinoSeguro(c)).toBe(true),
  );
  it.each([
    '//evil.com',
    '/\\evil',
    '/\\\\evil',
    'http://x',
    'https://x',
    '',
    ' /x',
    'x',
    '/\n',
    '/\t//x',
    null,
    undefined,
  ])('inseguro: %j', (c) => expect(ehDestinoSeguro(c)).toBe(false));
});

// ---------------------------------------------------------------- hosts de rede

describe('acesso pela rede (ACESSO_REDE)', () => {
  it('a flag só vale com "1"', () => {
    expect(acessoRedeLigado({ ACESSO_REDE: '1' })).toBe(true);
    expect(acessoRedeLigado({ ACESSO_REDE: ' 1 ' })).toBe(true);
    expect(acessoRedeLigado({ ACESSO_REDE: 'true' })).toBe(false);
    expect(acessoRedeLigado({ ACESSO_REDE: '0' })).toBe(false);
    expect(acessoRedeLigado({})).toBe(false);
  });

  it.each(['192.168.0.5:5173', 'meu-mac:5173', '10.0.0.7', 'evil.com:5173'])(
    'sem a flag, %s é recusado',
    (h) => expect(hostAceito(h, false)).toBe(false),
  );

  it.each([
    '192.168.0.5:5173',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.1',
    '169.254.10.1',
    'meu-mac:5173',
    'meu.local:5173',
    '0xC0.0xA8.0.5:5173',
    '127.0.0.1:5173',
    'localhost:5173',
    '[::1]:5173',
  ])('com a flag, %s é aceito', (h) => expect(hostAceito(h, true)).toBe(true));

  it.each([
    '8.8.8.8',
    '172.32.0.1',
    '172.15.0.1',
    'evil.com',
    'evil.com:5173',
    'evil.local.com',
    '127.0.0.1.nip.io:5173',
    'meu-mac.evil.com',
    '',
    null,
  ])('com a flag, %j continua recusado', (h) => expect(hostAceito(h, true)).toBe(false));

  it('verificarPedido aceita a rede com a flag e mantém a checagem de Origin', () => {
    const get = { metodo: 'GET', host: '192.168.0.5:5173', origin: null, secFetchSite: null };
    expect(verificarPedido(get)?.status).toBe(403);
    expect(verificarPedido({ ...get, acessoRede: true })).toBeNull();

    const post = { metodo: 'POST', host: '192.168.0.5:5173', secFetchSite: null };
    expect(
      verificarPedido({ ...post, origin: 'http://192.168.0.5:5173', acessoRede: true }),
    ).toBeNull();
    expect(verificarPedido({ ...post, origin: 'http://evil.com', acessoRede: true })?.status).toBe(
      403,
    );
  });
});

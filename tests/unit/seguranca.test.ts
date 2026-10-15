import { describe, expect, it } from 'vitest';
import { hostLocal, verificarPedido } from '../../src/lib/server/seguranca';

const post = (host: string | null, origin: string | null, secFetchSite: string | null = null) =>
  verificarPedido({ metodo: 'POST', host, origin, secFetchSite });

describe('host', () => {
  it.each(['127.0.0.1:5173', 'localhost:5173', 'LOCALHOST:4173', '[::1]:5173', '127.0.0.1'])(
    'aceita %s',
    (h) => expect(hostLocal(h)).toBe(true),
  );
  it.each(['evil.com', 'evil.com:5173', '192.168.0.10:5173', '127.0.0.1.nip.io:5173', '', null])(
    'recusa %j (DNS rebinding / rede)',
    (h) => {
      expect(hostLocal(h)).toBe(false);
      expect(
        verificarPedido({ metodo: 'GET', host: h, origin: null, secFetchSite: null })?.status,
      ).toBe(403);
    },
  );
});

describe('formulários (POST)', () => {
  it('mesma origem passa em 127.0.0.1 e em localhost, em qualquer porta', () => {
    expect(post('127.0.0.1:5173', 'http://127.0.0.1:5173')).toBeNull();
    expect(post('localhost:5173', 'http://localhost:5173')).toBeNull();
    expect(post('localhost:4173', 'http://localhost:4173')).toBeNull();
    expect(post('[::1]:5173', 'http://[::1]:5173')).toBeNull();
  });

  it('outra origem é recusada', () => {
    expect(post('127.0.0.1:5173', 'http://evil.com')?.status).toBe(403);
    expect(post('127.0.0.1:5173', 'http://localhost:5173')?.status).toBe(403);
    expect(post('127.0.0.1:5173', 'http://127.0.0.1:9999')?.status).toBe(403);
    expect(post('127.0.0.1:5173', 'lixo')?.status).toBe(403);
    expect(post('127.0.0.1:5173', 'null')?.status).toBe(403);
  });

  it('sem Origin: confia em Sec-Fetch-Site; sem nenhum dos dois é ferramenta local', () => {
    expect(post('127.0.0.1:5173', null, 'cross-site')?.status).toBe(403);
    expect(post('127.0.0.1:5173', null, 'same-site')?.status).toBe(403);
    expect(post('127.0.0.1:5173', null, 'same-origin')).toBeNull();
    expect(post('127.0.0.1:5173', null)).toBeNull();
  });

  it('GET de outra origem segue (só leitura)', () => {
    expect(
      verificarPedido({
        metodo: 'GET',
        host: '127.0.0.1:5173',
        origin: 'http://evil.com',
        secFetchSite: 'cross-site',
      }),
    ).toBeNull();
  });
});

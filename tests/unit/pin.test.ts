import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../../src/lib/server/db/conexao';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import {
  conferirHashPin,
  definirPin,
  gerarHashPin,
  pinAtivo,
  removerPin,
  reiniciarTentativasPin,
  verificarPin,
} from '../../src/lib/server/servicos/pin';
import { criarCookie, cookieValido } from '../../src/lib/server/sessaoPin';
import { bancoEmMemoria } from './ajuda-banco';

const T0 = new Date('2026-10-17T12:00:00Z');
const seg = (s: number) => new Date(T0.getTime() + s * 1000);

let banco: Banco;

beforeEach(() => {
  banco = bancoEmMemoria();
  reiniciarTentativasPin();
});
afterEach(() => {
  banco.sqlite.close();
  reiniciarTentativasPin();
});

/** Erro de negócio esperado, com o campo conferido. */
function erroDe(f: () => unknown): ErroDeNegocio {
  try {
    f();
  } catch (e) {
    if (e instanceof ErroDeNegocio) return e;
    throw e;
  }
  throw new Error('esperava ErroDeNegocio');
}

describe('scrypt', () => {
  it('gera o formato scrypt$N$salt$hash e confere o PIN certo', () => {
    const h = gerarHashPin('1234');
    expect(h).toMatch(/^scrypt\$16384\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(conferirHashPin('1234', h)).toBe(true);
    expect(conferirHashPin('1235', h)).toBe(false);
  });

  it('usa salt aleatório: o mesmo PIN gera hashes diferentes', () => {
    expect(gerarHashPin('2468')).not.toBe(gerarHashPin('2468'));
  });

  it.each([
    '',
    'scrypt',
    'md5$1$aa$bb',
    'scrypt$3$aa$bb',
    'scrypt$16384$zz$bb',
    'scrypt$16384$aa$',
  ])('formato ruim %j é recusado sem lançar', (h) =>
    expect(conferirHashPin('1234', h)).toBe(false),
  );
});

describe('formato do PIN', () => {
  it.each(['abcd', '123', '1234567890123', '12a4', '', ' 1234 '])(
    'recusa %j (campo pin)',
    (pin) => {
      expect(erroDe(() => definirPin(banco, pin)).campo).toBe('pin');
      expect(pinAtivo(banco)).toBe(false);
    },
  );

  it.each(['1234', '000000', '123456789012'])('aceita %s', (pin) => {
    definirPin(banco, pin);
    expect(pinAtivo(banco)).toBe(true);
  });
});

describe('definir, trocar e remover', () => {
  it('sem PIN, verificar falha; com PIN, confere', () => {
    expect(() => verificarPin(banco, '1234', T0)).toThrow(ErroDeNegocio);
    definirPin(banco, '1234');
    expect(verificarPin(banco, '1234', T0)).toEqual({ ok: true });
    expect(verificarPin(banco, '4321', T0)).toEqual({ ok: false, bloqueadoAteMs: null });
  });

  it('trocar exige o PIN atual', () => {
    definirPin(banco, '1234');
    expect(erroDe(() => definirPin(banco, '5678')).campo).toBe('atual');
    expect(erroDe(() => definirPin(banco, '5678', '0000')).message).toBe('PIN atual incorreto.');
    definirPin(banco, '5678', '1234');
    expect(verificarPin(banco, '5678', T0)).toEqual({ ok: true });
    expect(verificarPin(banco, '1234', T0).ok).toBe(false);
  });

  it('remover exige o PIN atual e deixa o site livre', () => {
    definirPin(banco, '1234');
    expect(erroDe(() => removerPin(banco, '9999')).campo).toBe('atual');
    expect(pinAtivo(banco)).toBe(true);
    removerPin(banco, '1234');
    expect(pinAtivo(banco)).toBe(false);
  });

  it('remover sem PIN definido é erro de negócio', () => {
    expect(() => removerPin(banco, '1234')).toThrow(ErroDeNegocio);
  });

  it('trocar o PIN gera segredo novo: cookie antigo deixa de valer', () => {
    definirPin(banco, '1234');
    const antigo = criarCookie(banco, { lembrar: true, agora: T0 }).valor;
    expect(cookieValido(banco, antigo, T0)).toBe(true);
    definirPin(banco, '5678', '1234');
    expect(cookieValido(banco, antigo, T0)).toBe(false);
  });
});

describe('limite de tentativas', () => {
  beforeEach(() => definirPin(banco, '1234', undefined, T0));

  it('5 erros bloqueiam por 30 s, sem conferir o PIN durante o bloqueio', () => {
    for (let i = 0; i < 4; i++) expect(verificarPin(banco, '0000', T0).ok).toBe(false);
    const quinto = verificarPin(banco, '0000', T0);
    expect(quinto).toEqual({ ok: false, bloqueadoAteMs: T0.getTime() + 30_000 });

    // Durante o bloqueio, o PIN certo também é recusado.
    expect(verificarPin(banco, '1234', seg(29))).toEqual({
      ok: false,
      bloqueadoAteMs: T0.getTime() + 30_000,
    });
    // Depois do bloqueio, o PIN certo entra.
    expect(verificarPin(banco, '1234', seg(31))).toEqual({ ok: true });
  });

  it('cada novo bloqueio dobra o tempo, até 15 min', () => {
    const esperadosEmS = [30, 60, 120, 240, 480, 900, 900];
    let t = T0;
    for (const s of esperadosEmS) {
      let r: ReturnType<typeof verificarPin> = { ok: true };
      for (let i = 0; i < 5; i++) r = verificarPin(banco, '0000', t);
      expect(r).toEqual({ ok: false, bloqueadoAteMs: t.getTime() + s * 1000 });
      // Logo depois do bloqueio, uma nova rodada de erros gera o bloqueio seguinte.
      t = new Date(t.getTime() + s * 1000 + 1000);
    }
  });

  it('acerto zera o contador', () => {
    for (let i = 0; i < 4; i++) verificarPin(banco, '0000', T0);
    expect(verificarPin(banco, '1234', T0)).toEqual({ ok: true });
    for (let i = 0; i < 4; i++) verificarPin(banco, '0000', T0);
    // Ainda não bloqueou (são só 4 erros depois do acerto) e o PIN certo entra.
    expect(verificarPin(banco, '1234', T0)).toEqual({ ok: true });
  });

  it('trocar ou remover também contam erros (PIN atual)', () => {
    for (let i = 0; i < 4; i++) {
      expect(erroDe(() => removerPin(banco, '0000', T0)).campo).toBe('atual');
    }
    expect(erroDe(() => removerPin(banco, '0000', T0)).message).toMatch(/Tente de novo em 30 s/);
    expect(pinAtivo(banco)).toBe(true);
  });
});

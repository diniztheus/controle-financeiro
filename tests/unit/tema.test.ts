import { describe, expect, it } from 'vitest';
import { atributoDoTema, lerTema, normalizarTema } from '../../src/lib/ui/tema';

describe('tema', () => {
  it('valores desconhecidos viram automático', () => {
    expect(normalizarTema('claro')).toBe('claro');
    expect(normalizarTema('escuro')).toBe('escuro');
    expect(normalizarTema('auto')).toBe('auto');
    expect(normalizarTema('azul')).toBe('auto');
    expect(normalizarTema(null)).toBe('auto');
    expect(normalizarTema(undefined)).toBe('auto');
    expect(normalizarTema(1)).toBe('auto');
  });

  it('cada tema vira o atributo data-theme certo (automático remove)', () => {
    expect(atributoDoTema('claro')).toBe('light');
    expect(atributoDoTema('escuro')).toBe('dark');
    expect(atributoDoTema('auto')).toBeNull();
  });

  it('sem localStorage (servidor ou navegador bloqueado) o padrão é automático', () => {
    expect(lerTema()).toBe('auto');
  });
});

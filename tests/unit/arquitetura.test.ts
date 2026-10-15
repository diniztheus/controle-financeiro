import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOMINIO = resolve(__dirname, '../../src/lib/dominio');

describe('arquitetura', () => {
  it('dominio/ não importa banco, servidor, Node nem UI', () => {
    for (const arq of readdirSync(DOMINIO).filter((n) => n.endsWith('.ts'))) {
      const texto = readFileSync(join(DOMINIO, arq), 'utf8');
      const imports = [...texto.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
      for (const imp of imports) {
        expect(imp, `${arq} importa ${imp}`).toMatch(/^\.\/[\w-]+(\.ts)?$/);
      }
    }
  });
});

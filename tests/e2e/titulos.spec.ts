/**
 * Títulos das páginas: cada rota estática tem um <title> próprio, começando por
 * "Controle Financeiro", para o navegador e as abas não se confundirem.
 */
import { expect, test } from '@playwright/test';

// /pin fica de fora: sem PIN definido ele manda para o painel, e o título dele é o do painel.
const ROTAS_ESTATICAS = [
  '/',
  '/gastos',
  '/receitas',
  '/contas',
  '/categorias',
  '/cartoes',
  '/bitcoin',
  '/relatorios',
  '/busca',
  '/lixeira',
  '/backups',
  '/configuracoes',
  '/sistema',
];

test('cada rota estática tem um título próprio e começa por "Controle Financeiro"', async ({
  page,
}) => {
  const titulos = new Map<string, string>();
  for (const rota of ROTAS_ESTATICAS) {
    await page.goto(rota);
    const titulo = await page.title();
    expect(titulo, rota).toMatch(/^Controle Financeiro · .+/);
    titulos.set(rota, titulo);
  }

  const porTitulo = new Map<string, string[]>();
  for (const [rota, titulo] of titulos) {
    porTitulo.set(titulo, [...(porTitulo.get(titulo) ?? []), rota]);
  }
  const repetidos = [...porTitulo].filter(([, rotas]) => rotas.length > 1);
  expect(repetidos, 'títulos repetidos entre rotas').toEqual([]);
});

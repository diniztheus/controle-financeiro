/**
 * Acessibilidade: auditoria com axe em todas as rotas estáticas (claro, escuro e celular de 390px)
 * e testes de teclado (pular para o conteúdo, foco visível, diálogo de atalhos, movimento reduzido).
 *
 * Falha em violações de impacto "moderate", "serious" ou "critical". As "minor" são listadas no
 * console do teste, para revisão. Os testes rodam em sequência no mesmo banco temporário:
 * o primeiro cria uma conta e um gasto, para as páginas com dados não ficarem vazias.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ROTAS = [
  '/',
  '/gastos',
  '/receitas',
  '/contas',
  '/categorias',
  '/cartoes',
  '/metas',
  '/bitcoin',
  '/relatorios',
  '/busca',
  '/lixeira',
  '/backups',
  '/configuracoes',
  '/sistema',
];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const CONTA = 'Conta a11y e2e';

async function auditar(page: Page, rota: string) {
  await page.goto(rota);
  await page.waitForLoadState('networkidle');
  const resultado = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const graves = resultado.violations.filter(
    (v) => v.impact === 'moderate' || v.impact === 'serious' || v.impact === 'critical',
  );
  const leves = resultado.violations.filter((v) => v.impact === 'minor');
  if (leves.length > 0) {
    console.log(
      `[axe ${rota}] menores:\n` +
        leves.map((v) => `  ${v.impact} ${v.id}: ${v.help} (${v.nodes.length} nó(s))`).join('\n'),
    );
  }
  const resumo = graves.map(
    (v) =>
      `${v.impact} ${v.id}: ${v.help}\n` +
      v.nodes.map((n) => `    ${n.target.join(' ')} -> ${n.failureSummary ?? ''}`).join('\n'),
  );
  return resumo;
}

test('prepara dados: uma conta e um gasto para as páginas não ficarem vazias', async ({ page }) => {
  await page.goto('/contas');
  await page.getByLabel('Nome', { exact: true }).fill(CONTA);
  await page.getByLabel('Saldo de hoje (R$)').fill('0');
  await page.getByRole('button', { name: 'Cadastrar conta' }).click();
  await expect(page.getByRole('status')).toContainText(`Conta "${CONTA}" cadastrada.`);

  await page.goto('/gastos');
  const form = page.locator('#novo');
  await form.getByLabel('Valor (R$)').fill('42,90');
  // Em 2019: o banco é compartilhado e o total do mês atual é conferido por outro teste.
  await form.getByLabel('Data').fill('2019-05-10');
  await form.getByLabel('Descrição').fill('Padaria a11y e2e');
  await form.getByText('Alimentação', { exact: true }).click();
  await form.getByLabel('Pago com').selectOption({ label: CONTA });
  await form.getByRole('button', { name: 'Lançar gasto' }).click();
  await expect(page.getByTestId('gasto-lancado')).toContainText('lançado');
});

const variantes = [
  {
    nome: 'tema claro',
    opcoes: { colorScheme: 'light' as const, viewport: { width: 1280, height: 900 } },
  },
  {
    nome: 'tema escuro',
    opcoes: { colorScheme: 'dark' as const, viewport: { width: 1280, height: 900 } },
  },
  {
    nome: 'celular 390px',
    opcoes: { colorScheme: 'light' as const, viewport: { width: 390, height: 844 } },
  },
];

for (const variante of variantes) {
  test.describe(`axe, ${variante.nome}`, () => {
    test.use(variante.opcoes);
    for (const rota of ROTAS) {
      test(`${rota} sem violações graves`, async ({ page }) => {
        const graves = await auditar(page, rota);
        expect(graves, graves.join('\n')).toEqual([]);
      });
    }
  });
}

test.describe('teclado e movimento', () => {
  test('o link "Pular para o conteúdo" leva o foco ao <main>', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    const alvo = await page.evaluate(
      () => document.activeElement?.tagName + '#' + document.activeElement?.id,
    );
    expect(alvo).toBe('MAIN#conteudo');
  });

  test('todo elemento alcançável por Tab mostra contorno visível em /gastos', async ({ page }) => {
    await page.goto('/gastos');
    const semFoco: string[] = [];
    const visitados = new Set<string>();
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const contorno = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
        const sombra = cs.boxShadow !== 'none';
        return {
          chave: `${el.tagName}.${el.className}#${el.id}:${el.textContent?.trim().slice(0, 30)}`,
          visivel: contorno || sombra,
        };
      });
      if (!info) break;
      if (visitados.has(info.chave)) break;
      visitados.add(info.chave);
      if (!info.visivel) semFoco.push(info.chave);
    }
    expect(visitados.size).toBeGreaterThan(5);
    expect(semFoco).toEqual([]);
  });

  test('fechar a ajuda de atalhos devolve o foco ao elemento anterior', async ({ page }) => {
    await page.goto('/');
    const anterior = page.locator('.ferramentas a').first();
    await anterior.focus();
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(anterior).toBeFocused();
  });

  test('movimento reduzido desliga as animações de entrada', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/gastos');
    const animacoes = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.sec, .page-head')).map((el) => {
        const cs = getComputedStyle(el);
        return { nome: cs.animationName, duracao: parseFloat(cs.animationDuration) };
      }),
    );
    expect(animacoes.length).toBeGreaterThan(0);
    for (const a of animacoes) {
      expect(a.nome === 'none' || a.duracao <= 0.01).toBe(true);
    }
  });
});

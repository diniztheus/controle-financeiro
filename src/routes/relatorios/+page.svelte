<script lang="ts">
  import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import PiggyBank from '@lucide/svelte/icons/piggy-bank';
  import { resolve } from '$app/paths';
  import { formatarDia, nomeMes, nomeMesCurto } from '$lib/dominio/datas';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import type { ComparativoMes } from '$lib/dominio/relatorios';
  import BarrasFluxo, { type ParFluxo } from '$lib/ui/BarrasFluxo.svelte';
  import BarrasMeses, { type BarraMes } from '$lib/ui/BarrasMeses.svelte';
  import GraficoPatrimonio from '$lib/ui/GraficoPatrimonio.svelte';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import Rosca from '$lib/ui/Rosca.svelte';
  import { corCss, plural, tituloMes } from '$lib/ui/formato';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const rel = $derived(data.categorias);
  const meses = $derived(rel.meses);
  const n = $derived(meses.length);
  const semGasto = $derived(rel.totalCentavos === 0);
  const mediaTotal = $derived(n ? Math.round(rel.totalCentavos / n) : 0);

  const rotuloMes = (mes: string) => `${nomeMesCurto(mes)}/${mes.slice(2, 4)}`;
  const pct = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const origem = (g: (typeof rel.maiores)[number]) =>
    g.meio === 'cartao' ? g.cartaoNome : g.contaNome;

  /** Barra verde se o gasto ficou igual ou é o primeiro; vermelha se subiu; verde-escura se caiu. */
  const corVariacao = (c: ComparativoMes): string => {
    if (c.variacaoCentavos === null || c.variacaoCentavos === 0) return 'var(--muted)';
    return c.variacaoCentavos > 0 ? 'var(--neg)' : 'var(--pos)';
  };
  const barrasComparativo = $derived<BarraMes[]>(
    rel.comparativo.map((c) => ({
      rotulo: rotuloMes(c.mes),
      valorCentavos: c.totalCentavos,
      cor: corVariacao(c),
    })),
  );

  const fluxo = $derived(data.fluxo);
  const fluxoVazio = $derived(
    fluxo.totais.entradasCentavos === 0 && fluxo.totais.saidasCentavos === 0,
  );
  const paresFluxo = $derived<ParFluxo[]>(
    fluxo.meses.map((m) => ({
      rotulo: rotuloMes(m.mes),
      entradasCentavos: m.entradasCentavos,
      saidasCentavos: m.saidasCentavos,
    })),
  );
  const taxa = (t: number | null) => (t === null ? '—' : `${pct(t)}%`);

  /** Pizza de gastos por categoria: as 6 maiores e o resto junto, como no painel. */
  const fatias = $derived.by(() => {
    const maiores = rel.linhas.slice(0, 6).map((l) => ({
      valor: l.totalCentavos,
      cor: corCss(l.categoriaCor),
    }));
    const resto = rel.linhas.slice(6).reduce((s, l) => s + l.totalCentavos, 0);
    return resto > 0 ? [...maiores, { valor: resto, cor: 'var(--c9)' }] : maiores;
  });
  const pctDoTotal = (v: number) => pct(rel.totalCentavos ? (v * 100) / rel.totalCentavos : 0);

  const linkExportar = (formato: 'csv' | 'json') =>
    resolve(`/relatorios/exportar?de=${data.de}&ate=${data.ate}&formato=${formato}`);
</script>

<svelte:head>
  <title>Controle Financeiro · Relatórios</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Relatórios</h1>
    <p>
      Para onde foi o dinheiro, como o patrimônio mudou e como cada mês se compara com o anterior.
    </p>
  </div>
  <nav class="atalhos" aria-label="Outras ferramentas">
    <a class="btn" href={resolve('/busca')}>Buscar lançamentos</a>
    <a class="btn" href={linkExportar('csv')}>Exportar CSV</a>
    <a class="btn" href={linkExportar('json')}>Exportar JSON</a>
    <a
      class="btn"
      href={resolve(`/relatorios/exportar?de=${data.de}&ate=${data.ate}&formato=csv&tipo=receitas`)}
      >Exportar receitas (CSV)</a
    >
  </nav>
</header>

<div class="pad periodo-wrap">
  <div class="periodo-linha">
    <span class="small muted">Últimos meses:</span>
    <nav class="pilulas periodo" aria-label="Período dos relatórios">
      {#each data.opcoesMeses as opcao (opcao)}
        <a
          href={resolve(`/relatorios?meses=${opcao}`)}
          aria-current={opcao === data.meses ? 'true' : undefined}
          data-sveltekit-noscroll>{opcao}</a
        >
      {/each}
    </nav>
  </div>
  {#if n}
    <p class="small muted">
      Período: de {nomeMes(data.de)} a {nomeMes(data.ate)}.
    </p>
  {/if}
</div>

<div class="pad resumo">
  <div class="card stat">
    <div class="stat-cab">
      <span class="ico gasto"><ArrowDownRight size={20} /></span>
      <span class="stat-rot">Gastos no período</span>
    </div>
    <p class="stat-val neg num">{formatarBRL(rel.totalCentavos)}</p>
    <p class="small muted">{plural(n, 'mês', 'meses')}</p>
  </div>
  <div class="card stat">
    <div class="stat-cab">
      <span class="ico"><CalendarDays size={20} /></span>
      <span class="stat-rot">Média mensal de gastos</span>
    </div>
    <p class="stat-val num">{formatarBRL(mediaTotal)}</p>
    <p class="small muted">Somando os meses do período</p>
  </div>
  <div class="card stat">
    <div class="stat-cab">
      <span class="ico receita"><ArrowUpRight size={20} /></span>
      <span class="stat-rot">Receitas no período</span>
    </div>
    <p class="stat-val pos num">{formatarBRL(fluxo.totais.entradasCentavos)}</p>
    <p class="small muted">Receitas lançadas nos meses</p>
  </div>
  <div class="card stat">
    <div class="stat-cab">
      <span class="ico"><PiggyBank size={20} /></span>
      <span class="stat-rot">Sobra no período</span>
    </div>
    <p class="stat-val num" class:neg={fluxo.totais.saldoCentavos < 0}>
      {formatarBRL(fluxo.totais.saldoCentavos)}
    </p>
    <p class="small muted">Taxa de poupança: {taxa(fluxo.totais.taxaPoupancaPercentual)}</p>
  </div>
</div>

<div class="pad blocos">
  <section class="card" aria-labelledby="h-evolucao">
    <div class="card-head">
      <h2 id="h-evolucao">Evolução do patrimônio</h2>
    </div>
    <p class="small muted">
      Contas pelo último saldo registrado em cada mês, mais o bitcoin pelo último preço conhecido.
      Compras no cartão não entram.
    </p>
    <GraficoPatrimonio pontos={data.patrimonio} />
  </section>

  <section class="card" aria-labelledby="h-fluxo">
    <div class="card-head">
      <h2 id="h-fluxo">Receitas e despesas</h2>
      <span class="small muted">Entradas e saídas por mês</span>
    </div>
    <p class="small muted">
      Entradas são as receitas lançadas; saídas são os gastos. A sobra é a diferença entre as duas.
      Receitas não mudam o saldo das contas.
    </p>
    {#if fluxoVazio}
      <div class="empty">
        <strong>Nenhuma receita nem gasto nestes meses</strong>
        <span>Lance receitas na tela Receitas e gastos na tela Gastos para comparar os dois.</span>
      </div>
    {:else}
      <BarrasFluxo pares={paresFluxo} resumo="Entradas e saídas de cada mês." />
      <h3 class="sub">Mês a mês</h3>
      <!-- Área rolável: precisa ser focável por teclado (regra scrollable-region-focusable do axe). -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="rolagem" role="region" tabindex="0" aria-label="Mês a mês, com rolagem">
        <table>
          <caption class="sr">Entradas, saídas, saldo e taxa de poupança de cada mês</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col" class="num">Entradas</th>
              <th scope="col" class="num">Saídas</th>
              <th scope="col" class="num">Saldo</th>
              <th scope="col" class="num">Taxa de poupança</th>
            </tr>
          </thead>
          <tbody>
            {#each fluxo.meses as m (m.mes)}
              <tr>
                <th scope="row">{tituloMes(m.mes)}</th>
                <td class="num pos">{formatarBRL(m.entradasCentavos)}</td>
                <td class="num">{formatarBRL(m.saidasCentavos)}</td>
                <td class="num" class:neg={m.saldoCentavos < 0}>{formatarBRL(m.saldoCentavos)}</td>
                <td class="num">{taxa(m.taxaPoupancaPercentual)}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total do período</th>
              <td class="num pos">{formatarBRL(fluxo.totais.entradasCentavos)}</td>
              <td class="num">{formatarBRL(fluxo.totais.saidasCentavos)}</td>
              <td class="num" class:neg={fluxo.totais.saldoCentavos < 0}
                >{formatarBRL(fluxo.totais.saldoCentavos)}</td
              >
              <td class="num">{taxa(fluxo.totais.taxaPoupancaPercentual)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <h3 class="sub">Receitas por categoria</h3>
      {#if fluxo.receitasPorCategoria.length}
        <ul class="rows dentro" data-testid="receitas-categorias">
          {#each fluxo.receitasPorCategoria as f (f.categoria)}
            <li class="row">
              <IconeRedondo nome={f.categoria} cor="var(--pos)" suave tamanho={36} />
              <span class="row-main">
                <span class="row-title">{f.categoria}</span>
                <span class="row-meta">{pct(f.percentual)}% do total</span>
              </span>
              <span class="row-val num pos">{formatarBRL(f.totalCentavos)}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="empty">
          <strong>Nenhuma receita nestes meses</strong>
          <span>As receitas lançadas aparecem aqui, somadas por categoria.</span>
        </div>
      {/if}
    {/if}
  </section>

  <section class="card" aria-labelledby="h-categorias">
    <div class="card-head">
      <h2 id="h-categorias">Gastos por categoria nos meses</h2>
    </div>
    {#if rel.linhas.length === 0}
      <div class="empty">
        <strong>Nenhum gasto nestes meses</strong>
        <span>Lance gastos na tela Gastos e eles aparecem aqui, separados por categoria.</span>
      </div>
    {:else}
      <h3 class="sub">Para onde foi o dinheiro</h3>
      <div class="distrib">
        <Rosca {fatias} rotulo="Total" centro={formatarBRL(rel.totalCentavos)} />
        <ul class="rows dentro" data-testid="categorias-periodo">
          {#each rel.linhas as l (l.categoriaId)}
            <li class="row">
              <IconeRedondo nome={l.categoriaNome} cor={corCss(l.categoriaCor)} tamanho={36} />
              <span class="row-main">
                <span class="row-title">{l.categoriaNome}</span>
                <span class="row-meta">{pctDoTotal(l.totalCentavos)}% do total</span>
              </span>
              <span class="row-val num">{formatarBRL(l.totalCentavos)}</span>
            </li>
          {/each}
        </ul>
      </div>

      <h3 class="sub">Mês a mês</h3>
      <!-- Área rolável: precisa ser focável por teclado (regra scrollable-region-focusable do axe). -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="rolagem" role="region" tabindex="0" aria-label="Categorias por mês, com rolagem">
        <table>
          <caption class="sr">Gasto de cada categoria em cada mês, com total e média mensal</caption
          >
          <thead>
            <tr>
              <th scope="col">Categoria</th>
              {#each meses as mes (mes)}
                <th scope="col" class="num">{rotuloMes(mes)}</th>
              {/each}
              <th scope="col" class="num">Total</th>
              <th scope="col" class="num">Média por mês</th>
            </tr>
          </thead>
          <tbody>
            {#each rel.linhas as l (l.categoriaId)}
              <tr>
                <th scope="row" class="cat">
                  <i class="cor" style="background: {corCss(l.categoriaCor)}"></i>{l.categoriaNome}
                </th>
                {#each meses as mes (mes)}
                  <td class="num">{l.porMes[mes] ? formatarBRL(l.porMes[mes]) : '—'}</td>
                {/each}
                <td class="num">{formatarBRL(l.totalCentavos)}</td>
                <td class="num">{formatarBRL(l.mediaMensalCentavos)}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total do mês</th>
              {#each meses as mes (mes)}
                <td class="num">{formatarBRL(rel.totaisPorMes[mes] ?? 0)}</td>
              {/each}
              <td class="num">{formatarBRL(rel.totalCentavos)}</td>
              <td class="num">{formatarBRL(mediaTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    {/if}
  </section>

  <section class="card" aria-labelledby="h-comparativo">
    <div class="card-head">
      <h2 id="h-comparativo">Comparativo mês a mês</h2>
    </div>
    {#if semGasto}
      <div class="empty">
        <strong>Sem gastos para comparar</strong>
        <span>Quando houver gastos em mais de um mês, a variação aparece aqui.</span>
      </div>
    {:else}
      <p class="small muted">
        Vermelho quando o gasto subiu em relação ao mês anterior; verde quando caiu.
      </p>
      <BarrasMeses barras={barrasComparativo} resumo="Gasto total de cada mês." />
      <!-- Área rolável: precisa ser focável por teclado (regra scrollable-region-focusable do axe). -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="rolagem" role="region" tabindex="0" aria-label="Comparativo mensal, com rolagem">
        <table>
          <caption class="sr">Gasto de cada mês e variação em relação ao mês anterior</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col" class="num">Gasto</th>
              <th scope="col" class="num">Variação</th>
            </tr>
          </thead>
          <tbody>
            {#each rel.comparativo as c (c.mes)}
              <tr>
                <th scope="row">{tituloMes(c.mes)}</th>
                <td class="num">{formatarBRL(c.totalCentavos)}</td>
                <td class="num">
                  {#if c.variacaoCentavos === null}
                    <span class="muted">—</span>
                  {:else}
                    <span class:sobe={c.variacaoCentavos > 0} class:cai={c.variacaoCentavos < 0}>
                      {c.variacaoCentavos > 0
                        ? '+'
                        : c.variacaoCentavos < 0
                          ? '−'
                          : ''}{formatarBRL(
                        Math.abs(c.variacaoCentavos),
                      )}{#if c.variacaoPercentual !== null}
                        <span class="pct-var">({pct(Math.abs(c.variacaoPercentual))}%)</span>{/if}
                    </span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="card" aria-labelledby="h-maiores">
    <div class="card-head">
      <h2 id="h-maiores">Maiores gastos</h2>
    </div>
    {#if rel.maiores.length === 0}
      <div class="empty">
        <strong>Nenhum gasto nestes meses</strong>
      </div>
    {:else}
      <ol class="rows dentro">
        {#each rel.maiores as g (g.compraId + ':' + g.parcela)}
          <li>
            <a class="row" href={resolve('/gastos/[id]', { id: g.compraId })}>
              <IconeRedondo nome={g.categoriaNome} cor={corCss(g.categoriaCor)} tamanho={36} />
              <span class="row-main">
                <span class="row-title">{g.descricao ?? 'Sem descrição'}</span>
                <span class="row-meta">
                  {formatarDia(g.data)} · {g.categoriaNome}{origem(g)
                    ? ` · ${origem(g)}`
                    : ''}{g.numParcelas > 1 ? ` · parcela ${g.parcela}/${g.numParcelas}` : ''}
                </span>
              </span>
              <span class="row-val num neg">−{formatarBRL(g.valorCentavos)}</span>
            </a>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
</div>

<style>
  .atalhos {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }
  .periodo-wrap {
    display: grid;
    gap: 8px;
    padding-bottom: 8px;
  }
  .periodo-linha {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    min-width: 0;
  }
  /* Alvos de toque de 44px no seletor de período */
  .periodo > a {
    min-height: 44px;
    padding: 0 16px;
  }
  .periodo > [aria-current] {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow);
  }

  /* Cartões de resumo: dois por linha no celular, quatro no computador */
  .resumo {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
    gap: 20px;
  }
  .stat {
    gap: 8px;
  }
  @media (max-width: 560px) {
    .resumo {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 12px;
    }
    .stat {
      padding: 14px;
    }
    .stat-val {
      font-size: 1.0625rem;
      white-space: nowrap;
    }
    .stat-cab .ico {
      width: 32px;
      height: 32px;
    }
  }
  .stat-cab {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .stat-rot {
    font-weight: 600;
    color: var(--muted);
    font-size: 0.9375rem;
  }
  .ico {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    background: var(--orange-soft);
    color: var(--orange);
  }
  .ico.gasto {
    background: var(--neg-soft);
    color: var(--neg);
  }
  .ico.receita {
    background: var(--pos-soft);
    color: var(--pos);
  }
  .stat-val {
    font-size: clamp(1.5rem, 1.2rem + 1vw, 1.875rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }

  /* Seções: cada gráfico e tabela num cartão */
  .blocos {
    display: grid;
    gap: 20px;
    padding-block: 12px clamp(40px, 6vw, 80px);
    min-width: 0;
  }
  .blocos > .card {
    min-width: 0;
  }
  .sub {
    font-size: var(--s-body);
    font-weight: 600;
    margin-top: 6px;
  }
  .pct-var {
    margin-left: 0.35em;
  }
  .rolagem {
    position: relative;
    overflow-x: auto;
    max-width: 100%;
    border-radius: var(--r);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--s-small);
  }
  th,
  td {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  th {
    color: var(--muted);
    font-weight: 600;
  }
  thead th {
    background: var(--surface);
  }
  tfoot th,
  tfoot td {
    border-bottom: 0;
    border-top: 1px solid var(--line);
    color: var(--ink);
    font-weight: 600;
  }
  tbody th.cat {
    color: var(--ink);
    font-weight: 500;
  }
  td.num,
  th.num {
    text-align: right;
  }
  .cor {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 8px;
    vertical-align: middle;
  }
  .sobe {
    color: var(--neg);
    font-weight: 600;
  }
  .cai {
    color: var(--pos);
    font-weight: 600;
  }
  .rows.dentro {
    background: transparent;
    box-shadow: none;
  }
  .distrib {
    display: flex;
    gap: 24px;
    align-items: center;
    min-width: 0;
  }
  .distrib > .rows {
    flex: 1;
    min-width: 0;
  }
  @media (max-width: 560px) {
    .distrib {
      flex-direction: column;
      align-items: stretch;
    }
    .distrib > :global(.rosca) {
      align-self: center;
    }
  }
  .empty {
    display: grid;
    gap: 4px;
    padding: 20px;
    border-radius: var(--r);
    background: var(--paper);
  }
  .empty span {
    color: var(--muted);
  }
  .pos {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }
</style>

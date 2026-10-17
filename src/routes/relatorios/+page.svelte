<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatarDia, nomeMes, nomeMesCurto } from '$lib/dominio/datas';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import type { ComparativoMes } from '$lib/dominio/relatorios';
  import BarrasFluxo, { type ParFluxo } from '$lib/ui/BarrasFluxo.svelte';
  import BarrasMeses, { type BarraMes } from '$lib/ui/BarrasMeses.svelte';
  import GraficoPatrimonio from '$lib/ui/GraficoPatrimonio.svelte';
  import { corCss, tituloMes } from '$lib/ui/formato';
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
  <nav class="periodo" aria-label="Período dos relatórios">
    <span class="small muted">Últimos meses:</span>
    {#each data.opcoesMeses as opcao (opcao)}
      <a
        class="btn sm"
        href={resolve(`/relatorios?meses=${opcao}`)}
        aria-current={opcao === data.meses ? 'true' : undefined}
        data-sveltekit-noscroll>{opcao}</a
      >
    {/each}
  </nav>
  {#if n}
    <p class="small muted">
      Período: de {nomeMes(data.de)} a {nomeMes(data.ate)}.
    </p>
  {/if}
</div>

<section class="bloco pad" aria-labelledby="h-evolucao">
  <h2 id="h-evolucao">Evolução do patrimônio</h2>
  <p class="small muted">
    Contas pelo último saldo registrado em cada mês, mais o bitcoin pelo último preço conhecido,
    menos as parcelas de cartão que ainda não estavam pagas.
  </p>
  <GraficoPatrimonio pontos={data.patrimonio} />
</section>

<section class="bloco pad" aria-labelledby="h-fluxo">
  <h2 id="h-fluxo">Receitas e despesas</h2>
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
      <ul class="rc-list" data-testid="receitas-categorias">
        {#each fluxo.receitasPorCategoria as f (f.categoria)}
          <li class="rc">
            <span class="rc-nome">{f.categoria}</span>
            <span class="num rc-val">{formatarBRL(f.totalCentavos)}</span>
            <span class="num pc">{pct(f.percentual)}%</span>
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

<section class="bloco pad" aria-labelledby="h-categorias">
  <h2 id="h-categorias">Gastos por categoria nos meses</h2>
  {#if rel.linhas.length === 0}
    <div class="empty">
      <strong>Nenhum gasto nestes meses</strong>
      <span>Lance gastos na tela Gastos e eles aparecem aqui, separados por categoria.</span>
    </div>
  {:else}
    <!-- Área rolável: precisa ser focável por teclado (regra scrollable-region-focusable do axe). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="rolagem" role="region" tabindex="0" aria-label="Categorias por mês, com rolagem">
      <table>
        <caption class="sr">Gasto de cada categoria em cada mês, com total e média mensal</caption>
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

<section class="bloco pad" aria-labelledby="h-comparativo">
  <h2 id="h-comparativo">Comparativo mês a mês</h2>
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
                    {c.variacaoCentavos > 0 ? '+' : c.variacaoCentavos < 0 ? '−' : ''}{formatarBRL(
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

<section class="bloco pad" aria-labelledby="h-maiores">
  <h2 id="h-maiores">Maiores gastos</h2>
  {#if rel.maiores.length === 0}
    <div class="empty">
      <strong>Nenhum gasto nestes meses</strong>
    </div>
  {:else}
    <ol class="maiores">
      {#each rel.maiores as g (g.compraId + ':' + g.parcela)}
        <li>
          <a href={resolve('/gastos/[id]', { id: g.compraId })}>
            <span class="desc">{g.descricao ?? 'Sem descrição'}</span>
            <span class="small muted">
              {formatarDia(g.data)} · {g.categoriaNome}{origem(g)
                ? ` · ${origem(g)}`
                : ''}{g.numParcelas > 1 ? ` · parcela ${g.parcela}/${g.numParcelas}` : ''}
            </span>
          </a>
          <span class="num valor">{formatarBRL(g.valorCentavos)}</span>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .page-head {
    padding-block: clamp(32px, 5vw, 64px) clamp(24px, 3vw, 40px);
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 16px 32px;
    flex-wrap: wrap;
  }
  .page-head h1 {
    font-size: clamp(2rem, 1.3rem + 2.6vw, 3.25rem);
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.05;
  }
  .page-head p {
    color: var(--muted);
    max-width: 52ch;
    margin-top: 12px;
  }
  .atalhos,
  .periodo {
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
  .periodo [aria-current='true'] {
    background: var(--ink);
    color: var(--paper);
  }
  .bloco {
    display: grid;
    gap: 16px;
    min-width: 0;
    padding-block: clamp(32px, 5vw, 56px);
    border-top: 1px solid var(--line);
  }
  .bloco h2 {
    font-size: var(--s-lead);
  }
  .bloco > .small {
    margin-top: -8px;
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
    background: var(--paper);
  }
  tfoot th,
  tfoot td {
    border-bottom: 0;
    border-top: 1px solid var(--ink);
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
    border-radius: 3px;
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
  .maiores {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
  }
  .maiores li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  .maiores a {
    display: grid;
    gap: 2px;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }
  .maiores a:hover .desc {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .desc {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .valor {
    font-weight: 600;
  }
  .empty {
    display: grid;
    gap: 4px;
    padding: 20px;
    border-radius: var(--r);
    background: var(--surface);
  }
  .empty span {
    color: var(--muted);
  }
  .sub {
    font-size: var(--s-body);
    font-weight: 600;
    margin-top: 8px;
  }
  .pos {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }
  .rc-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 2px 32px;
  }
  .rc {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 3em;
    gap: 12px;
    align-items: baseline;
    padding-block: 8px;
    border-bottom: 1px solid var(--line);
  }
  .rc-nome {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rc-val {
    font-weight: 600;
  }
</style>

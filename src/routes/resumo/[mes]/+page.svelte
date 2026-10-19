<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatarBRL, type Centavos } from '$lib/dominio/dinheiro';
  import { formatarDia, type Mes } from '$lib/dominio/datas';
  import type { ComparacaoMedia, ComparacaoTaxa } from '$lib/dominio/resumoMes';
  import ArrowDownLeft from '@lucide/svelte/icons/arrow-down-left';
  import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right';
  import PiggyBank from '@lucide/svelte/icons/piggy-bank';
  import Percent from '@lucide/svelte/icons/percent';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import NavMes from '$lib/ui/NavMes.svelte';
  import Valor from '$lib/ui/Valor.svelte';
  import { corCss, plural, tituloMes } from '$lib/ui/formato';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const r = $derived(data.resumo);
  const tituloDoMes = $derived(tituloMes(data.mes).toLowerCase());
  const linkMes = (m: Mes) => resolve('/resumo/[mes]', { mes: m });

  /** Percentual com sinal: "+12%", "−5%". */
  const pct = (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}%`;
  /** Uma casa decimal, com vírgula: "23,5%". */
  const decimal = (p: number) =>
    `${p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  /** Valor em reais sem sinal, para "R$ X acima da média". */
  const reais = (c: Centavos) => formatarBRL(Math.abs(c));

  /** Texto da comparação com a média (ou que não há histórico para comparar). */
  function textoMedia(c: ComparacaoMedia | null): string {
    if (!c) return 'Sem meses anteriores com dados para comparar';
    const media = `Média de ${plural(c.meses, 'mês', 'meses')}: ${formatarBRL(c.mediaCentavos)}`;
    if (c.diferencaCentavos === 0) return `${media}. Igual à média`;
    const lado = c.diferencaCentavos > 0 ? 'acima' : 'abaixo';
    const pc = c.percentual === null ? '' : ` (${pct(c.percentual)})`;
    return `${media}. ${reais(c.diferencaCentavos)} ${lado}${pc}`;
  }

  function textoTaxa(t: ComparacaoTaxa | null): string {
    if (!t) return 'Sem meses anteriores com entradas para comparar';
    const media = `Média de ${plural(t.meses, 'mês', 'meses')}: ${decimal(t.mediaPercentual)}`;
    if (t.diferencaPontos === null) return media;
    if (t.diferencaPontos === 0) return `${media}. Igual à média`;
    const sinal = t.diferencaPontos > 0 ? '+' : '−';
    const pontos = Math.abs(t.diferencaPontos).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return `${media}. ${sinal}${pontos} pontos`;
  }
</script>

<svelte:head>
  <title>Controle Financeiro · Resumo de {tituloDoMes}</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Resumo de {tituloDoMes}</h1>
    <p>Como foi o mês, comparado com a média dos três meses anteriores.</p>
  </div>
  <NavMes mes={data.mes} href={linkMes} />
</header>

<section class="cartoes pad" aria-label="Totais de {tituloDoMes}">
  <article class="card cartao">
    <div class="cabeca">
      <span class="ico ico-pos"><ArrowDownLeft size={20} /></span>
      <h2>Entradas</h2>
    </div>
    <p class="total pos"><Valor centavos={r.entradasCentavos} testid="resumo-entradas" /></p>
    <p class="small muted">
      {plural(r.quantidadeEntradas, 'receita confirmada', 'receitas confirmadas')}. {textoMedia(
        r.comparacao.entradas,
      )}
    </p>
  </article>

  <article class="card cartao">
    <div class="cabeca">
      <span class="ico ico-neg"><ArrowDownRight size={20} /></span>
      <h2>Gastos</h2>
    </div>
    <p class="total neg"><Valor centavos={r.saidasCentavos} testid="resumo-gastos" /></p>
    <p class="small muted">
      {plural(r.quantidadeLancamentos, 'lançamento', 'lançamentos')}. {textoMedia(
        r.comparacao.saidas,
      )}
    </p>
  </article>

  <article class="card cartao">
    <div class="cabeca">
      <span class="ico ico-azul"><PiggyBank size={20} /></span>
      <h2>Sobra</h2>
    </div>
    <p class="total" class:neg={r.sobraCentavos < 0} class:pos={r.sobraCentavos >= 0}>
      <Valor centavos={r.sobraCentavos} testid="resumo-sobra" />
    </p>
    <p class="small muted">Entradas menos gastos. {textoMedia(r.comparacao.sobra)}</p>
  </article>

  <article class="card cartao">
    <div class="cabeca">
      <span class="ico ico-azul"><Percent size={20} /></span>
      <h2>Taxa de poupança</h2>
    </div>
    <p class="total" data-testid="resumo-taxa">
      {r.taxaPoupancaPercentual === null ? '—' : decimal(r.taxaPoupancaPercentual)}
    </p>
    <p class="small muted">
      Quanto da entrada sobrou. {textoTaxa(r.comparacao.taxa)}
    </p>
  </article>
</section>

<section class="pad lista-secao" aria-labelledby="titulo-subiu">
  <h2 id="titulo-subiu">O que mais subiu</h2>
  {#if r.maisSubiram.length}
    <ul class="rows">
      {#each r.maisSubiram as c (c.categoriaId)}
        <li class="row">
          <IconeRedondo nome={c.nome} cor={corCss(c.cor)} tamanho={38} />
          <div class="row-main">
            <span class="row-title">{c.nome}</span>
            <span class="row-meta">
              Mês: <span class="num">{formatarBRL(c.totalCentavos)}</span> · média:
              <span class="num">{formatarBRL(c.mediaCentavos)}</span>
            </span>
          </div>
          <div class="row-val neg">
            <span class="num">+{formatarBRL(c.diferencaCentavos)}</span>
            {#if c.percentual !== null}<small>{pct(c.percentual)}</small>{/if}
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="vazio">
      {r.comparacao.saidas === null
        ? 'Sem meses anteriores com gastos para comparar.'
        : 'Nenhuma categoria subiu em relação à média.'}
    </p>
  {/if}
</section>

<section class="pad lista-secao" aria-labelledby="titulo-caiu">
  <h2 id="titulo-caiu">O que mais caiu</h2>
  {#if r.maisCairam.length}
    <ul class="rows">
      {#each r.maisCairam as c (c.categoriaId)}
        <li class="row">
          <IconeRedondo nome={c.nome} cor={corCss(c.cor)} tamanho={38} />
          <div class="row-main">
            <span class="row-title">{c.nome}</span>
            <span class="row-meta">
              Mês: <span class="num">{formatarBRL(c.totalCentavos)}</span> · média:
              <span class="num">{formatarBRL(c.mediaCentavos)}</span>
            </span>
          </div>
          <div class="row-val pos">
            <span class="num">{formatarBRL(c.diferencaCentavos)}</span>
            {#if c.percentual !== null}<small>{pct(c.percentual)}</small>{/if}
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="vazio">
      {r.comparacao.saidas === null
        ? 'Sem meses anteriores com gastos para comparar.'
        : 'Nenhuma categoria caiu em relação à média.'}
    </p>
  {/if}
</section>

<section class="pad lista-secao" aria-labelledby="titulo-maior">
  <h2 id="titulo-maior">Maior gasto</h2>
  {#if r.maiorGasto}
    <ul class="rows">
      <li class="row">
        <IconeRedondo
          nome={r.maiorGasto.categoriaNome}
          cor={corCss(r.maiorGasto.categoriaCor)}
          tamanho={38}
        />
        <div class="row-main">
          <span class="row-title">{r.maiorGasto.descricao ?? r.maiorGasto.categoriaNome}</span>
          <span class="row-meta">
            {r.maiorGasto.categoriaNome} · {formatarDia(r.maiorGasto.data)}
          </span>
        </div>
        <div class="row-val">
          <Valor centavos={r.maiorGasto.valorCentavos} testid="maior-gasto" />
        </div>
      </li>
    </ul>
  {:else}
    <p class="vazio">Nenhum gasto neste mês.</p>
  {/if}
</section>

{#if r.previstas.quantidade > 0}
  <section class="pad lista-secao">
    <div class="aviso" role="status">
      <p>
        {plural(r.previstas.quantidade, 'receita prevista', 'receitas previstas')} ainda não confirmada{r
          .previstas.quantidade === 1
          ? ''
          : 's'}, somando
        <span class="num">{formatarBRL(r.previstas.totalCentavos)}</span>. Elas não entram nas
        entradas deste mês.
      </p>
      <a class="btn text" href={resolve(`/receitas?mes=${data.mes}`)}>Ver receitas do mês</a>
    </div>
  </section>
{/if}

<style>
  .cartoes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: 12px;
    padding-top: 8px;
  }
  .cartao {
    align-content: start;
  }
  .cabeca {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .cabeca h2 {
    font-size: 0.9375rem;
    font-weight: 650;
  }
  .ico {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
  }
  .ico-pos {
    background: var(--pos-soft);
    color: var(--pos);
  }
  .ico-neg {
    background: var(--neg-soft);
    color: var(--neg);
  }
  .ico-azul {
    background: var(--orange-soft);
    color: var(--orange);
  }
  .total {
    font-size: clamp(1.5rem, 1.3rem + 0.8vw, 1.9rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .lista-secao {
    padding-top: 24px;
    display: grid;
    gap: 10px;
  }
  .lista-secao h2 {
    font-size: 1.0625rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .row-val small {
    font-weight: 600;
  }
  .vazio {
    background: var(--surface);
    border-radius: var(--r-card);
    box-shadow: var(--shadow);
    padding: 18px 16px;
    color: var(--muted);
  }
  .aviso {
    background: var(--warn-soft);
    color: var(--ink);
    border-radius: var(--r-card);
    padding: 16px;
    display: grid;
    gap: 8px;
    justify-items: start;
  }
  .aviso p {
    max-width: 60ch;
  }
  .aviso .btn {
    min-height: 44px;
  }
  .row-meta {
    white-space: normal;
  }
</style>

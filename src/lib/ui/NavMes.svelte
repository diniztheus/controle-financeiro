<script lang="ts">
  /** ‹ Outubro de 2026 › numa pílula — links comuns (funcionam sem JavaScript). */
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { mesAtual, type Mes } from '$lib/dominio/datas';
  import { mesesVizinhos, tituloMes } from './formato';

  interface Props {
    mes: Mes;
    /** Monta o link de um mês (ex.: m => resolve('/gastos') + '?mes=' + m). */
    href: (m: Mes) => string;
  }
  let { mes, href }: Props = $props();
  const viz = $derived(mesesVizinhos(mes));
  const atual = mesAtual();
</script>

<nav class="month" aria-label="Mês">
  <!-- eslint-disable svelte/no-navigation-without-resolve -- href já vem resolvido pela página -->
  <div class="pilula">
    <a class="ib" href={href(viz.anterior)} aria-label="Mês anterior" data-sveltekit-noscroll
      ><ChevronLeft size={20} /></a
    >
    <strong data-testid="mes-atual">{tituloMes(mes)}</strong>
    <a class="ib" href={href(viz.proximo)} aria-label="Próximo mês" data-sveltekit-noscroll
      ><ChevronRight size={20} /></a
    >
  </div>
  {#if mes !== atual}
    <a class="hoje" href={href(atual)} data-sveltekit-noscroll>Voltar para hoje</a>
  {/if}
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
</nav>

<style>
  .month {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pilula {
    display: inline-flex;
    align-items: center;
    background: var(--surface);
    border-radius: 999px;
    box-shadow: var(--shadow);
    padding: 2px;
  }
  .pilula strong {
    min-width: 9.5em;
    text-align: center;
    font-weight: 650;
    font-size: 0.9375rem;
    padding-inline: 4px;
  }
  .ib {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--ink);
    transition:
      background-color var(--t),
      transform var(--t);
  }
  .ib:hover {
    background: var(--step);
  }
  .ib:active {
    transform: scale(0.92);
  }
  .hoje {
    color: var(--orange);
    font-weight: 600;
    font-size: 0.875rem;
    padding: 10px 6px;
    text-decoration: none;
  }
  .hoje:hover {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
</style>

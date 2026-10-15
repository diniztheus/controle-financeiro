<script lang="ts">
  /** ‹ mês anterior · Mês de 2026 · próximo mês › — links comuns (funcionam sem JavaScript). */
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
  <a class="ib" href={href(viz.anterior)} aria-label="Mês anterior" data-sveltekit-noscroll>‹</a>
  <strong data-testid="mes-atual">{tituloMes(mes)}</strong>
  <a class="ib" href={href(viz.proximo)} aria-label="Próximo mês" data-sveltekit-noscroll>›</a>
  {#if mes !== atual}
    <a class="hoje" href={href(atual)} data-sveltekit-noscroll>Voltar para hoje</a>
  {/if}
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
</nav>

<style>
  .month {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .month strong {
    min-width: 9.5em;
    text-align: center;
    font-weight: 600;
    background: var(--step);
    align-self: stretch;
    display: grid;
    place-items: center;
    padding-inline: 8px;
  }
  .ib {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    font-size: 1.375rem;
    background: var(--step);
    color: var(--ink);
    text-decoration: none;
    transition:
      background-color var(--t),
      transform var(--t);
  }
  .ib:hover {
    background: color-mix(in srgb, var(--step) 70%, var(--ink) 30%);
  }
  .ib:active {
    transform: scale(0.94);
  }
  .hoje {
    color: var(--ink);
    font-weight: 600;
    font-size: 0.9375rem;
    padding: 10px 8px;
    text-underline-offset: 4px;
  }
</style>

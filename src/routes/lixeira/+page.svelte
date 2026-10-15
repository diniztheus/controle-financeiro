<script lang="ts">
  import { enhance } from '$app/forms';
  import { formatarDia } from '$lib/dominio/datas';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import { corCss, dataDeIso } from '$lib/ui/formato';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const vazia = $derived(!data.gastos.length && !data.contas.length);
</script>

<svelte:head>
  <title>Controle Financeiro · Lixeira</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Lixeira</h1>
    <p>
      Gastos e contas removidos ficam aqui, fora das somas, até você restaurar. Nada é apagado de
      vez.
    </p>
  </div>
</header>

{#if form?.acao && 'ok' in form}
  <p class="aviso pad ok-msg" role="status">{form.ok}</p>
{:else if form?.erro}
  <p class="aviso pad err" role="alert">{form.erro}</p>
{/if}

<section class="sec alt pad grade">
  {#if vazia}
    <div class="empty">
      <strong>A lixeira está vazia</strong>
      <span>Quando você remover um gasto ou uma conta, ele aparece aqui.</span>
    </div>
  {:else}
    <div class="col">
      <div class="col-head"><h2 class="h">Gastos</h2></div>
      {#if data.gastos.length}
        <ul class="rows" data-testid="lixeira-gastos">
          {#each data.gastos as g (g.id)}
            <li class="row">
              <span class="sq" style="--cc: {corCss(g.categoriaCor)}"></span>
              <span class="row-main">
                <span class="row-title"
                  >{g.descricao ?? g.categoriaNome} · {formatarBRL(g.valorTotalCentavos)}</span
                >
                <span class="row-meta"
                  >{formatarDia(g.dataCompra)} · removido em {dataDeIso(g.removidoEm)}</span
                >
              </span>
              <form method="POST" action="?/gasto" use:enhance>
                <input type="hidden" name="id" value={g.id} />
                <button class="btn sm ink" type="submit">Restaurar</button>
              </form>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Nenhum gasto na lixeira.</p>
      {/if}
    </div>
    <div class="col">
      <div class="col-head"><h2 class="h">Contas</h2></div>
      {#if data.contas.length}
        <ul class="rows" data-testid="lixeira-contas">
          {#each data.contas as c (c.id)}
            <li class="row">
              <span class="sq" style="--cc: var(--ink)"></span>
              <span class="row-main">
                <span class="row-title">{c.nome} · {formatarBRL(c.saldoCentavos)}</span>
                <span class="row-meta">removida em {dataDeIso(c.removidoEm ?? c.atualizadoEm)}</span
                >
              </span>
              <form method="POST" action="?/conta" use:enhance>
                <input type="hidden" name="id" value={c.id} />
                <button class="btn sm ink" type="submit">Restaurar</button>
              </form>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Nenhuma conta na lixeira.</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .grade {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: 48px 64px;
    align-items: start;
    padding-block: clamp(32px, 5vw, 64px) clamp(64px, 10vw, 144px);
  }
  @media (max-width: 900px) {
    .grade {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .h {
    font-size: var(--s-lead);
  }
  .aviso {
    background: var(--orange-soft);
    padding-block: 12px;
  }
</style>

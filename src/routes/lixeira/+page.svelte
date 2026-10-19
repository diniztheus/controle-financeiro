<script lang="ts">
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import CreditCard from '@lucide/svelte/icons/credit-card';
  import { enhance } from '$app/forms';
  import { formatarDia } from '$lib/dominio/datas';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import { ICONE_CONTA } from '$lib/ui/icones';
  import { corCss, dataDeIso } from '$lib/ui/formato';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const vazia = $derived(
    !data.gastos.length &&
      !data.receitas.length &&
      !data.recorrentes.length &&
      !data.contas.length &&
      !data.cartoes.length,
  );
</script>

<svelte:head>
  <title>Controle Financeiro · Lixeira</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Lixeira</h1>
    <p>
      Gastos, receitas, contas e cartões removidos ficam aqui, fora das somas, até você restaurar.
      Nada é apagado de vez.
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
      <span
        >Quando você remover um gasto, uma receita, uma conta ou um cartão, ele aparece aqui.</span
      >
    </div>
  {:else}
    <div class="col">
      <div class="col-head"><h2 class="h">Gastos</h2></div>
      {#if data.gastos.length}
        <ul class="rows" data-testid="lixeira-gastos">
          {#each data.gastos as g (g.id)}
            <li class="row">
              <IconeRedondo nome={g.categoriaNome} cor={corCss(g.categoriaCor)} />
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
                <button class="btn sm restaurar" type="submit"
                  ><RotateCcw size={16} aria-hidden="true" />Restaurar</button
                >
              </form>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Nenhum gasto na lixeira.</p>
      {/if}
    </div>
    <div class="col">
      <div class="col-head"><h2 class="h">Receitas</h2></div>
      {#if data.receitas.length}
        <ul class="rows" data-testid="lixeira-receitas">
          {#each data.receitas as r (r.id)}
            <li class="row">
              <IconeRedondo nome={r.categoria} cor="var(--pos)" />
              <span class="row-main">
                <span class="row-title"
                  >{r.descricao ?? r.categoria} · {formatarBRL(r.valorCentavos)}</span
                >
                <span class="row-meta"
                  >{formatarDia(r.data)} · removida em {dataDeIso(r.removidoEm)}</span
                >
              </span>
              <form method="POST" action="?/receita" use:enhance>
                <input type="hidden" name="id" value={r.id} />
                <button class="btn sm restaurar" type="submit"
                  ><RotateCcw size={16} aria-hidden="true" />Restaurar</button
                >
              </form>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Nenhuma receita na lixeira.</p>
      {/if}
    </div>
    <div class="col">
      <div class="col-head"><h2 class="h">Receitas recorrentes</h2></div>
      {#if data.recorrentes.length}
        <ul class="rows" data-testid="lixeira-recorrentes">
          {#each data.recorrentes as m (m.id)}
            <li class="row">
              <IconeRedondo nome={m.categoria} cor="var(--pos)" />
              <span class="row-main">
                <span class="row-title"
                  >{m.descricao ?? m.categoria} · {formatarBRL(m.valorCentavos)}</span
                >
                <span class="row-meta"
                  >Todo dia {m.diaDoMes} · removida em {dataDeIso(
                    m.removidoEm ?? m.atualizadoEm,
                  )}</span
                >
              </span>
              <form method="POST" action="?/recorrente" use:enhance>
                <input type="hidden" name="id" value={m.id} />
                <button class="btn sm restaurar" type="submit"
                  ><RotateCcw size={16} aria-hidden="true" />Restaurar</button
                >
              </form>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Nenhuma receita recorrente na lixeira.</p>
      {/if}
    </div>
    <div class="col">
      <div class="col-head"><h2 class="h">Contas</h2></div>
      {#if data.contas.length}
        <ul class="rows" data-testid="lixeira-contas">
          {#each data.contas as c (c.id)}
            <li class="row">
              <IconeRedondo icone={ICONE_CONTA[c.tipo]} cor="var(--orange)" suave />
              <span class="row-main">
                <span class="row-title">{c.nome} · {formatarBRL(c.saldoCentavos)}</span>
                <span class="row-meta">removida em {dataDeIso(c.removidoEm ?? c.atualizadoEm)}</span
                >
              </span>
              <form method="POST" action="?/conta" use:enhance>
                <input type="hidden" name="id" value={c.id} />
                <button class="btn sm restaurar" type="submit"
                  ><RotateCcw size={16} aria-hidden="true" />Restaurar</button
                >
              </form>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Nenhuma conta na lixeira.</p>
      {/if}
    </div>
    <div class="col">
      <div class="col-head"><h2 class="h">Cartões</h2></div>
      {#if data.cartoes.length}
        <ul class="rows" data-testid="lixeira-cartoes">
          {#each data.cartoes as k (k.id)}
            <li class="row">
              <IconeRedondo icone={CreditCard} cor="var(--orange)" suave />
              <span class="row-main">
                <span class="row-title">{k.nome}</span>
                <span class="row-meta">removido em {dataDeIso(k.removidoEm ?? k.atualizadoEm)}</span
                >
              </span>
              <form method="POST" action="?/cartao" use:enhance>
                <input type="hidden" name="id" value={k.id} />
                <button class="btn sm restaurar" type="submit"
                  ><RotateCcw size={16} aria-hidden="true" />Restaurar</button
                >
              </form>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Nenhum cartão na lixeira.</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .h {
    font-size: var(--s-lead);
  }
  .aviso {
    background: var(--orange-soft);
    padding-block: 12px;
  }
  /* Restaurar: botão claro, com o azul suave do site (a ação segura, sem competir com o resto) */
  button.restaurar {
    background: var(--orange-soft);
    color: var(--orange);
    font-weight: 650;
  }
  button.restaurar:hover {
    background: color-mix(in srgb, var(--orange-soft) 80%, var(--orange) 20%);
  }
  .row form {
    margin: 0;
  }
</style>

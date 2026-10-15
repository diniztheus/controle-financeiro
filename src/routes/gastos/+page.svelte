<script lang="ts">
  import { enhance } from '$app/forms';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import type { Mes } from '$lib/dominio/datas';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import FormGasto from '$lib/ui/FormGasto.svelte';
  import ListaLancamentos from '$lib/ui/ListaLancamentos.svelte';
  import NavMes from '$lib/ui/NavMes.svelte';
  import Valor from '$lib/ui/Valor.svelte';
  import { plural, soNomeMes, tituloMes } from '$lib/ui/formato';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const nomeMes = $derived(soNomeMes(data.mes));
  const linkMes = (m: Mes) => resolve(`/gastos?mes=${m}`);
  const falhou = $derived(form?.acao === 'lancar' && !('lancado' in form));
  // O aviso de "desfazer" vem pela URL; depois de mostrado, o parâmetro sai da barra.
  onMount(() => {
    if (page.url.searchParams.has('removido')) {
      replaceState(resolve(`/gastos?mes=${data.mes}`), page.state);
    }
  });
  const lancado = $derived(
    form && 'lancado' in form
      ? form.lancado
      : data.lancadoSemJs
        ? { id: '', valorCentavos: data.lancadoSemJs, mes: data.mes }
        : null,
  );
</script>

<svelte:head>
  <title>Controle Financeiro · Gastos de {tituloMes(data.mes).toLowerCase()}</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Gastos</h1>
    <p>Gastos à vista, pagos com conta ou dinheiro. Compras no cartão chegam em breve.</p>
  </div>
  <NavMes mes={data.mes} href={linkMes} />
</header>

{#if data.removido}
  <form class="aviso pad" method="POST" action="?/restaurar" use:enhance>
    <input type="hidden" name="id" value={data.removido} />
    <span>Gasto mandado para a lixeira.</span>
    <button class="btn sm ink" type="submit">Desfazer</button>
  </form>
{/if}
{#if form?.acao === 'restaurar' && form.erro}
  <p class="aviso pad err" role="alert">{form.erro}</p>
{/if}

<section class="sec alt pad grade form-primeiro" aria-label="Lançar e listar gastos">
  <div class="painel-form" id="novo">
    <h2>Novo gasto</h2>
    <FormGasto
      acao="?/lancar"
      rotulo="Lançar gasto"
      categorias={data.categorias}
      contas={data.contas}
      inicial={{
        data: data.dataInicial,
        categoriaId: data.ultimaCategoria,
      }}
      erros={falhou ? form?.erros : undefined}
      erro={falhou ? form?.erro : undefined}
      valores={falhou ? form?.valores : undefined}
    />
    {#if lancado}
      <p class="ok-msg" role="status" data-testid="gasto-lancado">
        Gasto de {formatarBRL(lancado.valorCentavos)} lançado{#if lancado.mes !== data.mes}
          em {soNomeMes(lancado.mes)}.
          <a href={linkMes(lancado.mes)}>Ver {tituloMes(lancado.mes).toLowerCase()}</a>{:else}.{/if}
      </p>
    {/if}
  </div>

  <div class="col">
    <div class="col-head">
      <h2 class="h-sec">{tituloMes(data.mes)}</h2>
      <p class="total"><Valor centavos={data.totalCentavos} testid="total-gastos" /></p>
    </div>
    <p class="muted">{plural(data.quantidade, 'lançamento', 'lançamentos')}</p>
    {#if data.dias.length}
      <ListaLancamentos dias={data.dias} />
    {:else}
      <div class="empty">
        <strong>Nada lançado em {nomeMes}</strong>
        <span>Use o formulário ao lado. O valor aceita vírgula: 42,90.</span>
      </div>
    {/if}
    <p class="note">
      Removeu algo sem querer? Está na <a href={resolve('/lixeira')}>lixeira</a>.
    </p>
  </div>
</section>

<style>
  .aviso {
    background: var(--orange-soft);
    padding-block: 12px;
    display: flex;
    align-items: center;
    gap: 8px 16px;
    flex-wrap: wrap;
    font-weight: 500;
  }
  #novo {
    scroll-margin-top: 96px;
  }
  .h-sec {
    font-size: var(--s-head);
  }
  .total {
    font-size: clamp(1.75rem, 1.2rem + 2vw, 3rem);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .note a,
  .ok-msg a {
    color: var(--ink);
    font-weight: 600;
    text-underline-offset: 4px;
  }
</style>

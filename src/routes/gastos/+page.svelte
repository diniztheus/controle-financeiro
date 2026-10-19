<script lang="ts">
  import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right';
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
    <p>
      Gastos pagos com conta, dinheiro ou cartão. Compras no cartão entram nas faturas do mês certo.
    </p>
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

<section class="pad total-sec" aria-label="Total do mês">
  <div class="card total">
    <div class="total-cab">
      <span class="ico"><ArrowDownRight size={20} /></span>
      <div class="total-txt">
        <p class="small muted">Total gasto em</p>
        <h2>{tituloMes(data.mes)}</h2>
      </div>
    </div>
    <p class="total-val"><Valor centavos={data.totalCentavos} testid="total-gastos" /></p>
    <p class="small muted">{plural(data.quantidade, 'lançamento', 'lançamentos')}</p>
  </div>
</section>

<section class="sec alt pad grade form-primeiro" aria-label="Lançar e listar gastos">
  <div class="painel-form" id="novo">
    <h2>Novo gasto</h2>
    <FormGasto
      acao="?/lancar"
      rotulo="Lançar gasto"
      categorias={data.categorias}
      contas={data.contas}
      cartoes={data.cartoes}
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
      <h2 class="h-sec">Lançamentos</h2>
    </div>
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
  /* Total do mês: cartão de destaque, com o valor grande em vermelho (saída) */
  .total-sec {
    padding-block: 12px 0;
  }
  .total {
    gap: 10px;
  }
  .total-cab {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .total-txt {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .total-txt h2 {
    font-size: 1.0625rem;
    font-weight: 650;
  }
  .ico {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    background: var(--neg-soft);
    color: var(--neg);
  }
  .total-val {
    font-size: clamp(2rem, 1.5rem + 2.4vw, 3rem);
    font-weight: 750;
    letter-spacing: -0.035em;
    line-height: 1.05;
    color: var(--neg);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .total-val :global(.cur) {
    font-size: 0.5em;
    vertical-align: 0.7em;
    margin-right: 0.15em;
  }
  .note a,
  .ok-msg a {
    color: var(--ink);
    font-weight: 600;
    text-underline-offset: 4px;
  }
</style>

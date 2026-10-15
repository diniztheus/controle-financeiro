<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import { formatarDia } from '$lib/dominio/datas';
  import FormGasto from '$lib/ui/FormGasto.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const g = $derived(data.gasto);
  const voltar = $derived(resolve(`/gastos?mes=${g.dataCompra.slice(0, 7)}`));
  const erroSalvar = $derived(form?.acao === 'salvar' ? form : null);
  let confirmar = $state(false);
</script>

<svelte:head>
  <title>Controle Financeiro · {g.descricao ?? data.categoriaNome}</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>{data.editavel ? 'Editar gasto' : 'Compra no cartão'}</h1>
    <p>{g.descricao ?? data.categoriaNome} · {formatarBRL(g.valorTotalCentavos)}</p>
    <p class="voltar-l"><a class="voltar" href={voltar}>‹ Voltar aos gastos</a></p>
  </div>
</header>

<section class="sec alt pad grade">
  <div class="painel-form">
    {#if data.editavel}
      <FormGasto
        acao="?/salvar"
        rotulo="Salvar alterações"
        id="e"
        categorias={data.categorias}
        contas={data.contas}
        inicial={{
          valorCentavos: g.valorTotalCentavos,
          descricao: g.descricao,
          categoriaId: g.categoriaId,
          data: g.dataCompra,
          contaId: g.contaId,
        }}
        erros={erroSalvar?.erros}
        erro={erroSalvar?.erro}
        valores={erroSalvar?.valores}
      />
    {:else}
      <dl class="fatos">
        <div>
          <dt>Valor total</dt>
          <dd class="num">{formatarBRL(g.valorTotalCentavos)}</dd>
        </div>
        <div>
          <dt>Parcelas</dt>
          <dd class="num">{g.numParcelas}x</dd>
        </div>
        <div>
          <dt>Data da compra</dt>
          <dd class="num">{formatarDia(g.dataCompra)}</dd>
        </div>
        <div>
          <dt>Cartão</dt>
          <dd>{data.cartaoNome ?? '—'}</dd>
        </div>
      </dl>
      <p class="note">
        Compras no cartão e parceladas vieram do app atual e já contam nos meses certos. Editá-las
        fica para a tela de cartões, que chega em breve. Por enquanto dá para mandá-las para a
        lixeira.
      </p>
    {/if}
  </div>

  <div class="col remover">
    <h2>Remover</h2>
    <p class="note">O gasto vai para a lixeira e sai das somas. Dá para restaurar quando quiser.</p>
    {#if confirmar}
      <form method="POST" action="?/remover" use:enhance class="acts">
        <button class="btn perigo" type="submit">Sim, mandar para a lixeira</button>
        <button class="btn" type="button" onclick={() => (confirmar = false)}>Cancelar</button>
      </form>
    {:else}
      <!-- Sem JavaScript, o formulário envia direto (não há como perguntar antes). -->
      <form
        method="POST"
        action="?/remover"
        onsubmit={(e) => {
          e.preventDefault();
          confirmar = true;
        }}
      >
        <button class="btn" type="submit">Mandar para a lixeira</button>
      </form>
    {/if}
    {#if form?.acao === 'remover' && form.erro}<p class="err" role="alert">{form.erro}</p>{/if}
  </div>
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
  .remover h2 {
    font-size: var(--s-lead);
  }
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .fatos {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    margin: 0;
  }
  .fatos div {
    background: var(--surface);
    padding: 14px 16px;
    display: grid;
    gap: 2px;
  }
  .fatos dt {
    font-size: var(--s-small);
    color: var(--muted);
  }
  .fatos dd {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
</style>

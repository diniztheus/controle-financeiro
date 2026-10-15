<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import { formatarDia } from '$lib/dominio/datas';
  import ConfirmarRemocao from '$lib/ui/ConfirmarRemocao.svelte';
  import FormGasto from '$lib/ui/FormGasto.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const g = $derived(data.gasto);
  const voltar = $derived(resolve(`/gastos?mes=${g.dataCompra.slice(0, 7)}`));
  const erroSalvar = $derived(form?.acao === 'salvar' ? form : null);
</script>

<svelte:head>
  <title>Controle Financeiro · {g.descricao ?? data.categoriaNome}</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>
      {data.editavel
        ? 'Editar gasto'
        : g.meio === 'cartao'
          ? 'Compra no cartão'
          : 'Compra parcelada'}
    </h1>
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
    <ConfirmarRemocao />
    {#if form?.acao === 'remover' && form.erro}<p class="err" role="alert">{form.erro}</p>{/if}
  </div>
</section>

<style>
  .remover h2 {
    font-size: var(--s-lead);
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

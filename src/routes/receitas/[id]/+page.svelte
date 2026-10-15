<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import ConfirmarRemocao from '$lib/ui/ConfirmarRemocao.svelte';
  import FormReceita from '$lib/ui/FormReceita.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const r = $derived(data.receita);
  const voltar = $derived(resolve(`/receitas?mes=${r.data.slice(0, 7)}`));
  const erroSalvar = $derived(form?.acao === 'salvar' ? form : null);
</script>

<svelte:head>
  <title>Controle Financeiro · {r.descricao ?? r.categoria}</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Editar receita</h1>
    <p>{r.descricao ?? r.categoria} · {formatarBRL(r.valorCentavos)}</p>
    <p class="voltar-l"><a class="voltar" href={voltar}>‹ Voltar às receitas</a></p>
  </div>
</header>

<section class="sec alt pad grade">
  <div class="painel-form">
    <FormReceita
      acao="?/salvar"
      rotulo="Salvar alterações"
      id="e"
      categorias={data.categorias}
      contas={data.contas}
      inicial={{
        valorCentavos: r.valorCentavos,
        descricao: r.descricao,
        categoria: r.categoria,
        data: r.data,
        contaId: r.contaId,
        observacao: r.observacao,
      }}
      erros={erroSalvar?.erros}
      erro={erroSalvar?.erro}
      valores={erroSalvar?.valores}
    />
  </div>

  <div class="col remover">
    <h2>Remover</h2>
    <p class="note">
      A receita vai para a lixeira e sai das somas. Dá para restaurar quando quiser.
    </p>
    <ConfirmarRemocao />
    {#if form?.acao === 'remover' && form.erro}<p class="err" role="alert">{form.erro}</p>{/if}
  </div>
</section>

<style>
  .remover h2 {
    font-size: var(--s-lead);
  }
</style>

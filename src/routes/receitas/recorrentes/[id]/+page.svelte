<script lang="ts">
  import { resolve } from '$app/paths';
  import { descreverRecorrencia } from '$lib/dominio/recorrencias';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import ConfirmarRemocao from '$lib/ui/ConfirmarRemocao.svelte';
  import FormRecorrente from '$lib/ui/FormRecorrente.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const r = $derived(data.recorrente);
  const erroSalvar = $derived(form?.acao === 'salvar' ? form : null);
</script>

<svelte:head>
  <title>Controle Financeiro · {r.descricao ?? r.categoria}</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Editar receita recorrente</h1>
    <p>{r.descricao ?? r.categoria} · {formatarBRL(r.valorCentavos)} · {descreverRecorrencia(r)}</p>
    <p class="voltar-l">
      <a class="voltar" href={resolve('/receitas/recorrentes')}>‹ Voltar às recorrentes</a>
    </p>
  </div>
</header>

<section class="sec alt pad grade">
  <div class="painel-form">
    <p class="aviso-edicao" role="note">
      Mudanças valem só para os próximos meses. As receitas que já foram lançadas não mudam.
    </p>
    <FormRecorrente
      acao="?/salvar"
      rotulo="Salvar alterações"
      id="e"
      categorias={data.categorias}
      contas={data.contas}
      inicial={{
        valorCentavos: r.valorCentavos,
        descricao: r.descricao,
        categoria: r.categoria,
        diaDoMes: r.diaDoMes,
        inicio: r.inicio,
        fim: r.fim,
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
      O modelo vai para a lixeira e para de lançar receitas. As já lançadas continuam no histórico,
      e dá para restaurar o modelo quando quiser.
    </p>
    <ConfirmarRemocao acao="?/remover" rotulo="Mandar para a lixeira" />
    {#if form?.acao === 'remover' && form.erro}<p class="err" role="alert">{form.erro}</p>{/if}
  </div>
</section>

<style>
  .aviso-edicao {
    background: var(--orange-soft);
    padding: 10px 12px;
    border-radius: var(--r);
    font-weight: 500;
    margin: 0 0 18px;
  }
  .remover h2 {
    font-size: var(--s-lead);
  }
</style>

<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { mesDe, primeiroDiaDoMes, ultimoDiaDoMes } from '$lib/dominio/datas';
  import { centavosParaCampo, formatarBRL } from '$lib/dominio/dinheiro';
  import { soNomeMes } from '$lib/ui/formato';
  import ConfirmarRemocao from '$lib/ui/ConfirmarRemocao.svelte';
  import FormReceita from '$lib/ui/FormReceita.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const r = $derived(data.receita);
  const voltar = $derived(resolve(`/receitas?mes=${r.data.slice(0, 7)}`));
  const erroSalvar = $derived(form?.acao === 'salvar' ? form : null);
  const erroConfirmar = $derived(form?.acao === 'confirmar' ? form : null);
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

{#if data.previsto}
  <section class="sec pad previa" aria-labelledby="previa-titulo" data-testid="receita-prevista">
    <div class="previa-texto">
      <h2 id="previa-titulo">Receita prevista</h2>
      <p class="small muted">
        Lançada pela recorrente e ainda não confirmada: não entra nos totais. Quando o dinheiro
        cair, confirme; se o valor ou a data reais forem outros, ajuste aqui.
      </p>
    </div>
    <form class="confirmar" method="POST" action="?/confirmar" use:enhance>
      <div class="campos">
        <div class="field">
          <label for="c-valor">Valor recebido (R$)</label>
          <input
            id="c-valor"
            name="valor"
            inputmode="decimal"
            required
            value={erroConfirmar?.valores?.valor ?? centavosParaCampo(r.valorCentavos)}
            aria-invalid={erroConfirmar?.erros?.valor ? 'true' : undefined}
          />
          {#if erroConfirmar?.erros?.valor}<span class="err">{erroConfirmar.erros.valor}</span>{/if}
        </div>
        <div class="field">
          <label for="c-data">Data recebida</label>
          <input
            id="c-data"
            name="data"
            type="date"
            required
            min={primeiroDiaDoMes(mesDe(r.data))}
            max={ultimoDiaDoMes(mesDe(r.data))}
            value={erroConfirmar?.valores?.data ?? r.data}
            aria-invalid={erroConfirmar?.erros?.data ? 'true' : undefined}
            aria-describedby="c-data-dica"
          />
          <span class="small muted" id="c-data-dica"
            >A data fica dentro de {soNomeMes(mesDe(r.data))}</span
          >
          {#if erroConfirmar?.erros?.data}<span class="err">{erroConfirmar.erros.data}</span>{/if}
        </div>
      </div>
      {#if erroConfirmar?.erro}<p class="err" role="alert">{erroConfirmar.erro}</p>{/if}
      <div class="acts">
        <button class="btn ink" type="submit">Confirmar recebimento</button>
      </div>
    </form>
  </section>
{/if}

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
  .previa {
    display: grid;
    gap: 16px;
    max-width: 760px;
  }
  .previa h2 {
    font-size: var(--s-lead);
  }
  .previa-texto {
    display: grid;
    gap: 4px;
  }
  .confirmar {
    display: grid;
    gap: 12px;
  }
  .confirmar .campos {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px 14px;
  }
  .confirmar .field {
    display: grid;
    gap: 4px;
  }
  .confirmar .acts {
    display: flex;
    align-items: center;
    gap: 8px 14px;
  }
</style>

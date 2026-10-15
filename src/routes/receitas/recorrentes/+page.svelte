<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { formatarDia } from '$lib/dominio/datas';
  import FormRecorrente from '$lib/ui/FormRecorrente.svelte';
  import Valor from '$lib/ui/Valor.svelte';
  import { plural } from '$lib/ui/formato';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const erroCriar = $derived(form?.acao === 'criar' && !('ok' in form) ? form : null);
  /** Erro de pausar, retomar ou remover (inclusive o de "fim já passou", que vem por campo). */
  const erroAcao = $derived(
    form && form.acao !== 'criar' && !('ok' in form)
      ? (form.erro ?? (form.erros ? Object.values(form.erros)[0] : undefined) ?? null)
      : null,
  );
  const ativas = $derived(data.recorrentes.filter((r) => r.ativa).length);
</script>

<svelte:head>
  <title>Controle Financeiro · Receitas recorrentes</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Receitas recorrentes</h1>
    <p>
      Salário, bolsa, aluguel recebido. O site lança a receita todo mês sozinho, no dia combinado. O
      que já foi lançado não muda quando você edita o modelo. As receitas lançadas aparecem como
      "previstas" até você confirmar o recebimento.
    </p>
    <p class="voltar-l"><a class="voltar" href={resolve('/receitas')}>‹ Voltar às receitas</a></p>
  </div>
</header>

{#if erroAcao}
  <p class="aviso pad err" role="alert">{erroAcao}</p>
{:else if data.aviso}
  <p class="aviso pad ok-msg" role="status" data-testid="recorrente-aviso">{data.aviso}</p>
{/if}

<section class="sec alt pad grade form-primeiro">
  <div class="painel-form" id="nova">
    <h2>Nova receita recorrente</h2>
    <FormRecorrente
      acao="?/criar"
      rotulo="Criar receita recorrente"
      categorias={data.categorias}
      contas={data.contas}
      inicial={{ inicio: data.hoje, categoria: 'Salário' }}
      erros={erroCriar?.erros}
      erro={erroCriar?.erro}
      valores={erroCriar?.valores}
    />
  </div>

  <div class="col">
    <div class="col-head">
      <h2 class="h">Modelos</h2>
      <p class="muted">
        {plural(ativas, 'ativa', 'ativas')} de {data.recorrentes.length}
      </p>
    </div>

    {#if data.recorrentes.length}
      <ul class="modelos" data-testid="lista-recorrentes">
        {#each data.recorrentes as r (r.id)}
          <li class="modelo" class:pausada={!r.ativa}>
            <div class="modelo-top">
              <div class="modelo-id">
                <span class="modelo-nome">{r.descricao ?? r.categoria}</span>
                <span class="muted small">{r.categoria} · {r.descricaoRecorrencia}</span>
              </div>
              <p class="modelo-valor"><Valor centavos={r.valorCentavos} /></p>
            </div>
            <p class="modelo-estado">
              <span class="tag">{r.ativa ? 'Ativa' : 'Pausada'}</span>
              {#if !r.ativa}
                <span>Não lança novas receitas até ser retomada</span>
              {:else if r.proxima}
                <span>Próxima: {formatarDia(r.proxima)}</span>
              {:else}
                <span>Encerrada</span>
              {/if}
              <span class="muted">· {plural(r.geradas, 'lançada', 'lançadas')}</span>
            </p>
            <div class="modelo-acts">
              <form method="POST" action={r.ativa ? '?/pausar' : '?/retomar'} use:enhance>
                <input type="hidden" name="id" value={r.id} />
                <button class="btn sm" type="submit">{r.ativa ? 'Pausar' : 'Retomar'}</button>
              </form>
              <a class="btn sm" href={resolve('/receitas/recorrentes/[id]', { id: r.id })}>
                Editar
              </a>
              <form method="POST" action="?/remover" use:enhance>
                <input type="hidden" name="id" value={r.id} />
                <button class="btn sm" type="submit">Remover</button>
              </form>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty">
        <strong>Nenhuma receita recorrente</strong>
        <span>
          Cadastre o que se repete todo mês: salário todo dia 5, bolsa de pesquisa até dezembro,
          aluguel recebido todo dia 1.
        </span>
      </div>
    {/if}
    <p class="note">
      Remover o modelo manda para a <a href={resolve('/lixeira')}>lixeira</a>. As receitas já
      lançadas continuam no histórico.
    </p>
  </div>
</section>

<style>
  .aviso {
    background: var(--orange-soft);
    padding-block: 12px;
    font-weight: 500;
  }
  .h {
    font-size: var(--s-lead);
  }
  .modelos {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .modelo {
    background: var(--paper);
    border-radius: var(--r);
    padding: 16px 18px;
    display: grid;
    gap: 10px;
  }
  .modelo.pausada {
    opacity: 0.8;
  }
  .modelo-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }
  .modelo-id {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .modelo-nome {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .modelo-valor {
    font-weight: 700;
    white-space: nowrap;
  }
  .modelo-estado {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    margin: 0;
    font-size: var(--s-small);
  }
  .modelo-acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .modelo-acts form {
    display: contents;
  }
  .note a {
    color: var(--ink);
    font-weight: 600;
    text-underline-offset: 4px;
  }
</style>

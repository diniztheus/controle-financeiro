<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { formatarDia } from '$lib/dominio/datas';
  import FormRecorrente from '$lib/ui/FormRecorrente.svelte';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
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
      <ul class="assinaturas" data-testid="lista-recorrentes">
        {#each data.recorrentes as r (r.id)}
          <li class="card assinatura" class:pausada={!r.ativa}>
            <div class="assin-topo">
              <IconeRedondo nome={r.descricao ?? r.categoria} cor="var(--pos)" />
              <div class="assin-id">
                <span class="assin-nome">{r.descricao ?? r.categoria}</span>
                <span class="small muted">{r.categoria}</span>
              </div>
              <span class="etiq" class:ativa={r.ativa} class:pausa={!r.ativa}
                >{r.ativa ? 'Ativa' : 'Pausada'}</span
              >
            </div>
            <div class="assin-valor-linha">
              <p class="assin-valor pos">+<Valor centavos={r.valorCentavos} /></p>
              <p class="small muted">{r.descricaoRecorrencia}</p>
            </div>
            <p class="assin-estado small">
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
  .assinaturas {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* Assinatura de entrada: cartão com ícone, valor, dia e estado */
  .assinatura {
    gap: 12px;
    padding: 16px 18px;
  }
  .assinatura.pausada {
    opacity: 0.85;
  }
  .assin-topo {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .assin-id {
    display: grid;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .assin-nome {
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .assin-valor-linha {
    display: grid;
    gap: 2px;
  }
  .assin-valor {
    font-size: clamp(1.375rem, 1.1rem + 0.8vw, 1.75rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
    white-space: nowrap;
  }
  .assin-estado {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    margin: 0;
  }
  .etiq {
    display: inline-block;
    flex: none;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--step);
    color: var(--muted);
  }
  .etiq.ativa {
    background: var(--pos-soft);
    color: var(--pos);
  }
  .etiq.pausa {
    background: var(--warn-soft);
    color: var(--warn);
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

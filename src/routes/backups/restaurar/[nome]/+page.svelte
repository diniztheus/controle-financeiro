<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { dataHoraBR, ROTULO_TIPO_BACKUP, tamanhoLegivel } from '$lib/ui/backupsFormato';
  import { ariaErro } from '$lib/ui/formularios';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  // Com JavaScript, o botão só habilita depois de marcar a caixa e digitar a palavra. Sem ele,
  // o botão fica ativo e o servidor confere tudo (o `pronto` evita desabilitar no HTML inicial).
  let pronto = $state(false);
  let entendi = $state(false);
  let palavra = $state('');
  onMount(() => {
    pronto = true;
  });
  const podeRestaurar = $derived(entendi && palavra.trim() === 'restaurar');

  const v = $derived(data.verificacao);
  const falha = $derived(form && form.acao === 'restaurar' && !('ok' in form) ? form : null);
  const erros = $derived(falha?.erros);
  const valoresPalavra = $derived(falha?.valores?.palavra ?? '');
</script>

<svelte:head>
  <title>Controle Financeiro · Restaurar backup</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Restaurar backup</h1>
    <p>Confira o backup antes de substituir o banco atual.</p>
  </div>
</header>

<section class="sec alt pad" aria-labelledby="h-arquivo">
  <h2 id="h-arquivo">O backup</h2>
  <dl class="fatos">
    <div>
      <dt>Data</dt>
      <dd data-testid="backup-data">{dataHoraBR(data.criadoEm)}</dd>
    </div>
    <div>
      <dt>Tipo</dt>
      <dd>{ROTULO_TIPO_BACKUP[data.tipo]}</dd>
    </div>
    <div>
      <dt>Tamanho</dt>
      <dd class="num">{tamanhoLegivel(data.bytes)}</dd>
    </div>
    <div class="largo">
      <dt>Arquivo</dt>
      <dd class="num arquivo">{data.nome}</dd>
    </div>
  </dl>
</section>

<section class="sec pad" aria-labelledby="h-verificacao">
  <h2 id="h-verificacao">Verificação do arquivo</h2>
  {#if v.ok}
    <p class="ok-msg" role="status" data-testid="verificacao-ok">
      O arquivo está íntegro e pode ser restaurado.
    </p>
  {:else}
    <p class="err" role="alert" data-testid="verificacao-erro">
      Este backup não pode ser restaurado.
    </p>
    <ul class="erros">
      {#each v.erros as e, i (i)}
        <li>{e}</li>
      {/each}
    </ul>
  {/if}

  <dl class="fatos" data-testid="resumo-backup">
    <div>
      <dt>Tabelas</dt>
      <dd class="num">{v.tabelas}</dd>
    </div>
    <div>
      <dt>Versão do esquema</dt>
      <dd class="num">{v.versaoEsquema?.replaceAll('_', ' ') ?? 'nenhuma'}</dd>
    </div>
    <div>
      <dt>Contas</dt>
      <dd class="num">{v.linhas.contas ?? 0}</dd>
    </div>
    <div>
      <dt>Compras</dt>
      <dd class="num">{v.linhas.compras ?? 0}</dd>
    </div>
    <div>
      <dt>Receitas</dt>
      <dd class="num">{v.linhas.receitas ?? 0}</dd>
    </div>
  </dl>
</section>

{#if v.ok}
  <section class="sec alt pad" aria-labelledby="h-restaurar">
    <h2 id="h-restaurar">Restaurar</h2>
    <div class="aviso-restauro" role="note">
      <strong>Atenção:</strong> O banco atual será substituído; uma cópia dele é guardada antes como "Antes
      de restaurar".
    </div>

    <form class="fc" method="POST" action="?/restaurar" use:enhance>
      <label class="marcar">
        <input
          type="checkbox"
          name="entendi"
          bind:checked={entendi}
          aria-describedby={erros?.entendi ? 'r-entendi-erro' : undefined}
        />
        <span>Entendi que o banco atual será substituído</span>
      </label>
      {#if erros?.entendi}
        <p class="err" role="alert" id="r-entendi-erro">{erros.entendi}</p>
      {/if}

      <div class="field">
        <label for="r-palavra">Digite <b>restaurar</b> para confirmar</label>
        <input
          id="r-palavra"
          name="palavra"
          autocomplete="off"
          value={valoresPalavra}
          oninput={(e) => (palavra = e.currentTarget.value)}
          {...ariaErro(erros?.palavra, 'r-palavra')}
        />
        {#if erros?.palavra}
          <span class="err" role="alert" id="r-palavra-erro">{erros.palavra}</span>
        {/if}
      </div>

      {#if falha?.erro}
        <p class="err" role="alert">{falha.erro}</p>
      {/if}

      <div class="acoes">
        <button class="btn perigo" type="submit" disabled={pronto && !podeRestaurar}>
          Restaurar este backup
        </button>
        <a class="btn" href={resolve('/backups')}>Cancelar</a>
      </div>
    </form>
  </section>
{:else}
  <section class="sec alt pad">
    <p class="note"><a href={resolve('/backups')}>Voltar para backups</a></p>
  </section>
{/if}

<style>
  .fatos {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 4px;
    margin: 0 0 20px;
  }
  .fatos div {
    background: var(--paper);
    padding: 14px 16px;
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .fatos .largo {
    grid-column: 1 / -1;
  }
  .fatos dt {
    font-size: 0.875rem;
    color: var(--muted);
  }
  .fatos dd {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .arquivo {
    font-size: 0.9375rem !important;
  }
  .erros {
    margin: 0 0 16px;
    padding-left: 20px;
  }
  .aviso-restauro {
    background: var(--orange-soft);
    border-left: 4px solid var(--orange);
    padding: 14px 16px;
    margin-bottom: 20px;
    max-width: 70ch;
  }
  .marcar {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-weight: 500;
    cursor: pointer;
  }
  .marcar input {
    width: 20px;
    height: 20px;
    margin-top: 2px;
    accent-color: var(--orange);
  }
  .acoes {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 8px;
  }
</style>

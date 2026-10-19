<script lang="ts">
  import Archive from '@lucide/svelte/icons/archive';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
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

<section class="sec pad" aria-labelledby="h-arquivo">
  <div class="card">
    <div class="cabeca">
      <IconeRedondo icone={Archive} cor="var(--orange)" suave />
      <h2 id="h-arquivo">O backup</h2>
    </div>
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
  </div>
</section>

<section class="sec pad" aria-labelledby="h-verificacao">
  <div class="card">
    <div class="cabeca">
      {#if v.ok}
        <IconeRedondo icone={ShieldCheck} cor="var(--pos)" suave />
      {:else}
        <IconeRedondo icone={ShieldAlert} cor="var(--neg)" suave />
      {/if}
      <h2 id="h-verificacao">Verificação do arquivo</h2>
    </div>

    {#if v.ok}
      <p class="etiqueta ok">Tudo ok</p>
      <p class="ok-msg" role="status" data-testid="verificacao-ok">
        O arquivo está íntegro e pode ser restaurado.
      </p>
    {:else}
      <p class="etiqueta falha">Problemas</p>
      <p class="err" role="alert" data-testid="verificacao-erro">
        Este backup não pode ser restaurado.
      </p>
      <ul class="rows erros">
        {#each v.erros as e, i (i)}
          <li class="row">
            <span class="row-main"><span class="row-title erro-texto">{e}</span></span>
          </li>
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
  </div>
</section>

{#if v.ok}
  <section class="sec pad" aria-labelledby="h-restaurar">
    <div class="card perigo-cartao">
      <div class="cabeca">
        <IconeRedondo icone={TriangleAlert} cor="var(--warn)" suave />
        <h2 id="h-restaurar">Restaurar</h2>
      </div>
      <div class="aviso-restauro" role="note">
        <strong>Atenção:</strong> O banco atual será substituído; uma cópia dele é guardada antes como
        "Antes de restaurar".
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
    </div>
  </section>
{:else}
  <section class="sec pad">
    <p class="note"><a href={resolve('/backups')}>Voltar para backups</a></p>
  </section>
{/if}

<style>
  .card {
    gap: 18px;
  }
  .cabeca {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .cabeca h2 {
    font-size: 1.0625rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .etiqueta {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    min-height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 650;
    background: var(--step);
    color: var(--muted);
    margin: 0;
  }
  .etiqueta.ok {
    background: var(--pos-soft);
    color: var(--pos);
  }
  .etiqueta.falha {
    background: var(--neg-soft);
    color: var(--neg);
  }
  .fatos {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    margin: 0;
  }
  .fatos div {
    background: var(--paper);
    padding: 14px 16px;
    border-radius: var(--r);
    display: grid;
    gap: 4px;
    min-width: 0;
    align-content: start;
  }
  .fatos .largo {
    grid-column: 1 / -1;
  }
  .fatos dt {
    font-size: var(--s-small);
    color: var(--muted);
  }
  .fatos dd {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .arquivo {
    font-size: 0.9375rem !important;
  }
  .erros {
    border-radius: var(--r);
    overflow: hidden;
  }
  .erros .row {
    background: var(--neg-soft);
    min-height: 0;
  }
  .erro-texto {
    white-space: normal;
    color: var(--neg);
    font-weight: 500;
  }

  /* Perigo: o cartão inteiro ganha o tom de aviso, e o botão é vermelho */
  .perigo-cartao {
    border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent);
  }
  .aviso-restauro {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: var(--warn-soft);
    color: var(--ink);
    padding: 14px 16px;
    border-radius: var(--r);
    max-width: 70ch;
    font-size: 0.9375rem;
    line-height: 1.5;
  }
  .aviso-restauro strong {
    color: var(--warn);
  }
  .fc {
    display: grid;
    gap: 16px;
  }
  .marcar {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-weight: 500;
    cursor: pointer;
    min-height: 44px;
  }
  .marcar input {
    width: 20px;
    height: 20px;
    margin-top: 2px;
    accent-color: var(--neg-fundo);
  }
  .acoes {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
</style>

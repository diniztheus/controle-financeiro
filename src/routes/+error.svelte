<script lang="ts">
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import SearchX from '@lucide/svelte/icons/search-x';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import { NAVEGACAO } from '$lib/ui/navegacao';

  // Só o código e o id do registro aparecem: detalhes internos ficam no console do servidor.
  const naoEncontrada = $derived(page.status === 404);
  const titulo = $derived(naoEncontrada ? 'Página não encontrada' : 'Algo deu errado');
  const id = $derived(page.error?.id);
</script>

<svelte:head>
  <title>Controle Financeiro · {titulo}</title>
</svelte:head>

<section class="sec pad caixa">
  <div class="cartao" class:erro={!naoEncontrada}>
    <IconeRedondo
      icone={naoEncontrada ? SearchX : CircleAlert}
      cor={naoEncontrada ? 'var(--orange)' : 'var(--neg)'}
      tamanho={64}
      suave
    />

    <div class="texto">
      <h1>{titulo}</h1>
      {#if naoEncontrada}
        <p>O endereço não existe ou foi removido. Confira o link ou volte ao painel.</p>
      {:else}
        <p>
          Não foi possível concluir esta tela. Os seus dados continuam guardados. Tente de novo; se
          o problema continuar, volte ao painel.
        </p>
      {/if}
    </div>

    <p class="codigo muted small" data-testid="codigo-erro">
      Código {page.status}{#if id && !naoEncontrada}&nbsp;· referência {id}{/if}
    </p>

    {#if naoEncontrada}
      <nav class="secoes" aria-label="Seções do site">
        <a class="btn go" href={resolve('/')}>Ir para o painel</a>
        <ul>
          {#each NAVEGACAO as item (item.href)}
            <li><a href={resolve(item.href as '/')}>{item.rotulo}</a></li>
          {/each}
          <li><a href={resolve('/backups')}>Backups</a></li>
          <li><a href={resolve('/configuracoes')}>Configurações</a></li>
        </ul>
      </nav>
    {:else}
      <div class="acoes">
        <button class="btn go" type="button" onclick={() => location.reload()}
          >Tentar de novo</button
        >
        <a class="btn" href={resolve('/')}>Ir para o painel</a>
      </div>
    {/if}
  </div>
</section>

<style>
  .caixa {
    padding-block: clamp(24px, 6vw, 64px);
    place-items: center;
  }
  .cartao {
    width: min(100%, 520px);
    background: var(--surface);
    border-radius: var(--r-card);
    box-shadow: var(--shadow);
    padding: clamp(24px, 4vw, 40px);
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 16px;
  }
  .texto {
    display: grid;
    gap: 8px;
  }
  .texto h1 {
    font-size: clamp(1.375rem, 1.1rem + 1vw, 1.75rem);
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .texto p {
    color: var(--muted);
    max-width: 44ch;
  }
  .codigo {
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--paper);
  }
  .secoes {
    display: grid;
    justify-items: center;
    gap: 16px;
    width: 100%;
  }
  .secoes ul {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .secoes ul a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 999px;
    background: var(--paper);
    color: var(--ink);
    font-weight: 600;
    font-size: 0.9375rem;
    text-decoration: none;
    transition: background-color var(--t);
  }
  .secoes ul a:hover {
    background: var(--step);
  }
  .acoes {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
  }
</style>

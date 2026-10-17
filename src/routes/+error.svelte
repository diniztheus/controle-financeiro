<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { NAVEGACAO } from '$lib/ui/navegacao';

  // Só o código e o id do registro aparecem: detalhes internos ficam no console do servidor.
  const naoEncontrada = $derived(page.status === 404);
  const titulo = $derived(naoEncontrada ? 'Página não encontrada' : 'Algo deu errado');
  const id = $derived(page.error?.id);
</script>

<svelte:head>
  <title>Controle Financeiro · {titulo}</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>{titulo}</h1>
    {#if naoEncontrada}
      <p>O endereço não existe ou foi removido. Confira o link ou volte ao painel.</p>
    {:else}
      <p>
        Não foi possível concluir esta tela. Os seus dados continuam guardados. Tente de novo; se o
        problema continuar, volte ao painel.
      </p>
    {/if}
  </div>
</header>

<section class="sec alt pad">
  <div class="col">
    <p class="muted small" data-testid="codigo-erro">
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
  .secoes ul {
    list-style: none;
    padding: 0;
    margin-top: 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px 24px;
  }
  .secoes ul a {
    color: var(--ink);
    font-weight: 600;
    text-underline-offset: 4px;
  }
  .acoes {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
</style>

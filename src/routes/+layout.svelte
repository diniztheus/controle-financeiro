<script lang="ts">
  import '@fontsource/geist/latin-400.css';
  import '@fontsource/geist/latin-500.css';
  import '@fontsource/geist/latin-600.css';
  import '@fontsource/geist/latin-700.css';
  import '$lib/ui/estilos.css';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { NAVEGACAO } from '$lib/ui/navegacao';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();
</script>

<a class="skip" href="#conteudo">Pular para o conteúdo</a>

<header class="bar pad">
  <a class="word" href={resolve('/')}>Controle Financeiro</a>
  <p class="sync" data-testid="indicador-banco">
    <i class="dot" class:ok={data.bancoConectado} class:warn={!data.bancoConectado}></i>
    <span>{data.bancoConectado ? 'Banco conectado' : 'Banco indisponível'}</span>
  </p>
  <nav class="nav" aria-label="Seções">
    {#each NAVEGACAO as item (item.href)}
      {#if item.onda === null}
        <!-- As rotas das próximas ondas ainda não existem; quando existirem, trocar por resolve(). -->
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a href={item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined}
          >{item.rotulo}</a
        >
      {:else}
        <span class="breve" aria-disabled="true" title="Chega na Onda {item.onda}"
          >{item.rotulo}<span class="sr">, em breve (Onda {item.onda})</span></span
        >
      {/if}
    {/each}
  </nav>
</header>

<main id="conteudo" tabindex="-1">
  {@render children()}
</main>

<style>
  .bar {
    position: sticky;
    top: env(safe-area-inset-top, 0px);
    z-index: var(--z-bar);
    background: var(--orange);
    color: var(--orange-ink);
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 4px 24px;
    padding-block: 12px;
  }
  .word {
    font-weight: 700;
    letter-spacing: -0.02em;
    font-size: 1.0625rem;
    color: inherit;
    text-decoration: none;
    white-space: nowrap;
  }
  .sync {
    font-weight: 500;
    font-size: var(--s-small);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .dot {
    width: 8px;
    height: 8px;
    background: currentColor;
    opacity: 0.5;
  }
  .dot.ok {
    background: #0f6b3c;
    opacity: 1;
  }
  .dot.warn {
    background: #7a2600;
    opacity: 1;
  }
  .nav {
    position: relative;
    min-width: 0;
    display: flex;
    gap: 22px;
    align-items: center;
  }
  .nav a,
  .breve {
    color: inherit;
    font-weight: 500;
    font-size: 0.9375rem;
    padding-block: 10px;
    white-space: nowrap;
  }
  .nav a {
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 6px;
    text-decoration-thickness: 2px;
    transition: text-decoration-color var(--t);
  }
  .nav a:hover,
  .nav a[aria-current='page'] {
    text-decoration-color: currentColor;
  }
  .nav a[aria-current='page'] {
    font-weight: 600;
  }
  .breve {
    position: relative;
    opacity: 0.5;
    cursor: default;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* Como na v3: no celular a barra fica só com o nome e o estado do banco. Hoje só existe o
     Painel; quando as próximas ondas trouxerem páginas, o celular ganha um menu próprio. */
  @media (max-width: 760px) {
    .bar {
      grid-template-columns: 1fr auto;
    }
    .nav {
      display: none;
    }
  }
</style>

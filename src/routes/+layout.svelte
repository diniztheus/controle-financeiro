<script lang="ts">
  import '@fontsource/geist/latin-400.css';
  import '@fontsource/geist/latin-500.css';
  import '@fontsource/geist/latin-600.css';
  import '@fontsource/geist/latin-700.css';
  import '$lib/ui/estilos.css';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { ativo, NAVEGACAO } from '$lib/ui/navegacao';
  import AvisoIntegridade from '$lib/ui/AvisoIntegridade.svelte';
  import Atalhos from '$lib/ui/Atalhos.svelte';
  import SairDoPin from '$lib/ui/SairDoPin.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();
  const caminho = $derived(page.url.pathname);
  const naTelaDeGastos = $derived(caminho === '/gastos');
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
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rotas fixas e existentes -->
        <a href={resolve(item.href as '/')} aria-current={ativo(item, caminho) ? 'page' : undefined}
          >{item.rotulo}</a
        >
      {:else}
        <span class="breve" aria-disabled="true" title="Em breve"
          >{item.rotulo}<span class="sr">, em breve</span></span
        >
      {/if}
    {/each}
  </nav>
  <a class="btn novo" href="{resolve('/gastos')}#novo">Novo gasto</a>
</header>

<AvisoIntegridade />

<main id="conteudo" tabindex="-1">
  {@render children()}
</main>

<footer class="foot pad">
  <p class="name">Controle Financeiro</p>
  <p>
    Tudo aqui é cadastrado à mão por você. Valores em reais, guardados num banco SQLite só neste
    computador.
  </p>
  <p class="foot-links">
    <a href={resolve('/lixeira')}>Lixeira</a>
    <a href={resolve('/backups')}>Backups</a>
    <a href={resolve('/configuracoes')}>Configurações</a>
    <a href={resolve('/sistema')}>Estado do sistema e backup</a>
  </p>
  <SairDoPin />
</footer>

<Atalhos />

{#if !naTelaDeGastos}
  <a class="fab" href="{resolve('/gastos')}#novo" aria-label="Novo gasto">+</a>
{/if}

<style>
  .bar {
    position: sticky;
    top: env(safe-area-inset-top, 0px);
    z-index: var(--z-bar);
    background: var(--surface);
    color: var(--ink);
    border-bottom: 1px solid var(--line);
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
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
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    background: currentColor;
    opacity: 0.5;
  }
  .dot.ok {
    background: var(--pos);
    opacity: 1;
  }
  .dot.warn {
    background: var(--neg);
    opacity: 1;
  }
  .nav {
    position: relative;
    min-width: 0;
    display: flex;
    gap: 22px;
    align-items: center;
    justify-content: flex-end;
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
  .nav a:hover {
    text-decoration-color: currentColor;
  }
  .nav a[aria-current='page'] {
    color: var(--orange);
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
  .novo {
    background: var(--orange);
    color: var(--orange-ink);
  }
  .novo:hover {
    background: color-mix(in srgb, var(--orange) 88%, #000 12%);
  }
  @media (max-width: 1100px) {
    .breve {
      display: none;
    }
  }
  /* No celular: nome e estado em cima, seções numa linha que rola de lado, "+" flutuante. */
  @media (max-width: 760px) {
    .bar {
      grid-template-columns: minmax(0, 1fr) auto;
      padding-bottom: 0;
    }
    .nav {
      grid-column: 1 / -1;
      justify-content: flex-start;
      overflow-x: auto;
      scrollbar-width: none;
      margin-inline: calc(-1 * var(--gut));
      padding-inline: var(--gut);
      gap: 20px;
    }
    .novo {
      display: none;
    }
  }

  .foot {
    padding-block: 56px 120px;
    display: grid;
    gap: 14px;
  }
  .foot .name {
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }
  .foot p:not(.name) {
    color: var(--muted);
    max-width: 70ch;
  }
  .foot-links {
    display: flex;
    gap: 8px 24px;
    flex-wrap: wrap;
  }
  .foot-links a {
    color: var(--ink);
    font-weight: 600;
    text-underline-offset: 4px;
  }

  .fab {
    position: fixed;
    right: 16px;
    bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--orange);
    color: var(--orange-ink);
    display: none;
    place-items: center;
    font-size: 2rem;
    text-decoration: none;
    z-index: var(--z-fab);
    /* O botão flutua sobre a página: a sombra separa do conteúdo. */
    /* Sem sombra: um contorno grosso na cor do papel separa o botão do que passa por baixo. */
    outline: 3px solid var(--paper);
    transition: transform var(--t);
  }
  .fab:active {
    transform: scale(0.94);
  }
  @media (max-width: 760px) {
    .fab {
      display: grid;
    }
  }
</style>

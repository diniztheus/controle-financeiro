<script lang="ts">
  import '@fontsource/geist/latin-400.css';
  import '@fontsource/geist/latin-500.css';
  import '@fontsource/geist/latin-600.css';
  import '@fontsource/geist/latin-700.css';
  import '$lib/ui/estilos.css';
  import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import Plus from '@lucide/svelte/icons/plus';
  import Search from '@lucide/svelte/icons/search';
  import Wallet from '@lucide/svelte/icons/wallet';
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { ABAS, ativo, FERRAMENTAS, NAVEGACAO } from '$lib/ui/navegacao';
  import { aplicarOcultar, lerOcultar } from '$lib/ui/privacidade';
  import AvisoIntegridade from '$lib/ui/AvisoIntegridade.svelte';
  import Atalhos from '$lib/ui/Atalhos.svelte';
  import SairDoPin from '$lib/ui/SairDoPin.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();
  const caminho = $derived(page.url.pathname);
  /** "Mais" fica marcado quando a tela atual não é uma das abas. */
  const naAbaMais = $derived(!ABAS.some((a) => ativo(a, caminho)));

  let ocultar = $state(false);
  let menuNovo: HTMLDetailsElement | undefined = $state();
  onMount(() => (ocultar = lerOcultar()));

  function alternarOcultar() {
    ocultar = !ocultar;
    aplicarOcultar(ocultar);
  }

  // Ao trocar de tela, fecha o menu "Novo" e as folhas do celular.
  afterNavigate(() => {
    if (menuNovo) menuNovo.open = false;
    for (const folha of document.querySelectorAll<HTMLElement>('[popover]:popover-open'))
      folha.hidePopover();
  });
</script>

<a class="skip" href="#conteudo">Pular para o conteúdo</a>

{#snippet olho(classe: string)}
  <button
    class={classe}
    type="button"
    aria-pressed={ocultar}
    onclick={alternarOcultar}
    title={ocultar ? 'Mostrar valores' : 'Esconder valores'}
  >
    {#if ocultar}<EyeOff size={20} />{:else}<Eye size={20} />{/if}
    <span class={classe === 'olho-lado' ? '' : 'sr'}>
      {ocultar ? 'Mostrar valores' : 'Esconder valores'}
    </span>
  </button>
{/snippet}

<div class="app">
  <aside class="lateral">
    <a class="marca" href={resolve('/')}>
      <span class="logo" aria-hidden="true"><Wallet size={20} strokeWidth={2.2} /></span>
      Controle Financeiro
    </a>

    <details class="novo" bind:this={menuNovo}>
      <summary class="btn go"><Plus size={20} strokeWidth={2.4} /> Novo</summary>
      <div class="novo-menu">
        <a href="{resolve('/gastos')}#novo">
          <span class="ico gasto"><ArrowDownRight size={18} /></span> Novo gasto
        </a>
        <a href="{resolve('/receitas')}#nova">
          <span class="ico receita"><ArrowUpRight size={18} /></span> Nova receita
        </a>
      </div>
    </details>

    <nav class="menu" aria-label="Seções">
      {#each NAVEGACAO as item (item.href)}
        {@const Icone = item.icone}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rotas fixas e existentes -->
        <a href={resolve(item.href)} aria-current={ativo(item, caminho) ? 'page' : undefined}>
          <Icone size={20} />
          {item.rotulo}
        </a>
      {/each}
    </nav>

    <nav class="menu ferramentas" aria-label="Ferramentas">
      {#each FERRAMENTAS as item (item.href)}
        {@const Icone = item.icone}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rotas fixas e existentes -->
        <a href={resolve(item.href)} aria-current={ativo(item, caminho) ? 'page' : undefined}>
          <Icone size={18} />
          {item.rotulo}
        </a>
      {/each}
    </nav>

    <div class="lateral-pe">
      {@render olho('olho-lado')}
      <p class="sync" data-testid="indicador-banco">
        <i class="dot" class:ok={data.bancoConectado} class:warn={!data.bancoConectado}></i>
        <span>{data.bancoConectado ? 'Banco conectado' : 'Banco indisponível'}</span>
      </p>
      <SairDoPin />
    </div>
  </aside>

  <header class="topo">
    <a class="marca" href={resolve('/')}>
      <span class="logo" aria-hidden="true"><Wallet size={18} strokeWidth={2.2} /></span>
      Finanças
    </a>
    <div class="topo-acoes">
      <a class="redondo" href={resolve('/busca')} title="Buscar">
        <Search size={20} /><span class="sr">Buscar</span>
      </a>
      {@render olho('redondo')}
    </div>
  </header>

  <div class="principal">
    <AvisoIntegridade />
    <main id="conteudo" tabindex="-1">
      {@render children()}
    </main>
    <footer class="pe pad">
      <p>Tudo aqui é cadastrado por você e fica guardado só neste computador.</p>
    </footer>
  </div>
</div>

<nav class="abas" aria-label="Seções">
  {#each ABAS.slice(0, 2) as item (item.href)}
    {@const Icone = item.icone}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rotas fixas e existentes -->
    <a href={resolve(item.href)} aria-current={ativo(item, caminho) ? 'page' : undefined}>
      <Icone size={22} />
      <span>{item.rotulo === 'Painel' ? 'Início' : item.rotulo}</span>
    </a>
  {/each}
  <button class="mais-novo" type="button" popovertarget="folha-novo">
    <Plus size={28} strokeWidth={2.4} /><span class="sr">Novo lançamento</span>
  </button>
  {#each ABAS.slice(2) as item (item.href)}
    {@const Icone = item.icone}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rotas fixas e existentes -->
    <a href={resolve(item.href)} aria-current={ativo(item, caminho) ? 'page' : undefined}>
      <Icone size={22} />
      <span>{item.rotulo}</span>
    </a>
  {/each}
  <button type="button" popovertarget="folha-mais" aria-current={naAbaMais ? 'page' : undefined}>
    <Ellipsis size={22} />
    <span>Mais</span>
  </button>
</nav>

<div class="folha" id="folha-novo" popover>
  <p class="folha-titulo">Novo lançamento</p>
  <div class="folha-novo">
    <a href="{resolve('/gastos')}#novo">
      <span class="ico gasto grande"><ArrowDownRight size={24} /></span> Novo gasto
    </a>
    <a href="{resolve('/receitas')}#nova">
      <span class="ico receita grande"><ArrowUpRight size={24} /></span> Nova receita
    </a>
  </div>
  <button class="btn" type="button" popovertarget="folha-novo" popovertargetaction="hide"
    >Fechar</button
  >
</div>

<div class="folha" id="folha-mais" popover>
  <p class="folha-titulo">Mais</p>
  <ul class="folha-grade">
    {#each [...NAVEGACAO.slice(3), ...FERRAMENTAS] as item (item.href)}
      {@const Icone = item.icone}
      <li>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rotas fixas e existentes -->
        <a href={resolve(item.href)} aria-current={ativo(item, caminho) ? 'page' : undefined}>
          <span class="ico"><Icone size={22} /></span>
          {item.rotulo}
        </a>
      </li>
    {/each}
  </ul>
  <SairDoPin />
  <button class="btn" type="button" popovertarget="folha-mais" popovertargetaction="hide"
    >Fechar</button
  >
</div>

<Atalhos />

<style>
  /* Computador: menu lateral fixo à esquerda. Celular: barra no topo e abas embaixo. */
  .app {
    display: grid;
    grid-template-columns: var(--lateral) minmax(0, 1fr);
    min-height: 100dvh;
    /* A coluna do menu continua branca até o fim da página, mesmo rolando. */
    background: linear-gradient(to right, var(--surface) var(--lateral), transparent 0);
  }
  .lateral {
    position: sticky;
    top: 0;
    height: 100dvh;
    overflow-y: auto;
    background: var(--surface);
    border-right: 1px solid var(--line);
    padding: 20px 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    z-index: var(--z-bar);
  }
  .marca {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-size: 1.0625rem;
    color: var(--ink);
    text-decoration: none;
    padding-inline: 8px;
  }
  .logo {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: var(--orange);
    color: var(--orange-ink);
    flex: none;
  }

  .novo summary {
    list-style: none;
    width: 100%;
    border-radius: 14px;
    min-height: 46px;
  }
  .novo summary::-webkit-details-marker {
    display: none;
  }
  .novo-menu {
    display: grid;
    gap: 2px;
    margin-top: 6px;
    padding: 6px;
    border-radius: 14px;
    background: var(--surface);
    box-shadow: var(--shadow-up);
  }
  .novo-menu a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    color: var(--ink);
    font-weight: 600;
    font-size: 0.9375rem;
    text-decoration: none;
  }
  .novo-menu a:hover {
    background: var(--paper);
  }
  .ico {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    background: var(--orange-soft);
    color: var(--orange);
  }
  .ico.gasto {
    background: var(--neg-soft);
    color: var(--neg);
  }
  .ico.receita {
    background: var(--pos-soft);
    color: var(--pos);
  }
  .ico.grande {
    width: 48px;
    height: 48px;
  }

  .menu {
    display: grid;
    gap: 2px;
  }
  .menu a {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 42px;
    padding: 0 12px;
    border-radius: 10px;
    color: var(--muted);
    font-weight: 550;
    font-size: 0.9375rem;
    text-decoration: none;
    transition:
      background-color var(--t),
      color var(--t);
  }
  .menu a:hover {
    background: var(--paper);
    color: var(--ink);
  }
  .menu a[aria-current='page'] {
    background: var(--orange-soft);
    color: var(--orange);
    font-weight: 650;
  }
  .ferramentas {
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .ferramentas a {
    min-height: 38px;
    font-size: 0.875rem;
  }
  .lateral-pe {
    display: grid;
    gap: 8px;
    padding-inline: 12px;
    font-size: var(--s-small);
    color: var(--muted);
  }
  .lateral-pe :global(.olho-lado) {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-weight: 550;
    font-size: 0.875rem;
  }
  .lateral-pe :global(.olho-lado:hover) {
    color: var(--ink);
  }
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
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

  .principal {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  main {
    flex: 1;
  }
  .pe {
    padding-block: 24px 32px;
    color: var(--muted);
    font-size: var(--s-small);
  }

  .topo,
  .abas {
    display: none;
  }

  @media (max-width: 860px) {
    .app {
      grid-template-columns: minmax(0, 1fr);
      background: none;
    }
    .lateral {
      display: none;
    }
    .topo {
      position: sticky;
      top: 0;
      z-index: var(--z-bar);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: calc(10px + env(safe-area-inset-top, 0px)) var(--gut) 10px;
      background: color-mix(in srgb, var(--paper) 88%, transparent);
      backdrop-filter: blur(12px);
    }
    .topo .marca {
      padding: 0;
    }
    .topo .logo {
      width: 30px;
      height: 30px;
      border-radius: 9px;
    }
    .topo-acoes {
      display: flex;
      gap: 6px;
    }
    .topo-acoes :global(.redondo) {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 0;
      display: grid;
      place-items: center;
      background: var(--surface);
      box-shadow: var(--shadow);
      color: var(--ink);
    }
    .pe {
      padding-bottom: calc(var(--abas) + 32px + env(safe-area-inset-bottom, 0px));
    }

    .abas {
      position: fixed;
      inset: auto 0 0;
      z-index: var(--z-fab);
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      align-items: center;
      height: calc(var(--abas) + env(safe-area-inset-bottom, 0px));
      padding-bottom: env(safe-area-inset-bottom, 0px);
      background: var(--surface);
      border-top: 1px solid var(--line);
    }
    .abas > a,
    .abas > button:not(.mais-novo) {
      height: 100%;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 2px;
      border: 0;
      background: none;
      color: var(--muted);
      font-size: 0.6875rem;
      font-weight: 600;
      text-decoration: none;
    }
    .abas [aria-current='page'] {
      color: var(--orange) !important;
    }
    .mais-novo {
      justify-self: center;
      width: 56px;
      height: 56px;
      margin-top: -22px;
      border-radius: 50%;
      border: 4px solid var(--paper);
      display: grid;
      place-items: center;
      background: var(--orange);
      color: var(--orange-ink);
      box-shadow: var(--shadow-up);
      transition: transform var(--t);
    }
    .mais-novo:active {
      transform: scale(0.94);
    }
  }

  /* Folhas do celular (popover nativo: fecham tocando fora ou com Esc) */
  .folha {
    position: fixed;
    inset: auto 0 0;
    margin: 0;
    width: 100%;
    max-width: 560px;
    margin-inline: auto;
    border: 0;
    border-radius: 24px 24px 0 0;
    padding: 20px var(--gut) calc(20px + env(safe-area-inset-bottom, 0px));
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-up);
    gap: 16px;
  }
  .folha:popover-open {
    display: grid;
  }
  .folha::backdrop {
    background: rgb(10 12 18 / 0.45);
  }
  .folha-titulo {
    font-weight: 700;
    font-size: 1.125rem;
  }
  .folha-novo {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .folha-novo a {
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 18px 8px;
    border-radius: 16px;
    background: var(--paper);
    color: var(--ink);
    font-weight: 650;
    text-decoration: none;
  }
  .folha-grade {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .folha-grade a {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 8px;
    padding: 14px 4px;
    border-radius: 16px;
    color: var(--ink);
    font-size: 0.8125rem;
    font-weight: 600;
    text-decoration: none;
  }
  .folha-grade a:hover,
  .folha-grade a[aria-current='page'] {
    background: var(--paper);
  }
  .folha-grade .ico {
    width: 46px;
    height: 46px;
  }
  @media (prefers-reduced-motion: no-preference) {
    .folha:popover-open {
      animation: subir 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes subir {
      from {
        transform: translateY(40px);
        opacity: 0;
      }
    }
  }
</style>

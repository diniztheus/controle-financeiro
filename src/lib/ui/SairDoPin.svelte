<script lang="ts">
  /** Botão "Sair" do rodapé, só com PIN ativo: apaga a sessão deste navegador. */
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
</script>

{#if page.data.pinAtivo}
  <form class="sair" method="POST" action="/pin?/sair" use:enhance>
    <button class="link" type="submit">Sair</button>
  </form>
{/if}

<style>
  .sair {
    display: block;
    margin: 0;
  }
  .link {
    width: 100%;
    min-height: 44px;
    padding: 0 14px;
    border: 0;
    border-radius: var(--r);
    background: var(--step);
    font: inherit;
    font-weight: 600;
    color: var(--ink);
    cursor: pointer;
    transition: background-color var(--t);
  }
  .link:hover {
    background: color-mix(in srgb, var(--step) 82%, var(--ink) 18%);
  }
  .link:focus-visible {
    outline: 2px solid var(--orange);
    outline-offset: 3px;
  }
</style>

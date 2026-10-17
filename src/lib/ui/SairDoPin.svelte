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
    display: inline;
    margin: 0;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 4px;
    cursor: pointer;
  }
  .link:focus-visible {
    outline: 2px solid var(--orange);
    outline-offset: 3px;
  }
</style>

<script lang="ts">
  /**
   * Faixa no topo quando a última verificação de integridade do banco encontrou problemas.
   * Sem verificação ainda (null) ou com tudo ok, não aparece nada.
   */
  import { resolve } from '$app/paths';
  import { page } from '$app/state';

  const problemas = $derived(page.data.integridade?.ok === false);
</script>

{#if problemas}
  <div class="faixa" role="alert" data-testid="aviso-integridade">
    <p>
      O banco apresentou problemas na última verificação. Faça um backup agora e considere restaurar
      um backup. <a href={resolve('/backups')}>Ver backups</a>
    </p>
  </div>
{/if}

<style>
  .faixa {
    background: var(--orange-soft);
    color: var(--ink);
    border-bottom: 2px solid var(--orange);
    padding: 12px 16px;
  }
  .faixa p {
    margin: 0 auto;
    max-width: 1200px;
    font-size: 0.9375rem;
    font-weight: 600;
  }
  .faixa a {
    color: var(--ink);
    text-decoration-thickness: 2px;
  }
</style>

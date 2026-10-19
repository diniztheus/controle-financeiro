<script lang="ts">
  /**
   * Faixa no topo quando a última verificação de integridade do banco encontrou problemas.
   * Sem verificação ainda (null) ou com tudo ok, não aparece nada.
   */
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';

  const problemas = $derived(page.data.integridade?.ok === false);
</script>

{#if problemas}
  <div class="pad lugar">
    <div class="faixa" role="alert" data-testid="aviso-integridade">
      <span class="icone" aria-hidden="true"><TriangleAlert size={20} strokeWidth={2.2} /></span>
      <p>
        O banco apresentou problemas na última verificação. Faça um backup agora e considere
        restaurar um backup. <a href={resolve('/backups')}>Ver backups</a>
      </p>
    </div>
  </div>
{/if}

<style>
  .lugar {
    padding-top: 16px;
  }
  .faixa {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: var(--neg-soft);
    color: var(--ink);
    border-radius: var(--r-card);
    padding: 14px 16px;
  }
  .icone {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    background: var(--surface);
    color: var(--neg);
  }
  .faixa p {
    margin: 0;
    padding-top: 6px;
    font-size: 0.9375rem;
    font-weight: 500;
    min-width: 0;
  }
  .faixa a {
    color: var(--neg);
    font-weight: 650;
    text-underline-offset: 3px;
  }
</style>

<script lang="ts">
  /**
   * "Mandar para a lixeira" em dois passos. Sem JavaScript o formulário envia direto; com ele,
   * o primeiro clique pergunta, o foco vai para a confirmação e volta ao botão ao cancelar.
   */
  import Trash2 from '@lucide/svelte/icons/trash';
  import { enhance } from '$app/forms';
  import { tick } from 'svelte';

  interface Props {
    acao?: string;
    rotulo?: string;
    confirmar?: string;
  }
  let {
    acao = '?/remover',
    rotulo = 'Mandar para a lixeira',
    confirmar = 'Sim, mandar para a lixeira',
  }: Props = $props();

  let perguntando = $state(false);
  let botaoInicial: HTMLButtonElement | undefined = $state();
  let botaoSim: HTMLButtonElement | undefined = $state();

  async function perguntar(e: SubmitEvent) {
    e.preventDefault();
    perguntando = true;
    await tick();
    botaoSim?.focus();
  }
  async function cancelar() {
    perguntando = false;
    await tick();
    botaoInicial?.focus();
  }
</script>

{#if perguntando}
  <form method="POST" action={acao} use:enhance class="acts" role="group" aria-label="Confirmar">
    <button class="btn perigo" type="submit" bind:this={botaoSim}>{confirmar}</button>
    <button class="btn" type="button" onclick={cancelar}>Cancelar</button>
  </form>
{:else}
  <form method="POST" action={acao} onsubmit={perguntar}>
    <button class="btn remover-inicial" type="submit" bind:this={botaoInicial}
      ><Trash2 size={18} aria-hidden="true" />{rotulo}</button
    >
  </form>
{/if}

<style>
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  /* Primeiro passo: vermelho suave, para sinalizar saída sem ser o botão de confirmar */
  button.remover-inicial {
    background: var(--neg-soft);
    color: var(--neg);
    font-weight: 650;
  }
  button.remover-inicial:hover {
    background: color-mix(in srgb, var(--neg-soft) 80%, var(--neg) 20%);
  }
</style>

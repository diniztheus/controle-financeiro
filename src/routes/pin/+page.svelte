<script lang="ts">
  import { onMount } from 'svelte';
  import { ariaErro } from '$lib/ui/formularios';
  import type { PageProps } from './$types';

  interface RespostaEntrar {
    erros?: { pin?: string };
    erro?: string;
    voltar?: string;
  }
  let { data, form }: PageProps = $props();
  const resposta = $derived(form as RespostaEntrar | null | undefined);
  const erro = $derived(resposta?.erros?.pin ?? resposta?.erro ?? null);
  // Depois de uma falha a URL é /pin?/entrar (sem voltar): o destino vem da própria resposta.
  const voltar = $derived(resposta?.voltar ?? data.voltar);
  // Foco no PIN ao abrir a tela (em vez de autofocus, que o lint de acessibilidade recusa).
  let campoPin: HTMLInputElement | undefined = $state();
  onMount(() => campoPin?.focus());
</script>

<svelte:head>
  <title>Controle Financeiro · PIN</title>
</svelte:head>

<section class="sec pad cartao-pin">
  <div class="cartao">
    <h1>Controle Financeiro</h1>
    <p class="muted">Digite o PIN para abrir o site.</p>

    <form class="fc" method="POST" action="?/entrar" autocomplete="off">
      <input type="hidden" name="voltar" value={voltar} />
      <div class="field">
        <label for="pin">PIN</label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputmode="numeric"
          autocomplete="current-password"
          required
          bind:this={campoPin}
          maxlength="12"
          class="num"
          {...ariaErro(erro ?? undefined, 'pin')}
        />
        {#if erro}<span class="err" id="pin-erro" role="alert">{erro}</span>{/if}
      </div>
      <label class="lembrar">
        <input type="checkbox" name="lembrar" value="1" />
        <span>Manter conectado por 30 dias</span>
      </label>
      <div><button class="btn ink" type="submit">Entrar</button></div>
    </form>
  </div>
</section>

<style>
  .cartao-pin {
    min-height: 70vh;
    place-content: center;
  }
  .cartao {
    width: min(100%, 380px);
    margin-inline: auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: calc(var(--r) * 1.5);
    padding: clamp(24px, 4vw, 36px);
    display: grid;
    gap: 16px;
  }
  .cartao h1 {
    font-size: var(--s-lead);
    letter-spacing: -0.02em;
  }
  .cartao p {
    margin: 0;
  }
  .fc {
    display: grid;
    gap: 18px;
  }
  .lembrar {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }
  .lembrar input {
    width: 18px;
    height: 18px;
    accent-color: var(--orange);
  }
  .btn {
    min-height: 44px;
  }
</style>

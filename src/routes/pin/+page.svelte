<script lang="ts">
  import Wallet from '@lucide/svelte/icons/wallet';
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
    <span class="logo" aria-hidden="true"><Wallet size={30} strokeWidth={2.2} /></span>
    <div class="topo">
      <h1>Controle Financeiro</h1>
      <p class="muted">Digite o PIN para abrir o site.</p>
    </div>

    <form class="fc" method="POST" action="?/entrar" autocomplete="off">
      <input type="hidden" name="voltar" value={voltar} />
      <div class="field big">
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
      <button class="btn go entrar" type="submit">Entrar</button>
    </form>
  </div>
</section>

<style>
  .cartao-pin {
    min-height: 80vh;
    place-content: center;
  }
  .cartao {
    width: min(100%, 400px);
    margin-inline: auto;
    background: var(--surface);
    border-radius: var(--r-card);
    box-shadow: var(--shadow-up);
    padding: clamp(28px, 5vw, 40px);
    display: grid;
    gap: 20px;
    justify-items: stretch;
    text-align: center;
  }
  .logo {
    width: 60px;
    height: 60px;
    margin-inline: auto;
    border-radius: 16px;
    display: grid;
    place-items: center;
    background: var(--orange);
    color: var(--orange-ink);
  }
  .topo {
    display: grid;
    gap: 6px;
  }
  .cartao h1 {
    font-size: var(--s-lead);
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .cartao p {
    margin: 0;
  }
  .fc {
    display: grid;
    gap: 20px;
  }
  /* PIN grande e espaçado: os dígitos ficam no centro do campo */
  .fc .field {
    text-align: left;
  }
  .fc .field input {
    text-align: center;
    letter-spacing: 0.35em;
    padding-left: calc(14px + 0.35em);
  }
  .fc .field label {
    text-align: center;
  }
  .lembrar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 44px;
    cursor: pointer;
    font-weight: 500;
  }
  .lembrar input {
    width: 18px;
    height: 18px;
    accent-color: var(--orange);
  }
  .entrar {
    width: 100%;
  }
</style>

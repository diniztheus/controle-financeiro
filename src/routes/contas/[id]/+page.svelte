<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { ROTULO_TIPO, TIPOS_CONTA } from '$lib/dominio/contas';
  import { centavosParaCampo, formatarBRL } from '$lib/dominio/dinheiro';
  import Valor from '$lib/ui/Valor.svelte';
  import { dataDeIso } from '$lib/ui/formato';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const c = $derived(data.conta);
  const erro = $derived(form?.acao === 'salvar' && !('ok' in form) ? form : null);
  let confirmar = $state(false);
</script>

<svelte:head>
  <title>Controle Financeiro · {c.nome}</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>{c.nome}</h1>
    <p>{ROTULO_TIPO[c.tipo]}</p>
    <p class="voltar-l"><a class="voltar" href={resolve('/contas')}>‹ Voltar às contas</a></p>
  </div>
  <p class="saldo" class:neg={c.saldoCentavos < 0}><Valor centavos={c.saldoCentavos} /></p>
</header>

<section class="sec alt pad grade">
  <div class="painel-form">
    <h2>Editar</h2>
    <form
      class="fc"
      method="POST"
      action="?/salvar"
      use:enhance={() =>
        async ({ update }) =>
          update({ reset: false })}
    >
      <div class="field">
        <label for="e-nome">Nome</label>
        <input
          id="e-nome"
          name="nome"
          maxlength="60"
          required
          value={erro?.valores?.nome ?? c.nome}
        />
        {#if erro?.erros?.nome}<span class="err">{erro.erros.nome}</span>{/if}
      </div>
      <div class="field">
        <label for="e-tipo">Tipo</label>
        <select id="e-tipo" name="tipo" value={erro?.valores?.tipo ?? c.tipo}>
          {#each TIPOS_CONTA as t (t)}
            <option value={t}>{ROTULO_TIPO[t]}</option>
          {/each}
        </select>
      </div>
      <div class="field big">
        <label for="e-saldo">Saldo (R$)</label>
        <input
          id="e-saldo"
          name="saldo"
          inputmode="decimal"
          required
          value={erro?.valores?.saldo ?? centavosParaCampo(c.saldoCentavos)}
        />
        {#if erro?.erros?.saldo}<span class="err">{erro.erros.saldo}</span>{/if}
        <span class="hint">Se o saldo mudar, o anterior fica no histórico ao lado.</span>
      </div>
      {#if erro?.erro}<p class="err" role="alert">{erro.erro}</p>{/if}
      <div><button class="btn ink" type="submit">Salvar</button></div>
      {#if form?.acao === 'salvar' && 'ok' in form}<p class="ok-msg" role="status">
          {form.ok}
        </p>{/if}
    </form>
  </div>

  <div class="col">
    <div class="col-head"><h2 class="h">Histórico de saldos</h2></div>
    <ul class="rows" data-testid="historico">
      {#each data.historico as h (h.id)}
        <li class="row">
          <span class="sq" style="--cc: var(--ink)"></span>
          <span class="row-main"
            ><span class="row-title num">{dataDeIso(h.registradoEm)}</span></span
          >
          <span class="row-val num" class:neg={h.saldoCentavos < 0}
            >{formatarBRL(h.saldoCentavos)}</span
          >
        </li>
      {/each}
    </ul>
    <p class="note">
      Os últimos {data.historico.length} registros. É daqui que sai a evolução do patrimônio.
    </p>

    <div class="remover">
      <h2 class="h">Remover conta</h2>
      <p class="note">
        A conta vai para a lixeira e sai do patrimônio. Gastos ligados a ela continuam lançados.
      </p>
      {#if confirmar}
        <form method="POST" action="?/remover" use:enhance class="acts">
          <button class="btn perigo" type="submit">Sim, mandar para a lixeira</button>
          <button class="btn" type="button" onclick={() => (confirmar = false)}>Cancelar</button>
        </form>
      {:else}
        <form
          method="POST"
          action="?/remover"
          onsubmit={(e) => {
            e.preventDefault();
            confirmar = true;
          }}
        >
          <button class="btn" type="submit">Mandar para a lixeira</button>
        </form>
      {/if}
      {#if form?.acao === 'remover' && form.erro}<p class="err" role="alert">{form.erro}</p>{/if}
    </div>
  </div>
</section>

<style>
  .saldo {
    font-size: clamp(2rem, 1.2rem + 3vw, 3.5rem);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .neg {
    color: var(--neg);
  }
  .grade {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 48px 64px;
    align-items: start;
    padding-block: clamp(32px, 5vw, 64px) clamp(64px, 10vw, 144px);
  }
  @media (max-width: 900px) {
    .grade {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .fc {
    display: grid;
    gap: 16px;
  }
  .h {
    font-size: var(--s-lead);
  }
  .remover {
    display: grid;
    gap: 12px;
    margin-top: 32px;
  }
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>

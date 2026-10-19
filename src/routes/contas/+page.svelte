<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { ROTULO_TIPO, TIPOS_CONTA } from '$lib/dominio/contas';
  import { centavosParaCampo } from '$lib/dominio/dinheiro';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import Valor from '$lib/ui/Valor.svelte';
  import { ICONE_CONTA } from '$lib/ui/icones';
  import { dataDeIso, plural } from '$lib/ui/formato';
  import { ariaErro } from '$lib/ui/formularios';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const erroCriar = $derived(form?.acao === 'criar' && !('ok' in form) ? form : null);
  const resumoContas = $derived(
    plural(data.total.quantidade, 'conta', 'contas') +
      (data.total.saldoAtualizadoEm
        ? ` · último saldo informado em ${dataDeIso(data.total.saldoAtualizadoEm)}`
        : ''),
  );
  const okCriar = $derived(form?.acao === 'criar' && 'ok' in form ? form.ok : null);
</script>

<svelte:head>
  <title>Controle Financeiro · Contas</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Contas</h1>
    <p>
      Saldos informados por você, como estão no banco hoje. Gastos lançados não mexem neles; cada
      atualização fica guardada no histórico.
    </p>
  </div>
  <div class="destaque">
    <p class="destaque-rot">Total em contas</p>
    <p class="destaque-val"><Valor centavos={data.total.totalCentavos} testid="total-contas" /></p>
    <p class="destaque-nota">{resumoContas}</p>
  </div>
</header>

<section class="sec alt pad grade">
  <div class="col">
    {#if data.contas.length}
      <ul class="rows contas" data-testid="lista-contas">
        {#each data.contas as c, i (c.id)}
          {@const erroLinha =
            form?.id === c.id && (form.acao === 'saldo' || form.acao === 'mover') && !('ok' in form)
              ? form
              : null}
          <li class="conta">
            <div class="conta-top">
              <IconeRedondo icone={ICONE_CONTA[c.tipo]} cor="var(--orange)" suave />
              <div class="conta-id">
                <a class="conta-nome" href={resolve('/contas/[id]', { id: c.id })}>{c.nome}</a>
                <span class="muted small">{ROTULO_TIPO[c.tipo]}</span>
              </div>
              <p class="conta-saldo num" class:neg={c.saldoCentavos < 0}>
                <Valor centavos={c.saldoCentavos} />
              </p>
            </div>
            <div class="conta-acts">
              <form class="saldo" method="POST" action="?/saldo" use:enhance>
                <input type="hidden" name="id" value={c.id} />
                <label class="sr" for="saldo-{c.id}">Novo saldo de {c.nome}</label>
                <input
                  class="inp num"
                  id="saldo-{c.id}"
                  name="saldo"
                  inputmode="decimal"
                  placeholder="Saldo de hoje"
                  value={erroLinha?.valores?.saldo ?? centavosParaCampo(c.saldoCentavos)}
                  {...ariaErro(erroLinha?.erros?.saldo ?? erroLinha?.erro, `saldo-${c.id}`)}
                />
                <button class="btn ink" type="submit">Atualizar saldo</button>
              </form>
              <form class="ordem" method="POST" action="?/mover" use:enhance>
                <input type="hidden" name="id" value={c.id} />
                <button
                  class="btn sm"
                  name="direcao"
                  value="subir"
                  disabled={i === 0}
                  aria-label="Subir {c.nome}">↑</button
                >
                <button
                  class="btn sm"
                  name="direcao"
                  value="descer"
                  disabled={i === data.contas.length - 1}
                  aria-label="Descer {c.nome}">↓</button
                >
                <a class="btn sm" href={resolve('/contas/[id]', { id: c.id })}>Editar</a>
              </form>
            </div>
            {#if erroLinha}
              <p class="err" role="alert" id="saldo-{c.id}-erro">
                {erroLinha.erros?.saldo ?? erroLinha.erro}
              </p>
            {:else if form?.acao === 'saldo' && form.id === c.id && 'ok' in form}
              <p class="ok-msg" role="status">{form.ok}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty">
        <strong>Nenhuma conta ainda</strong>
        <span>Cadastre ao lado a primeira, com o saldo de hoje.</span>
      </div>
    {/if}
    <p class="note">
      Contas removidas ficam na <a href={resolve('/lixeira')}>lixeira</a>.
    </p>
  </div>

  <div class="painel-form">
    <h2>Nova conta</h2>
    <form class="fc" method="POST" action="?/criar" use:enhance autocomplete="off">
      <div class="field">
        <label for="c-nome">Nome</label>
        <input
          id="c-nome"
          name="nome"
          maxlength="60"
          required
          placeholder="Ex.: Nubank, Carteira"
          value={erroCriar?.valores?.nome ?? ''}
          {...ariaErro(erroCriar?.erros?.nome, 'c-nome')}
        />
        {#if erroCriar?.erros?.nome}<span class="err" id="c-nome-erro">{erroCriar.erros.nome}</span
          >{/if}
      </div>
      <div class="field">
        <label for="c-tipo">Tipo</label>
        <select id="c-tipo" name="tipo" value={erroCriar?.valores?.tipo ?? 'corrente'}>
          {#each TIPOS_CONTA as t (t)}
            <option value={t}>{ROTULO_TIPO[t]}</option>
          {/each}
        </select>
      </div>
      <div class="field big">
        <label for="c-saldo">Saldo de hoje (R$)</label>
        <input
          id="c-saldo"
          name="saldo"
          inputmode="decimal"
          placeholder="0,00"
          required
          value={erroCriar?.valores?.saldo ?? ''}
          {...ariaErro(erroCriar?.erros?.saldo, 'c-saldo')}
        />
        {#if erroCriar?.erros?.saldo}<span class="err" id="c-saldo-erro"
            >{erroCriar.erros.saldo}</span
          >{/if}
        <span class="hint">Pode ser negativo, por exemplo -150,00 no cheque especial.</span>
      </div>
      {#if erroCriar?.erro}<p class="err" role="alert">{erroCriar.erro}</p>{/if}
      <div><button class="btn ink" type="submit">Cadastrar conta</button></div>
      {#if okCriar}<p class="ok-msg" role="status">{okCriar}</p>{/if}
    </form>
  </div>
</section>

<style>
  .destaque {
    background: var(--hero);
    color: var(--hero-ink);
    border-radius: var(--r-card);
    box-shadow: var(--shadow);
    padding: clamp(18px, 2.4vw, 24px) clamp(18px, 2.4vw, 26px);
    display: grid;
    gap: 6px;
    min-width: min(100%, 280px);
  }
  .page-head {
    align-items: center;
  }
  @media (max-width: 700px) {
    .destaque {
      flex-basis: 100%;
    }
  }
  .destaque-rot {
    color: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    opacity: 0.85;
  }
  .destaque-val {
    color: inherit;
    font-size: clamp(2rem, 1.2rem + 3vw, 3.25rem);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .destaque-nota {
    color: inherit;
    font-size: 0.8125rem;
    opacity: 0.85;
  }
  @media (max-width: 900px) {
    .painel-form {
      order: -1;
    }
  }
  .contas {
    min-width: 0;
  }
  .conta {
    padding: 14px 16px;
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .conta-top {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
  }
  .conta-id {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .conta-nome {
    font-weight: 600;
    font-size: 1rem;
    color: var(--ink);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conta-nome:hover {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .conta-saldo {
    font-size: clamp(1.25rem, 1rem + 1vw, 1.625rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
    white-space: nowrap;
  }
  .neg {
    color: var(--neg);
  }
  .conta-acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: space-between;
  }
  .saldo {
    display: flex;
    gap: 4px;
    flex: 1 1 280px;
    min-width: 0;
  }
  .saldo .inp {
    flex: 1;
    background: var(--paper);
    font-weight: 600;
  }
  .ordem {
    display: flex;
    gap: 4px;
  }
  .ordem .btn,
  .ordem .btn:disabled {
    min-height: 44px;
    min-width: 44px;
    cursor: pointer;
  }
  .ordem .btn:disabled {
    cursor: default;
    opacity: 0.4;
  }
  .fc {
    display: grid;
    gap: 16px;
  }
  .note a {
    color: var(--ink);
    font-weight: 600;
    text-underline-offset: 4px;
  }
</style>

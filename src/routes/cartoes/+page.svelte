<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { formatarDia } from '$lib/dominio/datas';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import { situacaoLimite } from '$lib/dominio/resumo';
  import FormCartao from '$lib/ui/FormCartao.svelte';
  import Medidor from '$lib/ui/Medidor.svelte';
  import Valor from '$lib/ui/Valor.svelte';
  import { tituloMes } from '$lib/ui/formato';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const erroCriar = $derived(form?.acao === 'criar' && !('ok' in form) ? form : null);
  const okCriar = $derived(form?.acao === 'criar' && 'ok' in form ? form.ok : null);
  const erroLinha = $derived(
    form && (form.acao === 'arquivar' || form.acao === 'desarquivar') && !('ok' in form)
      ? form.erro
      : null,
  );
  const okLinha = $derived(
    form && (form.acao === 'arquivar' || form.acao === 'desarquivar') && 'ok' in form
      ? form.ok
      : null,
  );
</script>

<svelte:head>
  <title>Controle Financeiro · Cartões</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Cartões</h1>
    <p>
      Compras no cartão caem na fatura do mês certo. Pagar uma fatura não mexe no saldo das contas.
    </p>
  </div>
  <div class="soma">
    <p class="soma-val"><Valor centavos={data.aPagarTotal} testid="a-pagar-cartoes" /></p>
    <p class="muted">a pagar em todos os cartões</p>
  </div>
</header>

{#if okLinha}
  <p class="aviso pad ok-msg" role="status">{okLinha}</p>
{:else if erroLinha}
  <p class="aviso pad err" role="alert">{erroLinha}</p>
{/if}

<section class="sec alt pad grade form-primeiro">
  <div class="col">
    {#if data.cartoes.length}
      <ul class="cartoes" data-testid="lista-cartoes">
        {#each data.cartoes as c (c.id)}
          <li class="cartao">
            <div class="cartao-top">
              <div class="cartao-id">
                <a class="cartao-nome" href={resolve('/cartoes/[id]', { id: c.id })}>{c.nome}</a>
                <span class="muted small num"
                  >Fecha dia {c.diaFechamento} · vence dia {c.diaVencimento}</span
                >
              </div>
              <dl class="numeros">
                <div>
                  <dt>Limite</dt>
                  <dd class="num">
                    {c.limiteCentavos > 0 ? formatarBRL(c.limiteCentavos) : 'Sem limite'}
                  </dd>
                </div>
                <div>
                  <dt>A pagar</dt>
                  <dd class="num"><Valor centavos={c.aPagarCentavos} /></dd>
                </div>
              </dl>
            </div>

            {#if c.limiteCentavos > 0}
              <Medidor s={situacaoLimite(c.aPagarCentavos, c.limiteCentavos)!} />
            {/if}

            {#if c.proximaFatura}
              <p class="proxima">
                <span class="muted">Próxima fatura</span>
                <a
                  href={resolve('/cartoes/[id]/faturas/[mes]', {
                    id: c.id,
                    mes: c.proximaFatura.mes,
                  })}>{tituloMes(c.proximaFatura.mes)}</a
                >
                <span class="num">
                  · vence {formatarDia(c.proximaFatura.vencimento)} · <Valor
                    centavos={c.proximaFatura.totalCentavos}
                  /></span
                >
              </p>
            {:else}
              <p class="muted small">Nenhuma compra em aberto neste cartão.</p>
            {/if}

            <div class="cartao-acts">
              <a class="btn sm" href={resolve('/cartoes/[id]', { id: c.id })}>Editar</a>
              <form method="POST" action="?/arquivar" use:enhance>
                <input type="hidden" name="id" value={c.id} />
                <button class="btn sm" type="submit">Arquivar</button>
              </form>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty">
        <strong>Nenhum cartão ainda</strong>
        <span
          >Cadastre ao lado o primeiro, com os dias de fechamento e de vencimento da fatura.</span
        >
      </div>
    {/if}

    {#if data.arquivados.length}
      <div class="arquivados">
        <h2 class="h">Arquivados</h2>
        <p class="note">Ficam guardados com as faturas, mas não aparecem nos lançamentos novos.</p>
        <ul class="rows" data-testid="lista-arquivados">
          {#each data.arquivados as c (c.id)}
            <li class="row">
              <span class="sq" style="--cc: var(--ink)"></span>
              <span class="row-main">
                <a class="row-title" href={resolve('/cartoes/[id]', { id: c.id })}>{c.nome}</a>
                <span class="row-meta"
                  >Fecha dia {c.diaFechamento} · vence dia {c.diaVencimento}</span
                >
              </span>
              <form method="POST" action="?/desarquivar" use:enhance>
                <input type="hidden" name="id" value={c.id} />
                <button class="btn sm" type="submit">Desarquivar</button>
              </form>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <p class="note">
      Cartões removidos ficam na <a href={resolve('/lixeira')}>lixeira</a>.
    </p>
  </div>

  <div class="painel-form">
    <h2>Novo cartão</h2>
    <FormCartao
      acao="?/criar"
      rotulo="Cadastrar cartão"
      id="novo"
      inicial={{}}
      erros={erroCriar?.erros}
      erro={erroCriar?.erro}
      valores={erroCriar?.valores}
    />
    {#if okCriar}<p class="ok-msg" role="status">{okCriar}</p>{/if}
  </div>
</section>

<style>
  .soma {
    text-align: right;
    display: grid;
    gap: 4px;
  }
  .soma-val {
    font-size: clamp(2rem, 1.2rem + 3vw, 3.5rem);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  @media (max-width: 700px) {
    .soma {
      text-align: left;
    }
  }
  @media (max-width: 900px) {
    .painel-form {
      order: -1;
    }
  }
  .cartoes {
    display: grid;
    gap: 4px;
  }
  .cartao {
    background: var(--paper);
    padding: 18px;
    display: grid;
    gap: 14px;
  }
  .cartao-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12px 24px;
    flex-wrap: wrap;
  }
  .cartao-id {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .cartao-nome {
    font-weight: 600;
    font-size: 1.25rem;
    letter-spacing: -0.02em;
    color: var(--ink);
    text-decoration: none;
  }
  .cartao-nome:hover {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .numeros {
    display: flex;
    gap: 20px;
    margin: 0;
  }
  .numeros div {
    display: grid;
    gap: 2px;
    text-align: right;
  }
  .numeros dt {
    font-size: var(--s-small);
    color: var(--muted);
  }
  .numeros dd {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .proxima {
    margin: 0;
    font-size: 0.9375rem;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
  }
  .proxima a {
    color: var(--ink);
    font-weight: 600;
    text-underline-offset: 4px;
  }
  .cartao-acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .cartao-acts .btn {
    min-height: 44px;
    cursor: pointer;
  }
  .arquivados {
    display: grid;
    gap: 8px;
    margin-top: 24px;
  }
  .h {
    font-size: var(--s-lead);
  }
  .aviso {
    background: var(--orange-soft);
    padding-block: 12px;
  }
  .note a {
    color: var(--ink);
    font-weight: 600;
    text-underline-offset: 4px;
  }
  .painel-form h2 {
    font-size: var(--s-lead);
  }
</style>

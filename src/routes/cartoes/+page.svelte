<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { formatarDia } from '$lib/dominio/datas';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import { situacaoLimite } from '$lib/dominio/resumo';
  import FormCartao from '$lib/ui/FormCartao.svelte';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import Valor from '$lib/ui/Valor.svelte';
  import { tituloMes } from '$lib/ui/formato';
  import CreditCard from '@lucide/svelte/icons/credit-card';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  /** Soma só das faturas a pagar agora (não das parcelas futuras). */
  const totalFaturasAtuais = $derived(
    data.cartoes.reduce((s, c) => s + (c.faturaAtual.paga ? 0 : c.faturaAtual.totalCentavos), 0),
  );
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
  <div class="destaque">
    <p class="destaque-rot">Faturas atuais</p>
    <p class="destaque-val"><Valor centavos={totalFaturasAtuais} testid="faturas-atuais" /></p>
    <p class="destaque-nota">
      Dívida total, com parcelas futuras:
      <span class="num" data-testid="a-pagar-cartoes">{formatarBRL(data.aPagarTotal)}</span>
    </p>
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
        {#each data.cartoes as c, i (c.id)}
          <li class="cartao">
            <div class="cc" style="--fundo: {i % 2 ? 'var(--night)' : 'var(--hero)'}">
              <div class="cc-top">
                <IconeRedondo icone={CreditCard} cor="rgb(255 255 255 / 0.2)" tamanho={36} />
                <a class="cc-nome" href={resolve('/cartoes/[id]', { id: c.id })}>{c.nome}</a>
              </div>
              <div class="cc-fatura">
                <span class="cc-rot">Fatura atual · {tituloMes(c.faturaAtual.mes)}</span>
                <span class="cc-val"
                  ><Valor centavos={c.faturaAtual.totalCentavos} testid="fatura-atual" /></span
                >
              </div>
              <span class="cc-dias num"
                >{c.faturaAtual.paga ? 'Paga' : 'Vence'} em {formatarDia(c.faturaAtual.vencimento)}
                · Fecha dia {c.diaFechamento} · vence dia {c.diaVencimento}</span
              >
            </div>

            <div class="cartao-info">
              {#if c.limiteCentavos > 0 && c.disponivelCentavos !== null}
                <div class="limite">
                  <span class="muted small">Limite disponível</span>
                  <strong class="num" class:neg={c.disponivelCentavos < 0}
                    >{formatarBRL(c.disponivelCentavos)}</strong
                  >
                  <span class="muted small num">de {formatarBRL(c.limiteCentavos)}</span>
                </div>
                {@const uso = situacaoLimite(c.aPagarCentavos, c.limiteCentavos)!}
                <div
                  class="barra {uso.estado}"
                  role="progressbar"
                  aria-label="Limite usado"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, uso.percentual)}
                  aria-valuetext="{uso.percentual}% do limite usado"
                >
                  <span style="width: {Math.min(100, uso.percentual)}%"></span>
                </div>
              {:else}
                <p class="muted small">Sem limite informado.</p>
              {/if}

              <ul class="linhas">
                <li>
                  <a
                    href={resolve('/cartoes/[id]/faturas/[mes]', {
                      id: c.id,
                      mes: c.faturaAtual.mes,
                    })}
                  >
                    <span>
                      Fatura atual
                      <small>{tituloMes(c.faturaAtual.mes)}</small>
                    </span>
                    <span class="num">{formatarBRL(c.faturaAtual.totalCentavos)}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={resolve('/cartoes/[id]/faturas/[mes]', {
                      id: c.id,
                      mes: c.faturaSeguinte.mes,
                    })}
                  >
                    <span>
                      Próxima fatura
                      <small
                        >{tituloMes(c.faturaSeguinte.mes)} · vence {formatarDia(
                          c.faturaSeguinte.vencimento,
                        )}</small
                      >
                    </span>
                    <span class="num">{formatarBRL(c.faturaSeguinte.totalCentavos)}</span>
                  </a>
                </li>
                <li class="total">
                  <span>
                    Limite utilizado
                    <small
                      >{c.limiteCentavos > 0
                        ? `${situacaoLimite(c.aPagarCentavos, c.limiteCentavos)!.percentual}% do limite · `
                        : ''}inclui parcelas futuras</small
                    >
                  </span>
                  <span class="num" data-testid="a-pagar-cartao"
                    >{formatarBRL(c.aPagarCentavos)}</span
                  >
                </li>
              </ul>

              <div class="cartao-acts">
                <a class="btn text sm" href={resolve('/cartoes/[id]', { id: c.id })}>Editar</a>
                <form method="POST" action="?/arquivar" use:enhance>
                  <input type="hidden" name="id" value={c.id} />
                  <button class="btn text sm" type="submit">Arquivar</button>
                </form>
              </div>
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
              <IconeRedondo icone={CreditCard} cor="var(--c9)" suave />
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
  .cartoes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 16px;
    min-width: 0;
  }
  .cartao {
    display: grid;
    gap: 10px;
    align-content: start;
    min-width: 0;
  }
  /* O cartão de crédito em si: cor sólida, cantos de 18px, fatura em destaque */
  .cc {
    background: var(--fundo);
    color: #fff;
    border-radius: var(--r-card);
    box-shadow: var(--shadow-up);
    padding: 18px 20px;
    min-height: 168px;
    display: grid;
    gap: 16px;
    align-content: space-between;
    min-width: 0;
  }
  .cc-top {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .cc-nome {
    font-weight: 650;
    font-size: 1.0625rem;
    color: inherit;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .cc-nome:hover {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .cc-fatura {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .cc-rot {
    font-size: 0.8125rem;
    font-weight: 600;
    opacity: 0.85;
  }
  .cc-val {
    font-size: clamp(1.75rem, 1.3rem + 1.6vw, 2.25rem);
    font-weight: 700;
    letter-spacing: -0.035em;
    line-height: 1.05;
  }
  .cc-dias {
    font-size: 0.8125rem;
    opacity: 0.85;
  }
  .limite {
    display: grid;
    gap: 2px;
  }
  .limite strong {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--pos);
  }
  .limite strong.neg {
    color: var(--neg);
  }
  .linhas {
    display: grid;
  }
  .barra {
    height: 8px;
    border-radius: 999px;
    background: var(--step);
    overflow: hidden;
  }
  .barra span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--pos);
  }
  .barra.alerta span {
    background: var(--warn);
  }
  .barra.estourado span {
    background: var(--neg);
  }
  .linhas li + li {
    border-top: 1px solid var(--line);
  }
  .linhas a,
  .linhas .total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    color: inherit;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9375rem;
  }
  .linhas a:hover > span:first-child {
    color: var(--orange);
  }
  .linhas small {
    display: block;
    font-weight: 400;
    font-size: var(--s-small);
    color: var(--muted);
  }
  .linhas .num {
    white-space: nowrap;
  }
  .cartao-info {
    background: var(--surface);
    border-radius: var(--r-card);
    box-shadow: var(--shadow);
    padding: 16px 18px;
    display: grid;
    gap: 12px;
    align-content: start;
    min-width: 0;
  }
  .cartao-acts {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    align-items: center;
    margin-left: -10px;
  }
  .cartao-acts .btn {
    min-height: 44px;
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

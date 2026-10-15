<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { rotuloParcela } from '$lib/dominio/cartoes';
  import type { Mes } from '$lib/dominio/datas';
  import { formatarDia } from '$lib/dominio/datas';
  import { centavosParaCampo, formatarBRL } from '$lib/dominio/dinheiro';
  import NavMes from '$lib/ui/NavMes.svelte';
  import Valor from '$lib/ui/Valor.svelte';
  import { corCss, tituloMes } from '$lib/ui/formato';
  import { ariaErro } from '$lib/ui/formularios';
  import { CLASSE_SITUACAO, ROTULO_SITUACAO } from '$lib/ui/rotulosCartao';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const f = $derived(data.fatura);
  const cartaoId = $derived(data.cartao.id);
  const linkMes = (m: Mes) => resolve('/cartoes/[id]/faturas/[mes]', { id: cartaoId, mes: m });
  const paga = $derived(f.situacao === 'paga');
  const erroPagar = $derived(form?.acao === 'pagar' && !('ok' in form) ? form : null);
  const okAcao = $derived(form && 'ok' in form ? form.ok : null);
  const erroDesfazer = $derived(form?.acao === 'desfazer' && !('ok' in form) ? form.erro : null);
</script>

<svelte:head>
  <title>Controle Financeiro · {data.cartao.nome} · {tituloMes(f.mes)}</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Fatura de {tituloMes(f.mes).toLowerCase()}</h1>
    <p>{data.cartao.nome}</p>
    <p class="voltar-l">
      <a class="voltar" href={resolve('/cartoes/[id]', { id: cartaoId })}
        >‹ Voltar a {data.cartao.nome}</a
      >
    </p>
  </div>
  <NavMes mes={f.mes} href={linkMes} />
</header>

{#if okAcao}
  <p class="aviso pad ok-msg" role="status">{okAcao}</p>
{:else if erroDesfazer}
  <p class="aviso pad err" role="alert">{erroDesfazer}</p>
{/if}

<section class="sec alt pad grade form-primeiro">
  <div class="col">
    <dl class="fatos" data-testid="resumo-fatura">
      <div>
        <dt>Total</dt>
        <dd class="num" data-testid="total-fatura"><Valor centavos={f.totalCentavos} /></dd>
      </div>
      <div>
        <dt>Situação</dt>
        <dd>
          <span class="tag {CLASSE_SITUACAO[f.situacao]}" data-testid="situacao-fatura"
            >{ROTULO_SITUACAO[f.situacao]}</span
          >
        </dd>
      </div>
      <div>
        <dt>Fechamento</dt>
        <dd class="num">{formatarDia(f.dataFechamento)}</dd>
      </div>
      <div>
        <dt>Vencimento</dt>
        <dd class="num">{formatarDia(f.dataVencimento)}</dd>
      </div>
      {#if paga && f.pagaEm}
        <div>
          <dt>Paga em</dt>
          <dd class="num">{formatarDia(f.pagaEm)}</dd>
        </div>
        <div>
          <dt>Valor pago</dt>
          <dd class="num">
            {f.valorPagoCentavos !== null ? formatarBRL(f.valorPagoCentavos) : '—'}
          </dd>
        </div>
      {/if}
    </dl>

    <div class="col-head"><h2 class="h">Compras</h2></div>
    {#if data.dias.length}
      <div class="dias" data-testid="itens-fatura">
        {#each data.dias as dia (dia.data)}
          <div class="dia">
            <h3 class="dia-titulo num">{formatarDia(dia.data)}</h3>
            <ul class="rows">
              {#each dia.itens as it (it.compraId + '-' + it.parcela)}
                <li class="row">
                  <span class="sq" style="--cc: {corCss(it.categoriaCor)}"></span>
                  <span class="row-main">
                    <span class="row-title">{it.descricao ?? it.categoriaNome}</span>
                    <span class="row-meta">
                      {#if it.descricao}{it.categoriaNome} ·
                      {/if}<span class="num">{rotuloParcela(it.parcela, it.numParcelas)}</span>
                    </span>
                  </span>
                  <span class="row-val"><Valor centavos={it.valorCentavos} /></span>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty">
        <strong>Nenhuma compra nesta fatura</strong>
        <span>Os lançamentos deste mês aparecem aqui quando caem neste cartão.</span>
      </div>
    {/if}
  </div>

  <div class="painel-form">
    <h2>Pagamento</h2>
    <p class="aviso-dias">Pagar a fatura não altera o saldo das contas.</p>

    {#if paga}
      <form class="fc" method="POST" action="?/desfazer" use:enhance>
        <p class="note">
          Pago em {f.pagaEm ? formatarDia(f.pagaEm) : '—'}
          {#if f.valorPagoCentavos !== null}· {formatarBRL(f.valorPagoCentavos)}{/if}.
        </p>
        <div><button class="btn" type="submit">Desfazer pagamento</button></div>
      </form>
    {:else if f.itens.length}
      <form class="fc" method="POST" action="?/pagar" use:enhance autocomplete="off">
        <div class="field">
          <label for="pg-data">Pago em</label>
          <input
            id="pg-data"
            name="pagaEm"
            type="date"
            value={erroPagar?.valores?.pagaEm ?? data.hoje}
            {...ariaErro(erroPagar?.erros?.pagaEm, 'pg-data')}
          />
          {#if erroPagar?.erros?.pagaEm}<span class="err" id="pg-data-erro"
              >{erroPagar.erros.pagaEm}</span
            >{/if}
        </div>
        <div class="field">
          <label for="pg-valor">Valor pago (R$)</label>
          <input
            id="pg-valor"
            name="valor"
            inputmode="decimal"
            value={erroPagar?.valores?.valor ?? centavosParaCampo(f.totalCentavos)}
            {...ariaErro(erroPagar?.erros?.valor, 'pg-valor')}
          />
          {#if erroPagar?.erros?.valor}<span class="err" id="pg-valor-erro"
              >{erroPagar.erros.valor}</span
            >{/if}
          <span class="hint">Vem com o total da fatura; ajuste se o banco cobrou outro valor.</span>
        </div>
        {#if erroPagar?.erro}<p class="err" role="alert">{erroPagar.erro}</p>{/if}
        <div><button class="btn ink" type="submit">Marcar como paga</button></div>
      </form>
    {:else}
      <p class="note">Sem compras neste mês, não há o que pagar.</p>
    {/if}
  </div>
</section>

<style>
  .aviso {
    background: var(--orange-soft);
    padding-block: 12px;
  }
  .aviso-dias {
    margin: 0;
    padding: 12px 14px;
    background: var(--orange-soft);
    font-size: 0.9375rem;
  }
  .h {
    font-size: var(--s-lead);
  }
  .fatos {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    margin: 0;
  }
  .fatos div {
    background: var(--surface);
    padding: 14px 16px;
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .fatos dt {
    font-size: var(--s-small);
    color: var(--muted);
  }
  .fatos dd {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    overflow-wrap: anywhere;
  }
  .dias {
    display: grid;
    gap: 20px;
  }
  .dia {
    display: grid;
    gap: 6px;
  }
  .dia-titulo {
    margin: 0;
    font-size: var(--s-small);
    font-weight: 600;
    color: var(--muted);
  }
  .row-val {
    font-weight: 600;
  }
  .fc {
    display: grid;
    gap: 16px;
  }
  .tag.situacao-vencida {
    color: var(--neg);
  }
  .tag.situacao-paga {
    color: var(--pos);
  }
  .voltar-l {
    margin: 0;
  }
  @media (max-width: 420px) {
    .fatos {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>

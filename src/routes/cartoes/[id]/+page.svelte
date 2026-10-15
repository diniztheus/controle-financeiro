<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { formatarDia } from '$lib/dominio/datas';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import ConfirmarRemocao from '$lib/ui/ConfirmarRemocao.svelte';
  import FormCartao from '$lib/ui/FormCartao.svelte';
  import Valor from '$lib/ui/Valor.svelte';
  import { tituloMes } from '$lib/ui/formato';
  import { CLASSE_SITUACAO, ROTULO_SITUACAO } from '$lib/ui/rotulosCartao';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const c = $derived(data.cartao);
  const erro = $derived(form?.acao === 'salvar' && !('ok' in form) ? form : null);
  const okSalvar = $derived(form?.acao === 'salvar' && 'ok' in form ? form.ok : null);
  const erroAcao = $derived(
    form &&
      (form.acao === 'arquivar' || form.acao === 'desarquivar' || form.acao === 'remover') &&
      !('ok' in form)
      ? form.erro
      : null,
  );
  const okAcao = $derived(
    form && (form.acao === 'arquivar' || form.acao === 'desarquivar') && 'ok' in form
      ? form.ok
      : null,
  );
</script>

<svelte:head>
  <title>Controle Financeiro · {c.nome}</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>{c.nome}</h1>
    <p class="num">Fecha dia {c.diaFechamento} · vence dia {c.diaVencimento}</p>
    <p class="voltar-l"><a class="voltar" href={resolve('/cartoes')}>‹ Voltar aos cartões</a></p>
  </div>
  <div class="soma">
    <p class="soma-val"><Valor centavos={data.aPagar} testid="a-pagar" /></p>
    <p class="muted">
      {c.limiteCentavos > 0 ? `de um limite de ${formatarBRL(c.limiteCentavos)}` : 'sem limite'}
      {#if !c.ativo}· <span class="tag">Arquivado</span>{/if}
    </p>
  </div>
</header>

{#if okAcao}
  <p class="aviso pad ok-msg" role="status">{okAcao}</p>
{:else if erroAcao}
  <p class="aviso pad err" role="alert">{erroAcao}</p>
{/if}

<section class="sec alt pad grade form-primeiro">
  <div class="painel-form">
    <h2>Editar</h2>
    <p class="aviso-dias">
      Mudar fechamento ou vencimento vale só para compras novas. As compras já lançadas continuam
      nas faturas em que caíram.
    </p>
    <FormCartao
      acao="?/salvar"
      rotulo="Salvar"
      id="e"
      manter
      inicial={{
        nome: c.nome,
        limiteCentavos: c.limiteCentavos,
        diaFechamento: c.diaFechamento,
        diaVencimento: c.diaVencimento,
      }}
      erros={erro?.erros}
      erro={erro?.erro}
      valores={erro?.valores}
    />
    {#if okSalvar}<p class="ok-msg" role="status">{okSalvar}</p>{/if}
  </div>

  <div class="col">
    <div class="col-head"><h2 class="h">Faturas</h2></div>
    {#if data.faturas.length}
      <ul class="rows" data-testid="faturas">
        {#each data.faturas as f (f.mes)}
          <li class="row">
            <span class="sq" style="--cc: var(--ink)"></span>
            <span class="row-main">
              <a
                class="row-title"
                href={resolve('/cartoes/[id]/faturas/[mes]', { id: c.id, mes: f.mes })}
                >{tituloMes(f.mes)}</a
              >
              <span class="row-meta"
                >vence {formatarDia(f.vencimento)} ·
                <span class="tag {CLASSE_SITUACAO[f.situacao]}">{ROTULO_SITUACAO[f.situacao]}</span
                ></span
              >
            </span>
            <span class="row-val"><Valor centavos={f.totalCentavos} /></span>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty">
        <strong>Nenhuma fatura ainda</strong>
        <span>As faturas aparecem quando você lança a primeira compra neste cartão.</span>
      </div>
    {/if}

    <div class="bloco">
      <h2 class="h">{c.ativo ? 'Arquivar' : 'Arquivado'}</h2>
      {#if c.ativo}
        <p class="note">
          Cartão arquivado some dos formulários novos, mas o histórico e as faturas ficam guardados.
        </p>
        <form method="POST" action="?/arquivar" use:enhance>
          <button class="btn" type="submit">Arquivar cartão</button>
        </form>
      {:else}
        <p class="note">
          Este cartão não aparece nos formulários de compra. Dá para voltar quando quiser.
        </p>
        <form method="POST" action="?/desarquivar" use:enhance>
          <button class="btn" type="submit">Desarquivar cartão</button>
        </form>
      {/if}
    </div>

    <div class="bloco">
      <h2 class="h">Remover cartão</h2>
      <p class="note">
        O cartão vai para a lixeira e sai de todas as listas e somas. Restaure por lá quando quiser.
      </p>
      {#if data.aPagar > 0}
        <p class="aviso-dias" role="note">
          Este cartão tem {formatarBRL(data.aPagar)} a pagar. Removido, esse valor sai do patrimônio até
          ser restaurado.
        </p>
      {/if}
      <ConfirmarRemocao />
      {#if form?.acao === 'remover' && form.erro}<p class="err" role="alert">{form.erro}</p>{/if}
    </div>
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
  .h {
    font-size: var(--s-lead);
  }
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
  .bloco {
    display: grid;
    gap: 12px;
    margin-top: 32px;
    justify-items: start;
  }
  .bloco .note {
    margin: 0;
  }
  .tag.situacao-vencida {
    color: var(--neg);
  }
  .tag.situacao-paga {
    color: var(--pos);
  }
  .row-val {
    font-weight: 600;
  }
  .voltar-l {
    margin: 0;
  }
</style>

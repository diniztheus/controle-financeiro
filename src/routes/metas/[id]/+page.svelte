<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { formatarDia } from '$lib/dominio/datas';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import type { Cor } from '$lib/dominio/categorias';
  import ConfirmarRemocao from '$lib/ui/ConfirmarRemocao.svelte';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import Valor from '$lib/ui/Valor.svelte';

  import ArrowDownToLine from '@lucide/svelte/icons/arrow-down-to-line';
  import ArrowUpFromLine from '@lucide/svelte/icons/arrow-up-from-line';
  import FormMeta from '../FormMeta.svelte';
  import FormMovimento from './FormMovimento.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const m = $derived(data.meta);
  const c = $derived(m.calculo);

  const erroSalvar = $derived(form?.acao === 'salvar' && !('ok' in form) ? form : null);
  const okSalvar = $derived(form?.acao === 'salvar' && 'ok' in form ? form.ok : null);
  const erroMov = $derived(form?.acao === 'movimentar' && !('ok' in form) ? form : null);
  const okMov = $derived(form?.acao === 'movimentar' && 'ok' in form ? form.ok : null);
  const erroAcao = $derived(
    form && (form.acao === 'removerMovimento' || form.acao === 'remover') && !('ok' in form)
      ? form.erro
      : null,
  );
  const okAcao = $derived(
    form && form.acao === 'removerMovimento' && 'ok' in form ? form.ok : null,
  );
</script>

<svelte:head>
  <title>Controle Financeiro · {m.nome}</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>{m.nome}</h1>
    <p class="num">Meta de {formatarBRL(m.alvoCentavos)}</p>
    <p class="voltar-l"><a class="voltar" href={resolve('/metas')}>‹ Voltar às metas</a></p>
  </div>
  <div class="destaque">
    <p class="destaque-rot">
      Guardado
      {#if c.concluida}· <span class="tag-concluida">Concluída</span>{/if}
    </p>
    <p class="destaque-val"><Valor centavos={m.guardadoCentavos} testid="guardado" /></p>
    <span
      class="barra"
      role="progressbar"
      aria-label="Progresso da meta"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, c.percentual)}
      aria-valuetext="{c.percentual}% guardado"
    >
      <span style="width: {Math.min(100, c.percentual)}%"></span>
    </span>
    <p class="destaque-nota">
      {c.percentual}% da meta ·
      {#if c.concluida}
        meta atingida
      {:else}
        falta <span class="num" data-testid="falta">{formatarBRL(c.faltaCentavos)}</span>
      {/if}
    </p>
    <p class="destaque-nota">
      {#if m.prazo === null}
        Sem prazo.
      {:else if c.prazoPassado}
        O prazo ({formatarDia(m.prazo)}) já passou.
      {:else}
        Prazo: {formatarDia(m.prazo)}.
        {#if !c.concluida && c.porMesCentavos !== null}
          Guarde <span class="num" data-testid="por-mes">{formatarBRL(c.porMesCentavos)}</span> por
          mês ({c.mesesAtePrazo}
          {c.mesesAtePrazo === 1 ? 'mês' : 'meses'}).
        {/if}
      {/if}
    </p>
    <p class="destaque-nota">Não mexe em conta nem no patrimônio.</p>
  </div>
</header>

{#if okAcao}
  <p class="aviso pad ok-msg" role="status">{okAcao}</p>
{:else if erroAcao}
  <p class="aviso pad err" role="alert">{erroAcao}</p>
{/if}

<section class="sec alt pad grade form-primeiro">
  <div class="col">
    <div class="col-head"><h2 class="h">Movimentos</h2></div>
    <p class="note">
      Guardar põe dinheiro na meta; retirar tira. Retirar mais do que está guardado não é aceito.
    </p>
    {#if m.movimentos.length}
      <ul class="rows" data-testid="lista-movimentos">
        {#each m.movimentos as mov (mov.id)}
          {@const entrou = mov.valorCentavos > 0}
          <li class="row">
            <IconeRedondo
              icone={entrou ? ArrowDownToLine : ArrowUpFromLine}
              cor={entrou ? 'var(--pos)' : 'var(--neg)'}
              suave
            />
            <span class="row-main">
              <span class="row-title"
                >{entrou ? 'Guardou' : 'Retirou'} · {formatarBRL(Math.abs(mov.valorCentavos))}</span
              >
              <span class="row-meta">{formatarDia(mov.data)}{mov.nota ? ` · ${mov.nota}` : ''}</span
              >
            </span>
            <form method="POST" action="?/removerMovimento" use:enhance>
              <input type="hidden" name="id" value={mov.id} />
              <button
                class="btn sm"
                type="submit"
                aria-label="Remover {entrou ? 'guardado' : 'retirada'} de {formatarBRL(
                  Math.abs(mov.valorCentavos),
                )} de {formatarDia(mov.data)}">Remover</button
              >
            </form>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty">
        <strong>Nenhum movimento ainda</strong>
        <span>Use o formulário ao lado para guardar o primeiro valor.</span>
      </div>
    {/if}
    <p class="note">Movimentos removidos saem do total guardado.</p>
  </div>

  <div class="col-form">
    <div class="painel-form">
      <h2>Guardar ou retirar</h2>
      <FormMovimento
        acao="?/movimentar"
        hoje={data.hoje}
        erros={erroMov?.erros}
        erro={erroMov?.erro}
        valores={erroMov?.valores}
      />
      {#if okMov}<p class="ok-msg" role="status">{okMov}</p>{/if}
    </div>

    <div class="painel-form">
      <h2>Editar meta</h2>
      <FormMeta
        acao="?/salvar"
        rotulo="Salvar"
        id="e"
        manter
        inicial={{
          nome: m.nome,
          alvoCentavos: m.alvoCentavos,
          prazo: m.prazo,
          cor: m.cor as Cor | null,
        }}
        erros={erroSalvar?.erros}
        erro={erroSalvar?.erro}
        valores={erroSalvar?.valores}
      />
      {#if okSalvar}<p class="ok-msg" role="status">{okSalvar}</p>{/if}
    </div>

    <div class="painel-form">
      <h2>Remover meta</h2>
      <p class="note">
        A meta vai para a <a href={resolve('/lixeira')}>lixeira</a>, fora do total guardado, e pode
        ser restaurada depois.
      </p>
      <ConfirmarRemocao acao="?/remover" rotulo="Mandar para a lixeira" />
    </div>
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
    gap: 8px;
    min-width: min(100%, 300px);
  }
  .page-head {
    align-items: center;
  }
  @media (max-width: 700px) {
    .destaque {
      flex-basis: 100%;
    }
  }
  @media (max-width: 900px) {
    .col-form {
      order: -1;
    }
  }
  .destaque-rot {
    color: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    opacity: 0.85;
  }
  .tag-concluida {
    background: color-mix(in srgb, currentColor 20%, transparent);
    border-radius: 999px;
    padding: 1px 8px;
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
  .barra {
    height: 8px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 25%, transparent);
    overflow: hidden;
    display: block;
  }
  .barra span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: currentColor;
  }
  .h {
    font-size: var(--s-lead);
  }
  .aviso {
    background: var(--orange-soft);
    padding-block: 12px;
  }
  .col-form {
    display: grid;
    gap: 16px;
    align-content: start;
    min-width: 0;
  }
  .col {
    min-width: 0;
  }
  .painel-form h2 {
    font-size: var(--s-lead);
  }
  .note a {
    color: var(--ink);
    font-weight: 600;
    text-underline-offset: 4px;
  }
  .row form {
    margin: 0;
  }
  .voltar-l {
    margin: 0;
  }
</style>

<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatarDia } from '$lib/dominio/datas';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import Valor from '$lib/ui/Valor.svelte';
  import { corCss } from '$lib/ui/formato';
  import PiggyBank from '@lucide/svelte/icons/piggy-bank';
  import Target from '@lucide/svelte/icons/target';
  import FormMeta from './FormMeta.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const erroCriar = $derived(form?.acao === 'criar' && !('ok' in form) ? form : null);
  const okCriar = $derived(form?.acao === 'criar' && 'ok' in form ? form.ok : null);
</script>

<svelte:head>
  <title>Controle Financeiro · Metas</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Metas</h1>
    <p>
      Caixinhas para objetivos, como uma viagem ou um carro. Guardar e retirar aqui não mexe em
      conta nenhuma nem no patrimônio.
    </p>
  </div>
  <div class="destaque">
    <p class="destaque-rot">Total guardado</p>
    <p class="destaque-val"><Valor centavos={data.totalGuardado} testid="total-guardado" /></p>
    <p class="destaque-nota">Soma de todas as metas que estão fora da lixeira.</p>
  </div>
</header>

<section class="sec alt pad grade form-primeiro">
  <div class="col">
    {#if data.metas.length}
      <ul class="metas" data-testid="lista-metas">
        {#each data.metas as m (m.id)}
          {@const c = m.calculo}
          <li class="meta" class:concluida={c.concluida}>
            <a class="meta-link" href={resolve('/metas/[id]', { id: m.id })}>
              <span class="meta-top">
                <IconeRedondo
                  icone={c.concluida ? Target : PiggyBank}
                  cor={corCss(m.cor)}
                  tamanho={44}
                />
                <span class="meta-nome">{m.nome}</span>
                {#if c.concluida}<span class="etiqueta">Concluída</span>{/if}
              </span>

              <span
                class="barra"
                class:feita={c.concluida}
                role="progressbar"
                aria-label="Progresso de {m.nome}"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, c.percentual)}
                aria-valuetext="{c.percentual}% guardado"
              >
                <span style="width: {Math.min(100, c.percentual)}%"></span>
              </span>

              <span class="meta-valores">
                <span
                  ><strong class="num">{formatarBRL(m.guardadoCentavos)}</strong>
                  <span class="muted num">de {formatarBRL(m.alvoCentavos)}</span></span
                >
                <span class="num pct">{c.percentual}%</span>
              </span>

              <span class="meta-prazo muted small">
                {#if m.prazo === null}
                  Sem prazo
                {:else if c.prazoPassado}
                  Prazo de {formatarDia(m.prazo)} já passou
                {:else}
                  Até {formatarDia(m.prazo)}
                  {#if !c.concluida && c.porMesCentavos !== null}
                    · guarde {formatarBRL(c.porMesCentavos)} por mês
                  {/if}
                {/if}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty">
        <strong>Nenhuma meta ainda</strong>
        <span>Crie a primeira ao lado: um nome e o valor que você quer juntar.</span>
      </div>
    {/if}

    <p class="note">
      Metas removidas ficam na <a href={resolve('/lixeira')}>lixeira</a>.
    </p>
  </div>

  <div class="painel-form">
    <h2>Nova meta</h2>
    <FormMeta
      acao="?/criar"
      rotulo="Criar meta"
      id="novo"
      inicial={{ cor: data.corSugerida }}
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
  @media (max-width: 900px) {
    .painel-form {
      order: -1;
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
  .metas {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
    gap: 16px;
    min-width: 0;
  }
  .meta {
    background: var(--surface);
    border-radius: var(--r-card);
    box-shadow: var(--shadow);
    min-width: 0;
  }
  .meta-link {
    display: grid;
    gap: 12px;
    padding: 18px 20px;
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }
  .meta-link:hover .meta-nome {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .meta-top {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .meta-nome {
    font-weight: 650;
    font-size: 1.0625rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
  }
  .etiqueta {
    background: var(--pos-soft);
    color: var(--pos);
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 0.8125rem;
    font-weight: 650;
  }
  .barra {
    height: 8px;
    border-radius: 999px;
    background: var(--step);
    overflow: hidden;
    display: block;
  }
  .barra span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--orange);
  }
  .barra.feita span {
    background: var(--pos);
  }
  .meta-valores {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }
  .meta-valores strong {
    font-size: 1.125rem;
    font-weight: 700;
  }
  .pct {
    font-weight: 650;
  }
  .meta-prazo {
    line-height: 1.4;
  }
  .note a {
    color: var(--ink);
    font-weight: 600;
    text-underline-offset: 4px;
  }
  .painel-form h2 {
    font-size: var(--s-lead);
  }
  .col {
    min-width: 0;
  }
</style>

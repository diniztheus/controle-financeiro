<script lang="ts">
  /** Lançamentos do mês agrupados por dia; cada linha abre o gasto para editar. */
  import { resolve } from '$app/paths';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import type { DiaDeLancamentos } from '$lib/dominio/lancamentos';
  import IconeRedondo from './IconeRedondo.svelte';
  import { corCss, diaPorExtenso } from './formato';

  interface Props {
    dias: DiaDeLancamentos[];
    /** Quantos dias mostrar (o painel mostra só os mais recentes). */
    limiteDias?: number;
  }
  let { dias, limiteDias }: Props = $props();
  const visiveis = $derived(limiteDias ? dias.slice(0, limiteDias) : dias);

  function detalhe(l: DiaDeLancamentos['itens'][number]): string {
    const partes = [l.categoriaNome];
    if (l.meio === 'cartao' && l.cartaoNome) partes.push(l.cartaoNome);
    else if (l.contaNome)
      partes.push(l.contaRemovida ? `${l.contaNome} (na lixeira)` : l.contaNome);
    return partes.join(' · ');
  }
</script>

<div class="days" data-testid="lancamentos">
  {#each visiveis as d (d.data)}
    <section class="day" aria-label={diaPorExtenso(d.data)}>
      <h3 class="day-head">
        <span>{diaPorExtenso(d.data)}</span>
        <span class="num">−{formatarBRL(d.totalCentavos)}</span>
      </h3>
      <ul class="rows">
        {#each d.itens as l (l.compraId + ':' + l.parcela)}
          <li>
            <a class="row" href={resolve('/gastos/[id]', { id: l.compraId })}>
              <IconeRedondo nome={l.categoriaNome} cor={corCss(l.categoriaCor)} />
              <span class="row-main">
                <span class="row-title"
                  >{l.descricao ?? l.categoriaNome}{#if l.numParcelas > 1}<span class="tag num"
                      >{l.parcela}/{l.numParcelas}</span
                    >{/if}</span
                >
                <span class="row-meta">{detalhe(l)}</span>
              </span>
              <span class="row-val num neg">−{formatarBRL(l.valorCentavos)}</span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  .days {
    display: grid;
    gap: 14px;
  }
  .day {
    display: grid;
    gap: 6px;
  }
  .day-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: var(--s-small);
    color: var(--muted);
    font-weight: 600;
    letter-spacing: 0;
    padding-inline: 4px;
  }
  .day-head span:first-child::first-letter {
    text-transform: uppercase;
  }
</style>

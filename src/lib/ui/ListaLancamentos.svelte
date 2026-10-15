<script lang="ts">
  /** Lançamentos do mês agrupados por dia; cada linha abre o gasto para editar. */
  import { resolve } from '$app/paths';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import type { DiaDeLancamentos } from '$lib/server/servicos/painel';
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
      <h4 class="day-head">
        <span>{diaPorExtenso(d.data)}</span>
        <span class="num">{formatarBRL(d.totalCentavos)}</span>
      </h4>
      <ul class="itens">
        {#each d.itens as l (l.compraId + ':' + l.parcela)}
          <li>
            <a class="row lanc" href={resolve('/gastos/[id]', { id: l.compraId })}>
              <span class="sq" style="--cc: {corCss(l.categoriaCor)}"></span>
              <span class="row-main">
                <span class="row-title"
                  >{l.descricao ?? l.categoriaNome}{#if l.numParcelas > 1}<span class="tag num"
                      >{l.parcela}/{l.numParcelas}</span
                    >{/if}</span
                >
                <span class="row-meta">{detalhe(l)}</span>
              </span>
              <span class="row-val num">{formatarBRL(l.valorCentavos)}</span>
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
    gap: 6px;
  }
  .day {
    display: grid;
    gap: 2px;
  }
  .day-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: var(--s-small);
    color: var(--muted);
    font-weight: 600;
    letter-spacing: 0;
    padding: 14px 12px 6px;
  }
  .day-head span:first-child::first-letter {
    text-transform: uppercase;
  }
  .itens {
    display: grid;
    gap: 2px;
  }
  .lanc {
    color: inherit;
    text-decoration: none;
    transition:
      background-color var(--t),
      transform var(--t);
  }
  .lanc:hover {
    background: var(--step) !important;
  }
  .lanc:active {
    transform: scale(0.995);
  }
</style>

<script module lang="ts">
  export interface ParFluxo {
    rotulo: string;
    entradasCentavos: number;
    saidasCentavos: number;
  }
</script>

<script lang="ts">
  /**
   * Barras pareadas por mês: entradas (verde) e saídas (vermelho). SVG próprio, sem biblioteca.
   * Os rótulos ficam embaixo, em HTML; o resumo para leitor de tela traz todos os valores, e a
   * tabela da tela tem os mesmos números.
   */
  import { formatarBRL } from '$lib/dominio/dinheiro';

  interface Props {
    pares: ParFluxo[];
    /** Início do resumo para leitor de tela, por exemplo "Entradas e saídas de cada mês." */
    resumo: string;
  }
  let { pares, resumo }: Props = $props();

  const L = 640;
  const ALTURA = 160;

  const n = $derived(pares.length);
  const topo = $derived(
    Math.max(1, ...pares.flatMap((p) => [p.entradasCentavos, p.saidasCentavos])),
  );
  const grupo = $derived(n ? L / n : L);
  // Com muitos meses, só alguns rótulos aparecem; a tabela da tela traz todos.
  const passo = $derived(n > 12 ? 3 : n > 6 ? 2 : 1);

  /** Cada mês ocupa um grupo: 12% de folga, duas barras de 36%, 4% entre elas e 12% de folga. */
  const retangulos = $derived(
    pares.flatMap((p, i) => {
      const x = i * grupo;
      const w = grupo * 0.36;
      const he = (ALTURA * p.entradasCentavos) / topo;
      const hs = (ALTURA * p.saidasCentavos) / topo;
      return [
        { chave: `${i}-e`, x: x + grupo * 0.12, y: ALTURA - he, w, h: he, cor: 'var(--pos)' },
        {
          chave: `${i}-s`,
          x: x + grupo * 0.52,
          y: ALTURA - hs,
          w,
          h: hs,
          cor: 'var(--neg)',
        },
      ];
    }),
  );

  const descricao = $derived(
    `${resumo} ${pares
      .map(
        (p) =>
          `${p.rotulo}: entradas ${formatarBRL(p.entradasCentavos)}, saídas ${formatarBRL(p.saidasCentavos)}`,
      )
      .join('; ')}.`,
  );
</script>

{#if n}
  <figure class="barras">
    <svg
      viewBox="0 0 {L} {ALTURA}"
      role="img"
      aria-label="{descricao} A tabela abaixo tem os mesmos números."
    >
      <line class="base" x1="0" x2={L} y1={ALTURA} y2={ALTURA} />
      {#each retangulos as r (r.chave)}
        {#if r.h > 0}
          <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="3" style="fill: {r.cor}" />
        {/if}
      {/each}
    </svg>
    <div class="eixo" aria-hidden="true" style="grid-template-columns: repeat({n}, minmax(0, 1fr))">
      {#each pares as p, i (i)}
        <span class:oculto={!(i === n - 1 || (i % passo === 0 && n - 1 - i >= passo))}
          >{p.rotulo}</span
        >
      {/each}
    </div>
    <figcaption class="legenda" aria-hidden="true">
      <span><i style="background: var(--pos)"></i>Entradas</span>
      <span><i style="background: var(--neg)"></i>Saídas</span>
    </figcaption>
  </figure>
{/if}

<style>
  .barras {
    margin: 0;
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }
  .base {
    stroke: var(--line);
    stroke-width: 1;
  }
  .eixo {
    display: grid;
    text-align: center;
    font-size: var(--s-small);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* Com muitos meses o rótulo é mais largo que a coluna: as pontas crescem para dentro. */
  .eixo span:first-child {
    justify-self: start;
    text-align: left;
  }
  .eixo span:last-child {
    justify-self: end;
    text-align: right;
  }
  .oculto {
    visibility: hidden;
  }
  .legenda {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 20px;
    font-size: var(--s-small);
    color: var(--muted);
    font-weight: 500;
  }
  .legenda span {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .legenda i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
</style>

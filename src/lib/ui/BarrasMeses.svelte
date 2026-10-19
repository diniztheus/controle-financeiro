<script module lang="ts">
  export interface BarraMes {
    rotulo: string;
    valorCentavos: number;
    /** Cor CSS da barra; sem ela, o verde da casa. */
    cor?: string;
  }
</script>

<script lang="ts">
  /**
   * Barras verticais para comparar um valor por mês (SVG próprio, sem biblioteca). Cada barra
   * pode ter cor própria. Os rótulos ficam embaixo, em HTML (legíveis em qualquer largura); o
   * resumo para leitor de tela traz todos os valores, e a tabela da tela tem os mesmos números.
   */
  import { formatarBRL } from '$lib/dominio/dinheiro';

  interface Props {
    barras: BarraMes[];
    /** Início do resumo para leitor de tela, por exemplo "Gasto total de cada mês." */
    resumo: string;
  }
  let { barras, resumo }: Props = $props();

  const L = 640;
  const ALTURA = 160;

  /** Retângulo com os dois cantos de cima arredondados (a base fica reta, sobre o filete). */
  function topoArredondado(x: number, y: number, w: number, h: number): string {
    const r = Math.max(0, Math.min(8, w / 2, h));
    return `M${x.toFixed(1)},${(y + h).toFixed(1)}V${(y + r).toFixed(1)}Q${x.toFixed(1)},${y.toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)}H${(x + w - r).toFixed(1)}Q${(x + w).toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${(y + r).toFixed(1)}V${(y + h).toFixed(1)}Z`;
  }

  const n = $derived(barras.length);
  const topo = $derived(Math.max(1, ...barras.map((b) => b.valorCentavos)));
  const largura = $derived(n ? L / n : L);
  // Com muitos meses, só alguns rótulos aparecem; a tabela da tela traz todos.
  const passo = $derived(n > 12 ? 3 : n > 6 ? 2 : 1);

  const retangulos = $derived(
    barras.map((b, i) => {
      const h = (ALTURA * b.valorCentavos) / topo;
      return {
        i,
        x: i * largura + largura * 0.18,
        y: ALTURA - h,
        w: largura * 0.64,
        h,
        cor: b.cor ?? 'var(--orange)',
      };
    }),
  );

  const descricao = $derived(
    `${resumo} ${barras.map((b) => `${b.rotulo}: ${formatarBRL(b.valorCentavos)}`).join('; ')}.`,
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
      {#each retangulos as r (r.i)}
        {#if r.h > 0}
          <path d={topoArredondado(r.x, r.y, r.w, r.h)} style="fill: {r.cor}" />
        {/if}
      {/each}
    </svg>
    <div class="eixo" aria-hidden="true" style="grid-template-columns: repeat({n}, minmax(0, 1fr))">
      {#each barras as b, i (i)}
        <span class:oculto={!(i === n - 1 || (i % passo === 0 && n - 1 - i >= passo))}
          >{b.rotulo}</span
        >
      {/each}
    </div>
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
  path {
    stroke: none;
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
</style>

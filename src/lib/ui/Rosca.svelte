<script lang="ts">
  /**
   * Gráfico de rosca (pizza com furo) feito em SVG puro: cada fatia é um arco do mesmo círculo.
   * É só desenho (aria-hidden): a lista ao lado traz os mesmos números em texto.
   */
  interface Fatia {
    valor: number;
    /** Cor CSS (ex.: corCss(c.cor)). */
    cor: string;
  }
  interface Props {
    fatias: Fatia[];
    /** Diâmetro em px. */
    tamanho?: number;
    /** Texto pequeno e valor grande no meio. */
    rotulo?: string;
    centro?: string;
  }
  let { fatias, tamanho = 180, rotulo, centro }: Props = $props();

  const R = 42;
  const C = 2 * Math.PI * R;
  const arcos = $derived.by(() => {
    const total = fatias.reduce((s, f) => s + Math.max(0, f.valor), 0);
    if (total <= 0) return [];
    // Um respiro entre as fatias, só quando há mais de uma.
    const folga = fatias.length > 1 ? 1.2 : 0;
    let inicio = 0;
    return fatias.map((f) => {
      const tam = (Math.max(0, f.valor) / total) * C;
      const arco = { cor: f.cor, tam: Math.max(0, tam - folga), inicio };
      inicio += tam;
      return arco;
    });
  });
</script>

<div class="rosca" style="--tam: {tamanho}px">
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r={R} class="fundo" />
    {#each arcos as a, i (i)}
      <circle
        cx="50"
        cy="50"
        r={R}
        stroke={a.cor}
        stroke-dasharray="{a.tam} {C - a.tam}"
        stroke-dashoffset={-a.inicio}
      />
    {/each}
  </svg>
  {#if rotulo || centro}
    <div class="meio">
      {#if rotulo}<span class="rot">{rotulo}</span>{/if}
      {#if centro}<strong class="num">{centro}</strong>{/if}
    </div>
  {/if}
</div>

<style>
  .rosca {
    position: relative;
    width: var(--tam);
    height: var(--tam);
    flex: none;
  }
  svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  circle {
    fill: none;
    stroke-width: 11;
  }
  .fundo {
    stroke: var(--step);
  }
  .meio {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    text-align: center;
    gap: 2px;
  }
  .rot {
    font-size: 0.75rem;
    color: var(--muted);
    font-weight: 600;
  }
  strong {
    font-size: 1.0625rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
</style>

<script lang="ts">
  /**
   * Gasto acumulado dia a dia: este mês (linha cheia) contra o mês anterior (linha clara).
   * SVG próprio, como na v3. O mês corrente para no dia de hoje.
   */
  import { formatarBRL, type Centavos } from '$lib/dominio/dinheiro';

  interface Props {
    atual: Centavos[];
    anterior: Centavos[];
    /** Último dia já vivido do mês (0 = mês futuro). */
    ateDia: number;
  }
  let { atual, anterior, ateDia }: Props = $props();

  const L = 640;
  const A = 240;
  const M = { e: 4, d: 4, t: 12, b: 8 };

  const dias = $derived(Math.max(atual.length, anterior.length) - 1);
  const topo = $derived(Math.max(1, ...atual.slice(0, ateDia + 1), ...anterior) * 1.08);
  const x = (d: number) => M.e + ((L - M.e - M.d) * d) / Math.max(1, dias);
  const y = (v: number) => A - M.b - ((A - M.t - M.b) * v) / topo;

  function caminho(serie: Centavos[], ate: number): string {
    const pts = serie.slice(0, ate + 1).map((v, d) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`);
    return pts.length > 1 ? `M${pts.join('L')}` : '';
  }

  const linhaAtual = $derived(caminho(atual, Math.min(ateDia, atual.length - 1)));
  const linhaAnterior = $derived(caminho(anterior, anterior.length - 1));
  const marcas = $derived([1, 10, 20, dias].filter((d, i, a) => d <= dias && a.indexOf(d) === i));
  const ultimo = $derived(atual[Math.min(ateDia, atual.length - 1)] ?? 0);
</script>

<figure class="grafico">
  <svg
    viewBox="0 0 {L} {A}"
    role="img"
    aria-label="Gasto acumulado no mês, comparado ao mês anterior"
  >
    {#if linhaAnterior}
      <path class="ant" d={linhaAnterior} />
    {/if}
    {#if linhaAtual}
      <path class="atu" d={linhaAtual} pathLength="1" />
      <circle class="pt" cx={x(Math.min(ateDia, atual.length - 1))} cy={y(ultimo)} r="5" />
    {/if}
  </svg>
  <!-- Rótulos em HTML: legíveis em qualquer largura (dentro do SVG encolheriam com ele). -->
  <div class="eixo" aria-hidden="true">
    {#each marcas as d (d)}
      <span style="left: {(x(d) / L) * 100}%" class:ini={d === 1} class:fim={d === dias}
        >dia {d}</span
      >
    {/each}
  </div>
  <figcaption class="legenda">
    <span
      ><i class="sw"></i>Este mês{#if ateDia > 0}, até o dia {ateDia}: {formatarBRL(
          ultimo,
        )}{/if}</span
    >
    <span><i class="sw ant-sw"></i>Mês anterior</span>
  </figcaption>
</figure>

<style>
  .grafico {
    margin: 0;
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }
  path {
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .atu {
    stroke: var(--orange);
    stroke-width: 2.5;
  }
  .ant {
    stroke: var(--muted);
    stroke-width: 2;
    opacity: 0.5;
  }
  .pt {
    fill: var(--orange);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .eixo {
    position: relative;
    height: 1.4em;
    margin-top: -6px;
    font-size: var(--s-small);
    color: var(--muted);
  }
  .eixo span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .eixo .ini {
    transform: none;
  }
  .eixo .fim {
    transform: translateX(-100%);
  }
  .legenda {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    font-size: var(--s-small);
    color: var(--muted);
  }
  .legenda span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    width: 14px;
    height: 4px;
    border-radius: 999px;
    background: var(--orange);
  }
  .ant-sw {
    background: var(--muted);
    opacity: 0.5;
  }
  @media (prefers-reduced-motion: no-preference) {
    .atu {
      stroke-dasharray: 1;
      animation: tracar 1.1s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    .pt {
      animation: surgir 0.4s 0.9s ease-out both;
    }
    @keyframes tracar {
      from {
        stroke-dashoffset: 1;
      }
    }
    @keyframes surgir {
      from {
        opacity: 0;
      }
    }
  }
</style>

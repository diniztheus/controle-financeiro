<script lang="ts">
  /**
   * Evolução da posição em bitcoin, dia a dia: sats acumulados (faixa de cima) e valor em reais
   * (faixa de baixo), cada uma na sua escala. A linha é em degrau, porque a quantidade só muda
   * nos dias de movimento. SVG próprio, sem biblioteca. Abaixo do gráfico, a mesma informação
   * em tabela (para leitor de tela e para quem prefere os números).
   */
  import { formatarSats, type PontoEvolucao } from '$lib/dominio/bitcoin';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import { diaCurto, diaPorExtenso } from './formato';

  interface Props {
    pontos: PontoEvolucao[];
  }
  let { pontos }: Props = $props();

  const L = 640;
  const ALTURA = 264;
  const BANDA = 104;
  const TOPO_SATS = 10;
  const TOPO_VALOR = 150;
  const M = { e: 6, d: 6 };

  type PontoComValor = PontoEvolucao & { valorCentavos: number };

  /** "2026-10-15" → número de dias desde a época (sem fuso, para o eixo não se deslocar). */
  function numeroDia(iso: string): number {
    const [a = 1970, m = 1, d = 1] = iso.split('-').map(Number);
    return Date.UTC(a, m - 1, d) / 86_400_000;
  }

  const dias = $derived(pontos.map((p) => numeroDia(p.data)));
  const d0 = $derived(dias[0] ?? 0);
  const d1 = $derived(dias.at(-1) ?? 0);
  const x = (dia: number) => (d1 === d0 ? L / 2 : M.e + ((L - M.e - M.d) * (dia - d0)) / (d1 - d0));

  const comValor = $derived(pontos.filter((p): p is PontoComValor => p.valorCentavos !== null));
  const maxSats = $derived(Math.max(1, ...pontos.map((p) => p.sats)));
  const maxValor = $derived(Math.max(1, ...comValor.map((p) => p.valorCentavos)));

  const ySats = (v: number) => TOPO_SATS + BANDA - (BANDA * v) / maxSats;
  const yValor = (v: number) => TOPO_VALOR + BANDA - (BANDA * v) / maxValor;

  const pSats = $derived(pontos.map((p) => ({ x: x(numeroDia(p.data)), y: ySats(p.sats) })));
  const pValor = $derived(
    comValor.map((p) => ({ x: x(numeroDia(p.data)), y: yValor(p.valorCentavos) })),
  );

  /** Linha em degrau: cada valor vale até o dia seguinte de movimento. */
  function degrau(pts: readonly { x: number; y: number }[]): string {
    const [primeiro, ...resto] = pts;
    if (!primeiro || resto.length === 0) return '';
    let d = `M${primeiro.x.toFixed(1)},${primeiro.y.toFixed(1)}`;
    for (const p of resto) d += `H${p.x.toFixed(1)}V${p.y.toFixed(1)}`;
    return d;
  }

  const linhaSats = $derived(degrau(pSats));
  const linhaValor = $derived(degrau(pValor));
  const ultimoSats = $derived(pSats.at(-1));
  const ultimoValor = $derived(pValor.at(-1));
  const fimSats = $derived(pontos.at(-1));
  const fimValor = $derived(comValor.at(-1));

  /** Datas do eixo: primeira, do meio e última (sem repetir). */
  const marcas = $derived.by(() => {
    const n = pontos.length;
    const idx = [0, Math.floor((n - 1) / 2), n - 1].filter(
      (i, k, a) => i >= 0 && a.indexOf(i) === k,
    );
    return idx.map((i) => ({ dia: pontos[i]!.data, left: (x(dias[i]!) / L) * 100, i }));
  });

  const resumo = $derived(
    pontos.length
      ? `Evolução da posição em bitcoin, dia a dia, de ${diaPorExtenso(pontos[0]!.data)} até ${diaPorExtenso(pontos.at(-1)!.data)}.`
      : 'Sem dados para o gráfico.',
  );
</script>

{#if pontos.length}
  <div class="grafico">
    <figure>
      <svg
        viewBox="0 0 {L} {ALTURA}"
        role="img"
        aria-label="{resumo} Sats acumulados em cima, valor em reais embaixo. A tabela abaixo tem os mesmos números."
      >
        <line class="base" x1={M.e} x2={L - M.d} y1={TOPO_SATS + BANDA} y2={TOPO_SATS + BANDA} />
        <line class="base" x1={M.e} x2={L - M.d} y1={TOPO_VALOR + BANDA} y2={TOPO_VALOR + BANDA} />
        {#if linhaSats}
          <path class="sats" d={linhaSats} />
        {/if}
        {#if linhaValor}
          <path class="valor" d={linhaValor} />
        {/if}
        {#if ultimoSats}
          <circle class="ponto sats-ponto" cx={ultimoSats.x} cy={ultimoSats.y} r="4.5" />
        {/if}
        {#if ultimoValor}
          <circle class="ponto valor-ponto" cx={ultimoValor.x} cy={ultimoValor.y} r="4.5" />
        {/if}
      </svg>
      <!-- Datas em HTML: legíveis em qualquer largura (dentro do SVG encolheriam com ele). -->
      <div class="eixo" aria-hidden="true">
        {#each marcas as m (m.i)}
          <span style="left: {m.left}%" class:ini={m.i === 0} class:fim={m.i === pontos.length - 1}
            >{diaCurto(m.dia)}</span
          >
        {/each}
      </div>
      <figcaption class="legenda">
        <span><i class="sw sats-sw"></i>Sats: {fimSats ? formatarSats(fimSats.sats) : '—'}</span>
        <span
          ><i class="sw valor-sw"></i>Valor:
          {fimValor ? formatarBRL(fimValor.valorCentavos) : 'sem preço do BTC'}</span
        >
      </figcaption>
    </figure>

    <details class="tabela-wrap">
      <summary>Ver os números dia a dia</summary>
      <div class="rolagem">
        <table>
          <caption class="sr">Evolução dia a dia</caption>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Sats acumulados</th>
              <th scope="col">Valor em R$</th>
            </tr>
          </thead>
          <tbody>
            {#each pontos as p (p.data)}
              <tr>
                <td>{diaPorExtenso(p.data)}</td>
                <td class="num">{formatarSats(p.sats)}</td>
                <td class="num">
                  {p.valorCentavos === null ? 'sem preço' : formatarBRL(p.valorCentavos)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </details>
  </div>
{:else}
  <p class="vazio">O gráfico aparece quando houver a primeira compra ou um preço do BTC.</p>
{/if}

<style>
  .grafico {
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  figure {
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
  .base {
    stroke: var(--line);
    stroke-width: 1;
  }
  path {
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
    stroke-width: 2.5;
  }
  .sats {
    stroke: var(--ink);
  }
  .valor {
    stroke: var(--orange);
  }
  .sats-ponto {
    fill: var(--ink);
  }
  .valor-ponto {
    fill: var(--orange);
  }
  .eixo {
    position: relative;
    height: 1.4em;
    margin-top: -6px;
    font-size: var(--s-small);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
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
    gap: 6px 16px;
    flex-wrap: wrap;
    font-size: var(--s-small);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .legenda span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    width: 14px;
    height: 4px;
    background: var(--ink);
  }
  .valor-sw {
    background: var(--orange);
  }
  .tabela-wrap summary {
    cursor: pointer;
    color: var(--ink);
    font-weight: 600;
    font-size: 0.9375rem;
    text-underline-offset: 4px;
    min-height: 44px;
    display: flex;
    align-items: center;
  }
  .rolagem {
    position: relative;
    max-height: 320px;
    overflow: auto;
    margin-top: 8px;
    border-radius: var(--r);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--s-small);
  }
  th,
  td {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  th {
    color: var(--muted);
    font-weight: 600;
    position: sticky;
    top: 0;
    background: var(--surface);
  }
  td.num {
    text-align: right;
  }
  .vazio {
    color: var(--muted);
    font-size: 0.9375rem;
  }
</style>

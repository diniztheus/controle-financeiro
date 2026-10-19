<script lang="ts">
  /**
   * Patrimônio mês a mês: uma coluna por mês, com as contas embaixo e o bitcoin em cima (SVG
   * próprio, sem biblioteca). Abaixo, a mesma informação em tabela, para leitor de tela e para
   * quem prefere os números. Sem saldo registrado, a tela diz o que fazer.
   */
  import { resolve } from '$app/paths';
  import { nomeMes, nomeMesCurto } from '$lib/dominio/datas';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import type { PontoPatrimonio } from '$lib/dominio/relatorios';

  interface Props {
    /** `dividaCartaoCentavos` (parcelas em faturas não pagas) já vem descontado no `totalCentavos`. */
    pontos: (PontoPatrimonio & { dividaCartaoCentavos?: number })[];
  }
  let { pontos }: Props = $props();

  const L = 640;
  const ALTURA = 200;

  const n = $derived(pontos.length);
  /** A coluna de cartões só aparece quando algum mês tem dívida de cartão. */
  const temDivida = $derived(pontos.some((p) => (p.dividaCartaoCentavos ?? 0) > 0));
  const largura = $derived(n ? L / n : L);
  const passo = $derived(n > 12 ? 3 : n > 6 ? 2 : 1);
  const temSaldo = $derived(pontos.some((p) => p.temSaldo));
  const temAlgo = $derived(pontos.some((p) => p.temSaldo || p.bitcoinCentavos > 0));
  // Escala pela soma bruta (contas + bitcoin): o total líquido pode ser negativo com dívida de cartão.
  const topo = $derived(
    Math.max(
      1,
      ...pontos.map((p) => Math.max(0, p.contasCentavos) + Math.max(0, p.bitcoinCentavos)),
    ),
  );

  const colunas = $derived(
    pontos.map((p, i) => {
      const hContas = (ALTURA * p.contasCentavos) / topo;
      const hBtc = (ALTURA * p.bitcoinCentavos) / topo;
      return {
        i,
        x: i * largura + largura * 0.18,
        w: largura * 0.64,
        hContas,
        yContas: ALTURA - hContas,
        hBtc,
        yBtc: ALTURA - hContas - hBtc,
      };
    }),
  );

  const primeiro = $derived(pontos[0]);
  const ultimo = $derived(pontos.at(-1));
  const resumo = $derived(
    primeiro && ultimo
      ? `Patrimônio mês a mês, de ${nomeMes(primeiro.mes)} a ${nomeMes(ultimo.mes)}, com contas embaixo e bitcoin em cima. Em ${nomeMes(ultimo.mes)} o total é ${formatarBRL(ultimo.totalCentavos)}. A tabela abaixo tem os mesmos números.`
      : '',
  );

  const rotuloMes = (mes: string) => `${nomeMesCurto(mes)}/${mes.slice(2, 4)}`;

  /** Retângulo com os dois cantos de cima arredondados (só o segmento de cima da coluna). */
  function topoArredondado(x: number, y: number, w: number, h: number): string {
    const r = Math.max(0, Math.min(8, w / 2, h));
    return `M${x.toFixed(1)},${(y + h).toFixed(1)}V${(y + r).toFixed(1)}Q${x.toFixed(1)},${y.toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)}H${(x + w - r).toFixed(1)}Q${(x + w).toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${(y + r).toFixed(1)}V${(y + h).toFixed(1)}Z`;
  }
</script>

{#if !n}
  <p class="vazio">Sem meses para mostrar.</p>
{:else if !temAlgo}
  <div class="aviso">
    <strong>Ainda não há saldos registrados</strong>
    <p>
      O patrimônio aparece aqui depois que você informar o saldo de uma conta e, se tiver bitcoin,
      depois da primeira compra ou de um preço do BTC. Atualize o saldo na tela
      <a href={resolve('/contas')}>Contas</a>; cada atualização vira um ponto no histórico.
    </p>
  </div>
{:else}
  {#if !temSaldo}
    <p class="aviso-curto">
      Nenhuma conta tem saldo registrado até o fim destes meses. O gráfico mostra só o bitcoin.
    </p>
  {/if}
  <figure>
    <svg viewBox="0 0 {L} {ALTURA}" role="img" aria-label={resumo}>
      <line class="base" x1="0" x2={L} y1={ALTURA} y2={ALTURA} />
      {#each colunas as c (c.i)}
        {#if c.hContas > 0}
          {#if c.hBtc > 0}
            <rect class="contas" x={c.x} y={c.yContas} width={c.w} height={c.hContas} />
          {:else}
            <path class="contas" d={topoArredondado(c.x, c.yContas, c.w, c.hContas)} />
          {/if}
        {/if}
        {#if c.hBtc > 0}
          <path class="btc" d={topoArredondado(c.x, c.yBtc, c.w, c.hBtc)} />
        {/if}
      {/each}
    </svg>
    <div class="eixo" aria-hidden="true" style="grid-template-columns: repeat({n}, minmax(0, 1fr))">
      {#each pontos as p, i (p.mes)}
        <span class:oculto={!(i === n - 1 || (i % passo === 0 && n - 1 - i >= passo))}
          >{rotuloMes(p.mes)}</span
        >
      {/each}
    </div>
    <figcaption class="legenda">
      <span><i class="sw contas-sw"></i>Contas</span>
      <span><i class="sw btc-sw"></i>Bitcoin</span>
      {#if ultimo}
        <span>Total em {nomeMesCurto(ultimo.mes)}: {formatarBRL(ultimo.totalCentavos)}</span>
      {/if}
    </figcaption>
  </figure>

  <details class="tabela-wrap">
    <summary>Ver os números mês a mês</summary>
    <div class="rolagem">
      <table>
        <caption class="sr">Patrimônio mês a mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col" class="num">Contas</th>
            <th scope="col" class="num">Bitcoin</th>
            {#if temDivida}<th scope="col" class="num">Cartões a pagar</th>{/if}
            <th scope="col" class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {#each pontos as p (p.mes)}
            <tr>
              <td>{nomeMes(p.mes)}</td>
              <td class="num">{p.temSaldo ? formatarBRL(p.contasCentavos) : 'sem saldo'}</td>
              <td class="num">{formatarBRL(p.bitcoinCentavos)}</td>
              {#if temDivida}
                <td class="num">
                  {(p.dividaCartaoCentavos ?? 0) > 0
                    ? formatarBRL(-(p.dividaCartaoCentavos ?? 0))
                    : formatarBRL(0)}
                </td>
              {/if}
              <td class="num">{formatarBRL(p.totalCentavos)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </details>
{/if}

<style>
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
  .contas {
    fill: var(--orange);
  }
  .btc {
    fill: var(--c2);
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
    height: 10px;
    border-radius: 999px;
    background: var(--orange);
  }
  .btc-sw {
    background: var(--c2);
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
  td.num,
  th.num {
    text-align: right;
  }
  .aviso {
    display: grid;
    gap: 6px;
    padding: 14px 16px;
    border-left: 3px solid var(--warn);
    background: var(--surface);
    border-radius: var(--r);
    font-size: 0.9375rem;
  }
  .aviso p {
    color: var(--muted);
  }
  .aviso a {
    color: var(--ink);
    font-weight: 600;
    text-underline-offset: 4px;
  }
  .aviso-curto,
  .vazio {
    color: var(--muted);
    font-size: 0.9375rem;
  }
</style>

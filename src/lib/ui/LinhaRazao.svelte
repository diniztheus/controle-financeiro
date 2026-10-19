<script lang="ts">
  /**
   * Uma linha do razão alinhado na vírgula (v3): rótulo à esquerda, parte inteira grande
   * alinhada à direita e a "cauda" (",56", "KB"…) numa coluna fixa logo depois.
   * Passe `centavos` para dinheiro, ou `inteiro` + `cauda` para outras grandezas.
   */
  import { separarValor, type Centavos } from '$lib/dominio/dinheiro';

  interface Props {
    rotulo: string;
    detalhe?: string;
    centavos?: Centavos;
    inteiro?: string;
    cauda?: string;
    total?: boolean;
    testid?: string;
  }

  let { rotulo, detalhe, centavos, inteiro, cauda = '', total = false, testid }: Props = $props();

  const partes = $derived.by(() => {
    if (centavos !== undefined) {
      const p = separarValor(centavos);
      return { inteiro: p.sinal + p.inteiro, cauda: ',' + p.centavos };
    }
    return { inteiro: inteiro ?? '', cauda };
  });
</script>

<div class="lrow" class:total data-testid={testid}>
  <span class="lb">
    {rotulo}
    {#if detalhe}<small>{detalhe}</small>{/if}
  </span>
  <span class="li num">{partes.inteiro}</span>
  <span class="lc num">{partes.cauda}</span>
</div>

<style>
  .lrow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 3.2em;
    align-items: baseline;
    column-gap: 2px;
    padding: 14px 16px;
    border-radius: 14px;
    background: var(--paper);
    color: var(--ink);
  }
  .lb {
    font-size: 0.9375rem;
    font-weight: 500;
    min-width: 0;
  }
  .lb small {
    display: block;
    font-size: var(--s-small);
    font-weight: 400;
    color: var(--muted);
  }
  .li {
    font-size: clamp(1.5rem, 1rem + 1.8vw, 2.5rem);
    font-weight: 600;
    letter-spacing: -0.03em;
    text-align: right;
    line-height: 1;
  }
  .lc {
    font-size: clamp(1rem, 0.8rem + 0.8vw, 1.5rem);
    font-weight: 600;
    text-align: left;
    line-height: 1;
    padding-left: 0.12em;
  }
  .total {
    background: var(--orange-soft);
    color: var(--ink);
  }
</style>

<script lang="ts">
  /**
   * Valor em reais com os centavos menores, como na v3: "R$ 1.234,56".
   * `moeda` mostra o "R$" pequeno na frente.
   */
  import { separarValor, type Centavos } from '$lib/dominio/dinheiro';

  interface Props {
    centavos: Centavos;
    moeda?: boolean;
    class?: string;
    testid?: string;
  }
  let { centavos, moeda = true, class: classe = '', testid }: Props = $props();
  const p = $derived(separarValor(centavos));
</script>

<span class="valor num {classe}" data-testid={testid}
  >{#if moeda}<span class="cur">R$</span>{/if}{p.sinal}{p.inteiro}<span class="cts"
    >,{p.centavos}</span
  ></span
>

<style>
  .valor {
    white-space: nowrap;
  }
  .cur {
    font-size: 0.4em;
    vertical-align: 0.8em;
    margin-right: 0.15em;
    font-weight: 600;
    letter-spacing: 0;
  }
  .cts {
    font-size: 0.55em;
    letter-spacing: -0.02em;
  }
</style>

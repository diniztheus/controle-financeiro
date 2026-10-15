<script lang="ts">
  /** Escolha de cor entre as 11 da paleta (rádios com o quadradinho da cor). */
  import { CORES } from '$lib/dominio/categorias';
  import { corCss, NOMES_CORES } from './formato';

  interface Props {
    nome?: string;
    valor: string | null;
    /** Prefixo único para os ids (uma página pode ter vários). */
    id: string;
    /** Opção "automática" (a próxima cor livre). */
    automatica?: boolean;
  }
  let { nome = 'cor', valor, id, automatica = false }: Props = $props();
</script>

<fieldset class="cores">
  <legend class="lbl">Cor</legend>
  <div class="opcoes">
    {#if automatica}
      <label class="op auto" title="Automática">
        <input type="radio" name={nome} value="" checked={!valor} />
        <span>Auto</span>
      </label>
    {/if}
    {#each CORES as c (c)}
      <label class="op" title={NOMES_CORES[c]} for="{id}-{c}">
        <input id="{id}-{c}" type="radio" name={nome} value={c} checked={valor === c} />
        <i style="--cc: {corCss(c)}"></i>
        <span class="sr">{NOMES_CORES[c]}</span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .cores {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  legend {
    padding: 0;
    margin-bottom: 6px;
  }
  .opcoes {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .op {
    position: relative;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    background: var(--chip-bg, var(--paper));
    cursor: pointer;
    transition: transform var(--t);
  }
  .op:active {
    transform: scale(0.94);
  }
  .op.auto {
    width: auto;
    padding-inline: 10px;
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .op input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: pointer;
  }
  .op i {
    width: 20px;
    height: 20px;
    background: var(--cc);
  }
  .op:has(input:checked) {
    background: var(--ink);
    color: var(--paper);
  }
  .op:has(input:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
</style>

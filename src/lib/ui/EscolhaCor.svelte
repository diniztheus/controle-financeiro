<script lang="ts">
  /** Escolha de cor entre as 11 da paleta (bolinhas redondas; a escolhida tem anel). */
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
    gap: 6px;
  }
  .op {
    position: relative;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    cursor: pointer;
    transition: transform var(--t);
  }
  .op:active {
    transform: scale(0.94);
  }
  .op.auto {
    width: auto;
    height: 44px;
    padding-inline: 16px;
    border-radius: 999px;
    background: var(--step);
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 600;
  }
  .op input {
    position: absolute;
    /* Rádio invisível de 1px no meio da opção: o clique no texto vai para o rótulo,
       e o próprio rádio continua clicável. */
    top: 50%;
    left: 50%;
    width: 1px;
    height: 1px;
    min-height: 0;
    padding: 0;
    opacity: 0;
    margin: 0;
    cursor: pointer;
  }
  .op i {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--cc);
    transition: box-shadow var(--t);
  }
  /* Bolinha escolhida: anel na cor do texto, com um vão do fundo do cartão */
  .op:has(input:checked) i {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--ink);
  }
  .op.auto:has(input:checked) {
    background: var(--ink);
    color: var(--paper);
    box-shadow: none;
  }
  .op:has(input:focus-visible) {
    outline: 2px solid var(--orange);
    outline-offset: 2px;
  }
</style>

<script lang="ts">
  /**
   * Formulário de gasto à vista (novo ou editar). Funciona sem JavaScript; com ele, envia sem
   * recarregar a página. Categoria em botões de escolha (rádio), como os chips da v3.
   *
   * Depois de lançar, só valor e descrição são limpos: data e categoria ficam como estavam,
   * para lançar vários gastos seguidos. O foco volta ao valor; em erro, vai ao primeiro campo
   * com problema.
   */
  import { enhance } from '$app/forms';
  import { centavosParaCampo } from '$lib/dominio/dinheiro';
  import { corCss } from './formato';
  import { focarPrimeiroErro } from './formularios';

  interface Opcao {
    id: string;
    nome: string;
    cor?: string | null;
  }
  interface Inicial {
    valorCentavos?: number;
    descricao?: string | null;
    categoriaId?: string | null;
    data: string;
    contaId?: string | null;
  }
  interface Props {
    acao: string;
    rotulo: string;
    categorias: Opcao[];
    contas: Opcao[];
    inicial: Inicial;
    /** Erros e valores devolvidos pelo servidor quando algo falhou. */
    erros?: Record<string, string> | undefined;
    erro?: string | undefined;
    valores?: Record<string, string> | undefined;
    id?: string;
  }
  let {
    acao,
    rotulo,
    categorias,
    contas,
    inicial,
    erros,
    erro,
    valores,
    id = 'g',
  }: Props = $props();

  let enviando = $state(false);
  let campoValor: HTMLInputElement | undefined = $state();
  let campoDescricao: HTMLInputElement | undefined = $state();

  const v = $derived({
    valor:
      valores?.valor ?? (inicial.valorCentavos ? centavosParaCampo(inicial.valorCentavos) : ''),
    descricao: valores?.descricao ?? inicial.descricao ?? '',
    categoriaId: valores?.categoriaId ?? inicial.categoriaId ?? categorias[0]?.id ?? '',
    data: valores?.data ?? inicial.data,
    contaId: valores?.contaId ?? inicial.contaId ?? '',
  });

  /** Atributos de acessibilidade de um campo com (ou sem) erro. */
  const aria = (campo: string) =>
    erros?.[campo]
      ? { 'aria-invalid': 'true' as const, 'aria-describedby': `${id}-${campo}-erro` }
      : {};
</script>

<form
  class="fg"
  method="POST"
  action={acao}
  autocomplete="off"
  use:enhance={({ formElement }) => {
    enviando = true;
    return async ({ result, update }) => {
      await update({ reset: false });
      enviando = false;
      if (result.type === 'success') {
        if (campoValor) campoValor.value = '';
        if (campoDescricao) campoDescricao.value = '';
        campoValor?.focus();
      } else if (result.type === 'failure') {
        focarPrimeiroErro(formElement);
      }
    };
  }}
>
  <div class="field big">
    <label for="{id}-valor">Valor (R$)</label>
    <input
      id="{id}-valor"
      name="valor"
      inputmode="decimal"
      placeholder="0,00"
      required
      value={v.valor}
      bind:this={campoValor}
      {...aria('valor')}
    />
    {#if erros?.valor}<span class="err" id="{id}-valor-erro">{erros.valor}</span>{/if}
  </div>

  <div class="field">
    <label for="{id}-desc">Descrição <span class="opc">opcional</span></label>
    <input
      id="{id}-desc"
      name="descricao"
      maxlength="120"
      placeholder="Ex.: almoço, Uber, farmácia"
      value={v.descricao}
      bind:this={campoDescricao}
      {...aria('descricao')}
    />
    {#if erros?.descricao}<span class="err" id="{id}-descricao-erro">{erros.descricao}</span>{/if}
  </div>

  <fieldset class="field" {...aria('categoriaId')}>
    <legend class="lbl">Categoria</legend>
    <div class="chips">
      {#each categorias as c (c.id)}
        <label class="chip">
          <input
            type="radio"
            name="categoriaId"
            value={c.id}
            checked={c.id === v.categoriaId}
            required
          />
          <i class="sq" style="--cc: {corCss(c.cor)}"></i>{c.nome}
        </label>
      {/each}
    </div>
    {#if erros?.categoriaId}<span class="err" id="{id}-categoriaId-erro">{erros.categoriaId}</span
      >{/if}
  </fieldset>

  <div class="duo">
    <div class="field">
      <label for="{id}-data">Data</label>
      <input id="{id}-data" name="data" type="date" required value={v.data} {...aria('data')} />
      {#if erros?.data}<span class="err" id="{id}-data-erro">{erros.data}</span>{/if}
    </div>
    <div class="field">
      <label for="{id}-conta">Pago com <span class="opc">opcional</span></label>
      <select id="{id}-conta" name="contaId" value={v.contaId} {...aria('contaId')}>
        <option value="">Não informar</option>
        {#each contas as c (c.id)}
          <option value={c.id}>{c.nome}</option>
        {/each}
      </select>
      {#if erros?.contaId}<span class="err" id="{id}-contaId-erro">{erros.contaId}</span>{/if}
    </div>
  </div>

  <p class="hint">O saldo da conta não muda: saldos são atualizados por você, em Contas.</p>

  {#if erro}<p class="err" role="alert">{erro}</p>{/if}

  <div class="acts">
    <button class="btn ink" type="submit" disabled={enviando}>
      {enviando ? 'Salvando…' : rotulo}
    </button>
  </div>
</form>

<style>
  .fg {
    display: grid;
    gap: 16px;
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  legend {
    padding: 0;
    margin-bottom: 6px;
  }
  .opc {
    font-weight: 400;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    position: relative;
    background: var(--chip-bg, var(--paper));
    padding: 8px 12px 8px 10px;
    font-size: 0.875rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    cursor: pointer;
    transition:
      background-color var(--t),
      color var(--t),
      transform var(--t);
  }
  .chip:hover {
    background: var(--step);
  }
  .chip:active {
    transform: scale(0.97);
  }
  .chip input {
    position: absolute;
    opacity: 0;
    inset: 0;
    margin: 0;
    cursor: pointer;
  }
  .chip:has(input:checked) {
    background: var(--ink);
    color: var(--paper);
  }
  .chip:has(input:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .chip .sq {
    width: 10px;
    height: 10px;
  }
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>

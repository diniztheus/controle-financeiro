<script lang="ts">
  /**
   * Formulário de receita (nova ou editar). Funciona sem JavaScript; com ele, envia sem
   * recarregar a página. Categoria em botões de escolha (rádio), como em FormGasto.
   *
   * Depois de lançar, só valor, descrição e observação são limpos: data, categoria e conta
   * ficam como estavam, para lançar várias receitas seguidas. O foco volta ao valor; em erro,
   * vai ao primeiro campo com problema.
   */
  import { enhance } from '$app/forms';
  import { centavosParaCampo } from '$lib/dominio/dinheiro';
  import { focarPrimeiroErro } from './formularios';

  interface Opcao {
    id: string;
    nome: string;
  }
  interface Inicial {
    valorCentavos?: number;
    descricao?: string | null;
    categoria?: string | null;
    data: string;
    contaId?: string | null;
    observacao?: string | null;
  }
  interface Props {
    acao: string;
    rotulo: string;
    /** Categorias de receita (fixas no domínio). */
    categorias: readonly string[];
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
    id = 'r',
  }: Props = $props();

  let enviando = $state(false);
  let campoValor: HTMLInputElement | undefined = $state();
  let campoDescricao: HTMLInputElement | undefined = $state();
  let campoObservacao: HTMLTextAreaElement | undefined = $state();

  const v = $derived({
    valor:
      valores?.valor ?? (inicial.valorCentavos ? centavosParaCampo(inicial.valorCentavos) : ''),
    descricao: valores?.descricao ?? inicial.descricao ?? '',
    categoria: valores?.categoria ?? inicial.categoria ?? categorias[0] ?? '',
    data: valores?.data ?? inicial.data,
    contaId: valores?.conta ?? inicial.contaId ?? '',
    observacao: valores?.observacao ?? inicial.observacao ?? '',
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
        if (campoObservacao) campoObservacao.value = '';
        campoValor?.focus();
      } else if (result.type === 'failure') {
        await focarPrimeiroErro(formElement);
      }
    };
  }}
>
  <div class="campo-valor">
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
      placeholder="Ex.: salário de outubro, reembolso da viagem"
      value={v.descricao}
      bind:this={campoDescricao}
      {...aria('descricao')}
    />
    {#if erros?.descricao}<span class="err" id="{id}-descricao-erro">{erros.descricao}</span>{/if}
  </div>

  <fieldset class="campo" {...aria('categoria')}>
    <legend class="lbl">Categoria</legend>
    <div class="pilulas escolhas">
      {#each categorias as c (c)}
        <label>
          <input type="radio" name="categoria" value={c} checked={c === v.categoria} required />
          {c}
        </label>
      {/each}
    </div>
    {#if erros?.categoria}<span class="err" id="{id}-categoria-erro">{erros.categoria}</span>{/if}
  </fieldset>

  <div class="duo">
    <div class="field">
      <label for="{id}-data">Data</label>
      <input id="{id}-data" name="data" type="date" required value={v.data} {...aria('data')} />
      {#if erros?.data}<span class="err" id="{id}-data-erro">{erros.data}</span>{/if}
    </div>
    <div class="field">
      <label for="{id}-conta">Recebido em <span class="opc">opcional</span></label>
      <select id="{id}-conta" name="conta" value={v.contaId} {...aria('conta')}>
        <option value="">Não informar</option>
        {#each contas as c (c.id)}
          <option value={c.id}>{c.nome}</option>
        {/each}
      </select>
      {#if erros?.conta}<span class="err" id="{id}-conta-erro">{erros.conta}</span>{/if}
    </div>
  </div>

  <div class="field">
    <label for="{id}-obs">Observação <span class="opc">opcional</span></label>
    <textarea
      id="{id}-obs"
      name="observacao"
      rows="2"
      maxlength="500"
      value={v.observacao}
      bind:this={campoObservacao}
      {...aria('observacao')}></textarea>
    {#if erros?.observacao}<span class="err" id="{id}-observacao-erro">{erros.observacao}</span
      >{/if}
  </div>

  <p class="hint">O saldo da conta não muda: saldos são atualizados por você, em Contas.</p>

  {#if erro}<p class="err" role="alert">{erro}</p>{/if}

  <div class="acts">
    <button class="btn go" type="submit" disabled={enviando}>
      {enviando ? 'Salvando…' : rotulo}
    </button>
  </div>
</form>

<style>
  .fg {
    display: grid;
    gap: 16px;
  }
  /* Valor em destaque: caixa verde suave, número grande na cor de entrada */
  .campo-valor {
    display: grid;
    gap: 4px;
    padding: 18px 20px;
    border-radius: var(--r-card);
    background: var(--pos-soft);
    color: var(--pos);
  }
  .campo-valor:focus-within {
    box-shadow: 0 0 0 3px var(--orange-soft);
  }
  .campo-valor:has(input[aria-invalid='true']) {
    box-shadow: 0 0 0 3px var(--neg-soft);
  }
  .campo-valor label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--pos);
  }
  .campo-valor input {
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--pos);
    font-size: clamp(2rem, 1.6rem + 2vw, 2.75rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.1;
    outline: none;
  }
  .campo-valor input::placeholder {
    color: color-mix(in srgb, var(--pos) 40%, transparent);
  }
  .campo-valor .err {
    color: var(--neg);
  }
  .campo {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
    display: grid;
    gap: 6px;
  }
  legend {
    padding: 0;
    margin-bottom: 6px;
  }
  .opc {
    font-weight: 400;
  }
  /* Categorias como pílulas de escolha (alvo de 44px) */
  .pilulas.escolhas {
    display: flex;
    flex-wrap: wrap;
    border-radius: var(--r-card);
    gap: 4px;
  }
  .escolhas > label {
    position: relative;
    min-height: 44px;
    padding: 0 14px;
    cursor: pointer;
    transition:
      background-color var(--t),
      color var(--t),
      transform var(--t);
  }
  .escolhas > label:active {
    transform: scale(0.97);
  }
  .escolhas input {
    position: absolute;
    /* Rádio invisível de 1px no meio da opção: o clique no texto vai para o rótulo,
       e o próprio rádio continua clicável. */
    top: 50%;
    left: 50%;
    width: 1px;
    height: 1px;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    opacity: 0;
    cursor: pointer;
  }
  .escolhas > label:has(input:focus-visible) {
    outline: 2px solid var(--orange);
    outline-offset: 2px;
  }
  textarea {
    width: 100%;
    border: 1px solid transparent;
    border-radius: var(--r);
    background: var(--paper);
    padding: 11px 14px;
    min-width: 0;
    font: inherit;
    resize: vertical;
  }
  :global(.sec:not(.alt)) textarea {
    background: var(--surface);
  }
  textarea:focus {
    outline: none;
    border-color: var(--orange);
    background: var(--surface);
    box-shadow: 0 0 0 3px var(--orange-soft);
  }
  textarea[aria-invalid='true'] {
    border-color: var(--neg);
    box-shadow: 0 0 0 3px var(--neg-soft);
  }
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .acts .btn {
    flex: 1 1 auto;
  }
</style>

<script lang="ts">
  /**
   * Formulário de receita recorrente (nova ou editar). Funciona sem JavaScript; com ele, envia
   * sem recarregar a página. Mesmo padrão de FormReceita: categoria em botões de escolha.
   *
   * Depois de criar, só valor, descrição e observação são limpos: dia, datas, categoria e conta
   * ficam, para cadastrar vários modelos seguidos. Em erro, o foco vai ao primeiro campo com
   * problema.
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
    diaDoMes?: number;
    inicio: string;
    fim?: string | null;
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
    id = 'rr',
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
    dia: valores?.dia ?? (inicial.diaDoMes ? String(inicial.diaDoMes) : ''),
    inicio: valores?.inicio ?? inicial.inicio,
    fim: valores?.fim ?? inicial.fim ?? '',
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
      if (result.type === 'success' || result.type === 'redirect') {
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
      placeholder="Ex.: salário da empresa, bolsa de pesquisa"
      value={v.descricao}
      bind:this={campoDescricao}
      {...aria('descricao')}
    />
    {#if erros?.descricao}<span class="err" id="{id}-descricao-erro">{erros.descricao}</span>{/if}
  </div>

  <fieldset class="field" {...aria('categoria')}>
    <legend class="lbl">Categoria</legend>
    <div class="chips">
      {#each categorias as c (c)}
        <label class="chip">
          <input type="radio" name="categoria" value={c} checked={c === v.categoria} required />
          {c}
        </label>
      {/each}
    </div>
    {#if erros?.categoria}<span class="err" id="{id}-categoria-erro">{erros.categoria}</span>{/if}
  </fieldset>

  <div class="duo">
    <div class="field">
      <label for="{id}-dia">Dia do mês</label>
      <input
        id="{id}-dia"
        name="dia"
        type="number"
        inputmode="numeric"
        min="1"
        max="31"
        step="1"
        placeholder="Ex.: 5"
        required
        value={v.dia}
        {...aria('dia')}
      />
      {#if erros?.dia}<span class="err" id="{id}-dia-erro">{erros.dia}</span>{/if}
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

  <div class="duo">
    <div class="field">
      <label for="{id}-inicio">A partir de</label>
      <input
        id="{id}-inicio"
        name="inicio"
        type="date"
        required
        value={v.inicio}
        {...aria('inicio')}
      />
      {#if erros?.inicio}<span class="err" id="{id}-inicio-erro">{erros.inicio}</span>{/if}
    </div>
    <div class="field">
      <label for="{id}-fim">Até <span class="opc">opcional</span></label>
      <input id="{id}-fim" name="fim" type="date" value={v.fim} {...aria('fim')} />
      {#if erros?.fim}<span class="err" id="{id}-fim-erro">{erros.fim}</span>{/if}
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

  <p class="hint">
    O site lança uma receita por mês, no dia escolhido. Dia 31 cai no último dia dos meses curtos.
    Só entram os meses já chegados: nada é lançado antes de "A partir de" nem depois de hoje.
  </p>

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
    padding: 8px 12px;
    font-size: 0.875rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
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
  textarea {
    width: 100%;
    border: 0;
    border-radius: var(--r);
    background: var(--paper);
    padding: 11px 12px;
    min-width: 0;
    font: inherit;
    resize: vertical;
  }
  :global(.sec:not(.alt)) textarea {
    background: var(--surface);
  }
  textarea:focus {
    outline: 2px solid var(--ink);
    outline-offset: 0;
  }
  textarea[aria-invalid='true'] {
    outline: 2px solid var(--neg);
    outline-offset: 0;
  }
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>

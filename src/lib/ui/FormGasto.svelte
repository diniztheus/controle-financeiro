<script lang="ts">
  /**
   * Formulário de gasto à vista (novo ou editar). Funciona sem JavaScript; com ele, envia sem
   * recarregar a página. Categoria em botões de escolha (rádio), como os chips da v3.
   */
  import { enhance } from '$app/forms';
  import { centavosParaCampo } from '$lib/dominio/dinheiro';
  import { corCss } from './formato';

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
    /** Foco no valor ao abrir (página de novo gasto). */
    focar?: boolean;
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
    focar = false,
    id = 'g',
  }: Props = $props();

  let enviando = $state(false);

  const v = $derived({
    valor:
      valores?.valor ?? (inicial.valorCentavos ? centavosParaCampo(inicial.valorCentavos) : ''),
    descricao: valores?.descricao ?? inicial.descricao ?? '',
    categoriaId: valores?.categoriaId ?? inicial.categoriaId ?? categorias[0]?.id ?? '',
    data: valores?.data ?? inicial.data,
    contaId: valores?.contaId ?? inicial.contaId ?? '',
  });

  function autofoco(el: HTMLInputElement) {
    if (focar) el.focus();
  }
</script>

<form
  class="fg"
  method="POST"
  action={acao}
  autocomplete="off"
  use:enhance={() => {
    enviando = true;
    return async ({ update }) => {
      await update();
      enviando = false;
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
      aria-invalid={erros?.valor ? 'true' : undefined}
      aria-describedby={erros?.valor ? `${id}-valor-erro` : undefined}
      use:autofoco
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
    />
    {#if erros?.descricao}<span class="err">{erros.descricao}</span>{/if}
  </div>

  <fieldset class="field">
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
    {#if erros?.categoriaId}<span class="err">{erros.categoriaId}</span>{/if}
  </fieldset>

  <div class="duo">
    <div class="field">
      <label for="{id}-data">Data</label>
      <input id="{id}-data" name="data" type="date" required value={v.data} />
      {#if erros?.data}<span class="err">{erros.data}</span>{/if}
    </div>
    <div class="field">
      <label for="{id}-conta">Pago com <span class="opc">opcional</span></label>
      <select id="{id}-conta" name="contaId" value={v.contaId}>
        <option value="">Não informar</option>
        {#each contas as c (c.id)}
          <option value={c.id}>{c.nome}</option>
        {/each}
      </select>
      {#if erros?.contaId}<span class="err">{erros.contaId}</span>{/if}
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
    min-height: 40px;
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

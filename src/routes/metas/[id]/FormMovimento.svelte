<script lang="ts">
  /**
   * Guardar ou retirar de uma meta. Só mexe no progresso da meta: não toca em conta nem no
   * patrimônio. Funciona sem JavaScript; com ele, envia sem recarregar e limpa valor e nota.
   */
  import { enhance } from '$app/forms';
  import { focarPrimeiroErro } from '$lib/ui/formularios';

  interface Props {
    acao: string;
    /** Data padrão (hoje). */
    hoje: string;
    erros?: Record<string, string> | undefined;
    erro?: string | undefined;
    valores?: Record<string, string> | undefined;
    id?: string;
  }
  let { acao, hoje, erros, erro, valores, id = 'mov' }: Props = $props();

  let enviando = $state(false);

  const aria = (campo: string) =>
    erros?.[campo]
      ? { 'aria-invalid': 'true' as const, 'aria-describedby': `${id}-${campo}-erro` }
      : {};
</script>

<form
  class="fmov"
  method="POST"
  action={acao}
  autocomplete="off"
  use:enhance={({ formElement }) => {
    enviando = true;
    return async ({ result, update }) => {
      await update({ reset: false });
      if (result.type === 'success') {
        const valor = formElement.querySelector<HTMLInputElement>('input[name="valor"]');
        const nota = formElement.querySelector<HTMLInputElement>('input[name="nota"]');
        const data = formElement.querySelector<HTMLInputElement>('input[name="data"]');
        if (valor) valor.value = '';
        if (nota) nota.value = '';
        if (data) data.value = hoje;
      }
      enviando = false;
      if (result.type === 'failure') await focarPrimeiroErro(formElement);
    };
  }}
>
  <fieldset class="field">
    <legend class="lbl">O que fazer</legend>
    <div class="pilulas escolhas">
      <label>
        <input
          type="radio"
          name="tipo"
          value="guardar"
          checked={valores?.tipo !== 'retirar'}
        />Guardar
      </label>
      <label>
        <input
          type="radio"
          name="tipo"
          value="retirar"
          checked={valores?.tipo === 'retirar'}
        />Retirar
      </label>
    </div>
    {#if erros?.tipo}<span class="err" role="alert">{erros.tipo}</span>{/if}
  </fieldset>

  <div class="field">
    <label for="{id}-valor">Valor (R$)</label>
    <input
      id="{id}-valor"
      name="valor"
      inputmode="decimal"
      placeholder="0,00"
      required
      value={valores?.valor ?? ''}
      {...aria('valor')}
    />
    {#if erros?.valor}<span class="err" id="{id}-valor-erro">{erros.valor}</span>{/if}
  </div>

  <div class="field">
    <label for="{id}-data">Data</label>
    <input
      id="{id}-data"
      name="data"
      type="date"
      required
      value={valores?.data ?? hoje}
      {...aria('data')}
    />
    {#if erros?.data}<span class="err" id="{id}-data-erro">{erros.data}</span>{/if}
  </div>

  <div class="field">
    <label for="{id}-nota">Nota <span class="opc">opcional</span></label>
    <input
      id="{id}-nota"
      name="nota"
      maxlength="120"
      placeholder="Ex.: sobra do mês"
      value={valores?.nota ?? ''}
      {...aria('nota')}
    />
    {#if erros?.nota}<span class="err" id="{id}-nota-erro">{erros.nota}</span>{/if}
  </div>

  {#if erro}<p class="err" role="alert">{erro}</p>{/if}

  <div class="acts">
    <button class="btn ink" type="submit" disabled={enviando}>
      {enviando ? 'Salvando…' : 'Registrar'}
    </button>
  </div>
</form>

<style>
  .fmov {
    display: grid;
    gap: 16px;
  }
  .opc {
    font-weight: 400;
  }
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pilulas {
    display: flex;
    width: 100%;
  }
  .pilulas > label {
    position: relative;
    flex: 1;
    min-height: 44px;
    justify-content: center;
    cursor: pointer;
  }
  .pilulas > label input {
    position: absolute;
    /* Rádio invisível de 1px no meio da opção: o clique no texto vai para o rótulo. */
    top: 50%;
    left: 50%;
    width: 1px;
    height: 1px;
    min-height: 0;
    padding: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .pilulas > label:has(input:focus-visible) {
    outline: 2px solid var(--orange);
    outline-offset: 2px;
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
</style>

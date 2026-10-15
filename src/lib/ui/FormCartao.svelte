<script lang="ts">
  /**
   * Formulário de cartão (novo ou editar). Funciona sem JavaScript; com ele, envia sem recarregar.
   * Os dias de fechamento e vencimento são números de 1 a 31; o limite é opcional (vazio = 0).
   */
  import { enhance } from '$app/forms';
  import { centavosParaCampo } from '$lib/dominio/dinheiro';
  import { focarPrimeiroErro } from './formularios';

  interface Inicial {
    nome?: string;
    limiteCentavos?: number;
    diaFechamento?: number;
    diaVencimento?: number;
  }
  interface Props {
    acao: string;
    rotulo: string;
    inicial?: Inicial;
    /** Edição mantém o que foi digitado após salvar; o cadastro novo limpa o formulário. */
    manter?: boolean;
    erros?: Record<string, string> | undefined;
    erro?: string | undefined;
    valores?: Record<string, string> | undefined;
    id?: string;
  }
  let {
    acao,
    rotulo,
    inicial = {},
    manter = false,
    erros,
    erro,
    valores,
    id = 'cc',
  }: Props = $props();

  let enviando = $state(false);

  const v = $derived({
    nome: valores?.nome ?? inicial.nome ?? '',
    limite:
      valores?.limite ?? (inicial.limiteCentavos ? centavosParaCampo(inicial.limiteCentavos) : ''),
    fechamento: valores?.fechamento ?? (inicial.diaFechamento ? String(inicial.diaFechamento) : ''),
    vencimento: valores?.vencimento ?? (inicial.diaVencimento ? String(inicial.diaVencimento) : ''),
  });

  /** Atributos de acessibilidade de um campo com (ou sem) erro. */
  const aria = (campo: string) =>
    erros?.[campo]
      ? { 'aria-invalid': 'true' as const, 'aria-describedby': `${id}-${campo}-erro` }
      : {};
</script>

<form
  class="fc"
  method="POST"
  action={acao}
  autocomplete="off"
  use:enhance={({ formElement }) => {
    enviando = true;
    return async ({ result, update }) => {
      await update({ reset: !manter && result.type === 'success' });
      enviando = false;
      if (result.type === 'failure') await focarPrimeiroErro(formElement);
    };
  }}
>
  <div class="field">
    <label for="{id}-nome">Nome</label>
    <input
      id="{id}-nome"
      name="nome"
      maxlength="60"
      required
      placeholder="Ex.: Nubank, Itaú Platinum"
      value={v.nome}
      {...aria('nome')}
    />
    {#if erros?.nome}<span class="err" id="{id}-nome-erro">{erros.nome}</span>{/if}
  </div>

  <div class="field">
    <label for="{id}-limite">Limite (R$) <span class="opc">opcional</span></label>
    <input
      id="{id}-limite"
      name="limite"
      inputmode="decimal"
      placeholder="0,00"
      value={v.limite}
      {...aria('limite')}
    />
    {#if erros?.limite}<span class="err" id="{id}-limite-erro">{erros.limite}</span>{/if}
    <span class="hint">Sem limite informado, a tela não mostra o quanto resta.</span>
  </div>

  <div class="duo">
    <div class="field">
      <label for="{id}-fechamento">Dia do fechamento</label>
      <input
        id="{id}-fechamento"
        name="fechamento"
        type="number"
        inputmode="numeric"
        min="1"
        max="31"
        step="1"
        required
        value={v.fechamento}
        {...aria('fechamento')}
      />
      {#if erros?.fechamento}<span class="err" id="{id}-fechamento-erro">{erros.fechamento}</span
        >{/if}
    </div>
    <div class="field">
      <label for="{id}-vencimento">Dia do vencimento</label>
      <input
        id="{id}-vencimento"
        name="vencimento"
        type="number"
        inputmode="numeric"
        min="1"
        max="31"
        step="1"
        required
        value={v.vencimento}
        {...aria('vencimento')}
      />
      {#if erros?.vencimento}<span class="err" id="{id}-vencimento-erro">{erros.vencimento}</span
        >{/if}
    </div>
  </div>
  <p class="hint">
    Dica: se o vencimento é até o dia do fechamento, a fatura vence no mês seguinte.
  </p>

  {#if erro}<p class="err" role="alert">{erro}</p>{/if}

  <div class="acts">
    <button class="btn ink" type="submit" disabled={enviando}>
      {enviando ? 'Salvando…' : rotulo}
    </button>
  </div>
</form>

<style>
  .fc {
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
</style>

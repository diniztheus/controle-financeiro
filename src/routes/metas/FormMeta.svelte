<script lang="ts">
  /**
   * Formulário de meta (nova ou editar). Funciona sem JavaScript; com ele, envia sem recarregar.
   * O prazo é opcional: sem ele a tela não calcula quanto guardar por mês.
   */
  import { enhance } from '$app/forms';
  import { centavosParaCampo, type Centavos } from '$lib/dominio/dinheiro';
  import type { Dia } from '$lib/dominio/datas';
  import type { Cor } from '$lib/dominio/categorias';
  import EscolhaCor from '$lib/ui/EscolhaCor.svelte';
  import { focarPrimeiroErro } from '$lib/ui/formularios';

  interface Inicial {
    nome?: string;
    alvoCentavos?: Centavos;
    prazo?: Dia | null;
    cor?: Cor | null;
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
    id = 'meta',
  }: Props = $props();

  let enviando = $state(false);

  const v = $derived({
    nome: valores?.nome ?? inicial.nome ?? '',
    alvo: valores?.alvo ?? (inicial.alvoCentavos ? centavosParaCampo(inicial.alvoCentavos) : ''),
    prazo: valores?.prazo ?? inicial.prazo ?? '',
    cor: (valores ? valores.cor || null : (inicial.cor ?? null)) as Cor | null,
  });

  /** Atributos de acessibilidade de um campo com (ou sem) erro. */
  const aria = (campo: string) =>
    erros?.[campo]
      ? { 'aria-invalid': 'true' as const, 'aria-describedby': `${id}-${campo}-erro` }
      : {};
</script>

<form
  class="fm"
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
    <label for="{id}-nome">Nome da meta</label>
    <input
      id="{id}-nome"
      name="nome"
      maxlength="60"
      required
      placeholder="Ex.: Viagem, Carro novo"
      value={v.nome}
      {...aria('nome')}
    />
    {#if erros?.nome}<span class="err" id="{id}-nome-erro">{erros.nome}</span>{/if}
  </div>

  <div class="field">
    <label for="{id}-alvo">Valor da meta (R$)</label>
    <input
      id="{id}-alvo"
      name="alvo"
      inputmode="decimal"
      placeholder="3.000,00"
      required
      value={v.alvo}
      {...aria('alvo')}
    />
    {#if erros?.alvo}<span class="err" id="{id}-alvo-erro">{erros.alvo}</span>{/if}
  </div>

  <div class="field">
    <label for="{id}-prazo">Prazo <span class="opc">opcional</span></label>
    <input id="{id}-prazo" name="prazo" type="date" value={v.prazo} {...aria('prazo')} />
    {#if erros?.prazo}<span class="err" id="{id}-prazo-erro">{erros.prazo}</span>{/if}
    <span class="hint">Com prazo, a tela mostra quanto guardar por mês para chegar lá.</span>
  </div>

  <EscolhaCor id="{id}-cor" valor={v.cor} />
  {#if erros?.cor}<span class="err" role="alert">{erros.cor}</span>{/if}

  {#if erro}<p class="err" role="alert">{erro}</p>{/if}

  <div class="acts">
    <button class="btn ink" type="submit" disabled={enviando}>
      {enviando ? 'Salvando…' : rotulo}
    </button>
  </div>
</form>

<style>
  .fm {
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

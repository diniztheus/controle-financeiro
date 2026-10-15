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
  import { ehDia, nomeMesCurto } from '$lib/dominio/datas';
  import { centavosParaCampo, formatarBRL, MAX_PARCELAS, parseValor } from '$lib/dominio/dinheiro';
  import { previaParcelas } from '$lib/dominio/cartoes';
  import { corCss } from './formato';
  import { focarPrimeiroErro } from './formularios';

  interface Opcao {
    id: string;
    nome: string;
    cor?: string | null;
  }
  /** Cartão ativo, com os dias que a prévia de parcelas precisa. */
  interface OpcaoCartao extends Opcao {
    diaFechamento: number;
    diaVencimento: number;
  }
  interface Inicial {
    valorCentavos?: number;
    descricao?: string | null;
    categoriaId?: string | null;
    data: string;
    contaId?: string | null;
    meio?: 'conta' | 'cartao';
    cartaoId?: string | null;
    numParcelas?: number;
  }
  interface Props {
    acao: string;
    rotulo: string;
    categorias: Opcao[];
    contas: Opcao[];
    /** Cartões ativos. Sem nenhum, a escolha "Cartão" nem aparece. */
    cartoes?: OpcaoCartao[];
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
    cartoes = [],
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
    meio:
      (valores?.meio ?? inicial.meio ?? 'conta') === 'cartao'
        ? ('cartao' as const)
        : ('conta' as const),
    cartaoId: valores?.cartao ?? inicial.cartaoId ?? cartoes[0]?.id ?? '',
    parcelas: valores?.parcelas ?? String(inicial.numParcelas ?? 1),
  });

  // Valores digitados: os campos que mexem na prévia são ligados a estas variáveis (com JavaScript,
  // a prévia acompanha a digitação). Sem JavaScript, valem os valores do servidor.
  // Começam com o valor da página (o servidor renderiza o HTML a partir daqui, sem $effect).
  const inicio = () => ({
    valor: v.valor,
    data: v.data,
    parcelas: v.parcelas,
    cartao: v.cartaoId,
    meio: v.meio,
  });
  let valorTxt = $state(inicio().valor);
  let dataTxt = $state(inicio().data);
  let parcelasTxt = $state(inicio().parcelas);
  let cartaoTxt = $state(inicio().cartao);
  let meioTxt = $state<'conta' | 'cartao'>(inicio().meio);
  $effect.pre(() => {
    const i = inicio();
    valorTxt = i.valor;
    dataTxt = i.data;
    parcelasTxt = i.parcelas;
    cartaoTxt = i.cartao;
    meioTxt = i.meio;
  });

  const cartaoEscolhido = $derived(cartoes.find((c) => c.id === cartaoTxt));

  /**
   * Prévia das parcelas, com as mesmas regras do domínio. Nula quando ainda não dá para calcular.
   * Calculada também no servidor (no HTML inicial), por isso funciona sem JavaScript.
   */
  const previa = $derived.by(() => {
    const total = parseValor(valorTxt);
    const n = Number(parcelasTxt);
    if (meioTxt !== 'cartao' || !cartaoEscolhido || !ehDia(dataTxt)) return null;
    if (total === null || total <= 0 || !Number.isInteger(n) || n < 1 || n > MAX_PARCELAS) {
      return null;
    }
    return previaParcelas(dataTxt, cartaoEscolhido, total, n);
  });

  const textoPrevia = $derived.by(() => {
    const p = previa;
    if (!p?.length) return '';
    const primeira = p[0]!;
    const demais = p[1]?.valorCentavos ?? primeira.valorCentavos;
    const quanto =
      primeira.valorCentavos === demais
        ? `${p.length}x de ${formatarBRL(demais)}`
        : `${p.length}x: a 1ª de ${formatarBRL(primeira.valorCentavos)} e as demais de ${formatarBRL(demais)}`;
    const ano = primeira.mesFatura.slice(0, 4);
    const venc = `${primeira.vencimento.slice(8, 10)}/${primeira.vencimento.slice(5, 7)}`;
    return `${quanto} · 1ª parcela na fatura de ${nomeMesCurto(primeira.mesFatura)}/${ano}, vence ${venc}`;
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
        valorTxt = '';
        if (campoDescricao) campoDescricao.value = '';
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
      bind:value={valorTxt}
      bind:this={campoValor}
      {...aria('valor')}
    />
    {#if erros?.valor}<span class="err" id="{id}-valor-erro">{erros.valor}</span>{/if}
  </div>

  {#if cartoes.length}
    <fieldset class="field" data-testid="forma-pagamento">
      <legend class="lbl">Forma de pagamento</legend>
      <div class="chips">
        <label class="chip">
          <input type="radio" name="meio" value="conta" bind:group={meioTxt} />Conta
        </label>
        <label class="chip">
          <input type="radio" name="meio" value="cartao" bind:group={meioTxt} />Cartão
        </label>
      </div>
    </fieldset>
  {/if}

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
      <input
        id="{id}-data"
        name="data"
        type="date"
        required
        bind:value={dataTxt}
        {...aria('data')}
      />
      {#if erros?.data}<span class="err" id="{id}-data-erro">{erros.data}</span>{/if}
    </div>
    <div class="field so-conta">
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

  {#if cartoes.length}
    <div class="duo so-cartao">
      <div class="field">
        <label for="{id}-cartao">Cartão</label>
        <select id="{id}-cartao" name="cartao" bind:value={cartaoTxt} {...aria('cartao')}>
          {#each cartoes as c (c.id)}
            <option value={c.id}>{c.nome}</option>
          {/each}
        </select>
        {#if erros?.cartao}<span class="err" id="{id}-cartao-erro">{erros.cartao}</span>{/if}
      </div>
      <div class="field">
        <label for="{id}-parcelas">Parcelas <span class="opc">de 1 a {MAX_PARCELAS}</span></label>
        <input
          id="{id}-parcelas"
          name="parcelas"
          inputmode="numeric"
          bind:value={parcelasTxt}
          {...aria('parcelas')}
        />
        {#if erros?.parcelas}<span class="err" id="{id}-parcelas-erro">{erros.parcelas}</span>{/if}
      </div>
    </div>
    <p class="previa so-cartao" id="{id}-previa" aria-live="polite">
      {#if previa?.length}{textoPrevia}{:else}Escolha o valor, a data e o cartão para ver as
        parcelas.{/if}
    </p>
    <p class="hint so-cartao">
      As parcelas entram nas faturas do cartão e somam na dívida do patrimônio até a fatura ser
      paga. Pagar a fatura não altera o saldo das contas.
    </p>
  {/if}

  <p class="hint so-conta">
    O saldo da conta não muda: saldos são atualizados por você, em Contas.
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
  /* Escolher "Cartão" mostra as opções de cartão e esconde as de conta (também sem JavaScript). */
  .fg:has(input[name='meio'][value='cartao']:checked) .so-conta {
    display: none;
  }
  .fg:has(input[name='meio'][value='conta']:checked) .so-cartao {
    display: none;
  }
  .previa {
    margin: -4px 0 0;
    padding: 10px 12px;
    background: var(--orange-soft);
    font-size: 0.9375rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
</style>

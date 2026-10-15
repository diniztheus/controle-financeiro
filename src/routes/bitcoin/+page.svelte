<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { untrack } from 'svelte';
  import {
    centavosParaSats,
    formatarSats,
    parseSats,
    satsParaCentavos,
    SATS_POR_BTC,
  } from '$lib/dominio/bitcoin';
  import { formatarBRL, parseValor } from '$lib/dominio/dinheiro';
  import GraficoBitcoin from '$lib/ui/GraficoBitcoin.svelte';
  import { diaCurto, diaPorExtenso } from '$lib/ui/formato';
  import { ariaErro, focarPrimeiroErro, manterCampos } from '$lib/ui/formularios';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const pos = $derived(data.painel.posicao);
  const preco = $derived(data.painel.preco);
  const precoCentavos = $derived(preco?.precoCentavos ?? null);

  const ORIGEM_PRECO = {
    manual: 'informado por você',
    api: 'buscado na internet',
    implicito: 'pelo valor de uma compra ou venda',
  } as const;

  const erroRegistrar = $derived(form?.acao === 'registrar' && !('ok' in form) ? form : null);
  const okRegistrar = $derived(form?.acao === 'registrar' && 'ok' in form ? form.ok : null);
  const erroPreco = $derived(form?.acao === 'preco' && !('ok' in form) ? form : null);
  const okPreco = $derived(form?.acao === 'preco' && 'ok' in form ? form.ok : null);
  const erroBuscar = $derived(form?.acao === 'buscarPreco' && !('ok' in form) ? form : null);
  const okBuscar = $derived(form?.acao === 'buscarPreco' && 'ok' in form ? form.ok : null);

  const ganho = $derived(pos.ganhoCentavos);
  const pctGanho = $derived(pos.ganhoPercentual);

  /** Conversor: o campo editado por último manda; o outro é esvaziado. */
  // Valor inicial vem da URL (sem JavaScript, a resposta já está no HTML); depois o campo é livre.
  let convSats = $state(untrack(() => data.conversor.sats));
  let convReais = $state(untrack(() => data.conversor.reais));
  const conversao = $derived.by((): { texto: string | null; erro: string | null } => {
    const temSats = convSats.trim() !== '';
    const temReais = convReais.trim() !== '';
    if (!temSats && !temReais) return { texto: null, erro: null };
    if (precoCentavos === null)
      return {
        texto: null,
        erro: 'Ainda não há preço do BTC. Informe um preço do dia na coluna ao lado.',
      };
    if (temSats) {
      const sats = parseSats(convSats);
      if (sats === null || sats <= 0)
        return { texto: null, erro: 'Use uma quantidade inteira de sats, como 150000.' };
      return {
        texto: `${formatarSats(sats)} valem ${formatarBRL(satsParaCentavos(sats, precoCentavos))}`,
        erro: null,
      };
    }
    const reais = parseValor(convReais);
    if (reais === null || reais <= 0)
      return { texto: null, erro: 'Use um valor em reais, como 250,00.' };
    return {
      texto: `${formatarBRL(reais)} compram ${formatarSats(centavosParaSats(reais, precoCentavos))}`,
      erro: null,
    };
  });

  /** Depois de registrar, limpa só quantidade, valor e nota (tipo e data ficam). */
  function limparCampos(f: HTMLFormElement, nomes: string[]) {
    for (const nome of nomes) {
      const c = f.elements.namedItem(nome);
      if (c instanceof HTMLInputElement) c.value = '';
    }
  }

  const btcTotal = $derived(
    (pos.sats / SATS_POR_BTC).toLocaleString('pt-BR', { maximumFractionDigits: 8 }),
  );
  const numeroPct = (n: number) =>
    n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
</script>

<svelte:head>
  <title>Controle Financeiro · Bitcoin</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Bitcoin</h1>
    <p>
      Quanto você tem em sats, quanto vale em reais e quanto ganhou ou perdeu até agora. Tudo é
      cadastrado por você, em sats inteiros: 100.000.000 sats são 1 BTC.
    </p>
  </div>
  <div class="preco-ref">
    {#if preco}
      <p class="small muted">Preço de referência · {ORIGEM_PRECO[preco.origem]}</p>
      <p class="preco-val num" data-testid="preco-ref">
        {formatarBRL(preco.precoCentavos)} <span class="por">por BTC</span>
      </p>
      <p class="small muted">em {diaPorExtenso(preco.data)}</p>
    {:else}
      <p class="muted">Sem preço do BTC ainda. Informe um preço do dia na coluna ao lado.</p>
    {/if}
  </div>
</header>

<div class="pad indi">
  <dl class="indicadores" data-testid="indicadores">
    <div class="ind">
      <dt>Total em bitcoin</dt>
      <dd class="num" data-testid="total-sats">
        {formatarSats(pos.sats)}
        <small>{btcTotal} BTC</small>
      </dd>
    </div>
    <div class="ind">
      <dt>Valor atual</dt>
      <dd class="num" data-testid="valor-atual">
        {#if pos.valorAtualCentavos !== null}
          {formatarBRL(pos.valorAtualCentavos)}
        {:else}
          <small>Sem preço do BTC</small>
        {/if}
      </dd>
    </div>
    <div class="ind">
      <dt>Preço médio de compra</dt>
      <dd class="num" data-testid="preco-medio">
        {#if pos.precoMedioCentavos !== null}
          {formatarBRL(pos.precoMedioCentavos)}
          <small>por BTC · custo {formatarBRL(pos.custoCentavos)}</small>
        {:else}
          <small>Sem compra com valor informado</small>
        {/if}
      </dd>
    </div>
    <div class="ind">
      <dt>Ganho ou perda não realizado</dt>
      <dd class="num" data-testid="ganho">
        {#if ganho !== null}
          <span class:alta={ganho > 0} class:baixa={ganho < 0}
            >{ganho > 0 ? '+' : ''}{formatarBRL(ganho)}</span
          >
          {#if pctGanho !== null}
            <small class:alta={ganho > 0} class:baixa={ganho < 0}
              >{pctGanho > 0 ? '+' : ''}{numeroPct(pctGanho)}%</small
            >
          {/if}
        {:else}
          <small>Depende do preço do BTC</small>
        {/if}
      </dd>
    </div>
  </dl>
</div>

<section class="sec alt pad grade">
  <div class="col">
    <article class="cartao">
      <h2>Evolução</h2>
      <GraficoBitcoin pontos={data.painel.evolucao} />
    </article>

    <div class="col-head">
      <h2 class="h">Compras e vendas</h2>
    </div>
    {#if (form?.acao === 'remover' || form?.acao === 'restaurar') && 'ok' in form}
      <p class="ok-msg" role="status">{form.ok}</p>
    {:else if form?.acao === 'restaurar' && !('ok' in form) && form.erro}
      <p class="err" role="alert">{form.erro}</p>
    {/if}
    {#if data.painel.movimentos.length}
      <ul class="movs" data-testid="movimentos">
        {#each data.painel.movimentos as m (m.id)}
          {@const compra = m.sats > 0}
          {@const erroLinha =
            form?.id === m.id && form.acao === 'remover' && !('ok' in form) ? form : null}
          <li class="mov">
            <span class="sq" style="--cc: {compra ? 'var(--pos)' : 'var(--neg)'}"></span>
            <div class="mov-main">
              <p class="mov-titulo">
                <span>{compra ? 'Compra' : 'Venda'}</span>
                <span class="num">{formatarSats(Math.abs(m.sats))}</span>
              </p>
              <p class="small muted">
                {diaPorExtenso(m.data)}{m.nota ? ` · ${m.nota}` : ''}
              </p>
            </div>
            <p class="mov-val num">
              {#if m.valorCentavos}
                {formatarBRL(m.valorCentavos)}
              {:else}
                <span class="muted small">sem valor</span>
              {/if}
            </p>
            <form method="POST" action="?/remover" use:enhance>
              <input type="hidden" name="id" value={m.id} />
              <button
                class="btn sm"
                type="submit"
                aria-label="Mandar {compra ? 'compra' : 'venda'} de {formatarSats(
                  Math.abs(m.sats),
                )} de {diaCurto(m.data)} para a lixeira">Remover</button
              >
            </form>
            {#if erroLinha}
              <p class="err mov-erro" role="alert">{erroLinha.erro}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty">
        <strong>Nenhuma compra ou venda ainda</strong>
        <span
          >Registre a primeira na coluna ao lado. Se souber o valor pago, ele entra no preço médio.</span
        >
      </div>
    {/if}

    {#if data.lixeira.length}
      <div class="col-head">
        <h2 class="h">Na lixeira</h2>
      </div>
      <ul class="movs" data-testid="lixeira-bitcoin">
        {#each data.lixeira as m (m.id)}
          <li class="mov">
            <span class="sq" style="--cc: var(--muted)"></span>
            <div class="mov-main">
              <p class="mov-titulo">
                <span>{m.sats > 0 ? 'Compra' : 'Venda'}</span>
                <span class="num">{formatarSats(Math.abs(m.sats))}</span>
              </p>
              <p class="small muted">{diaPorExtenso(m.data)}</p>
            </div>
            <form method="POST" action="?/restaurar" use:enhance>
              <input type="hidden" name="id" value={m.id} />
              <button class="btn sm" type="submit">Restaurar</button>
            </form>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="note">
      Movimentos removidos ficam aqui até você restaurar. O preço do BTC que eles deixaram no dia
      não some.
    </p>
  </div>

  <div class="col-direita">
    <div class="painel-form">
      <h2>Registrar compra ou venda</h2>
      <form
        class="fc"
        method="POST"
        action="?/registrar"
        autocomplete="off"
        use:enhance={({ formElement }) => {
          return async ({ result, update }) => {
            await update({ reset: false });
            if (result.type === 'success') {
              limparCampos(formElement, ['sats', 'valor', 'nota']);
              (formElement.elements.namedItem('sats') as HTMLInputElement | null)?.focus();
            } else if (result.type === 'failure') {
              await focarPrimeiroErro(formElement);
            }
          };
        }}
      >
        <fieldset class="field">
          <legend class="lbl">Operação</legend>
          <div class="opcoes">
            <label class="op">
              <input
                type="radio"
                name="tipo"
                value="compra"
                checked={(erroRegistrar?.valores?.tipo ?? 'compra') === 'compra'}
              /> Compra
            </label>
            <label class="op">
              <input
                type="radio"
                name="tipo"
                value="venda"
                checked={erroRegistrar?.valores?.tipo === 'venda'}
              /> Venda
            </label>
          </div>
          {#if erroRegistrar?.erros?.tipo}<span class="err">{erroRegistrar.erros.tipo}</span>{/if}
        </fieldset>

        <div class="field">
          <label for="b-sats">Quantidade (sats)</label>
          <input
            id="b-sats"
            name="sats"
            class="num"
            inputmode="numeric"
            placeholder="Ex.: 150000"
            required
            value={erroRegistrar?.valores?.sats ?? ''}
            {...ariaErro(erroRegistrar?.erros?.sats, 'b-sats')}
          />
          {#if erroRegistrar?.erros?.sats}<span class="err" id="b-sats-erro"
              >{erroRegistrar.erros.sats}</span
            >{/if}
          <span class="hint">Números inteiros. 100.000.000 sats são 1 BTC.</span>
        </div>

        <div class="field">
          <label for="b-valor">Valor em R$ <span class="opc">opcional</span></label>
          <input
            id="b-valor"
            name="valor"
            inputmode="decimal"
            placeholder="0,00"
            value={erroRegistrar?.valores?.valor ?? ''}
            {...ariaErro(erroRegistrar?.erros?.valor, 'b-valor')}
          />
          {#if erroRegistrar?.erros?.valor}<span class="err" id="b-valor-erro"
              >{erroRegistrar.erros.valor}</span
            >{/if}
          <span class="hint"
            >Quanto você pagou ou recebeu. Com ele, o preço médio e o preço do dia ficam
            registrados.</span
          >
        </div>

        <div class="duo">
          <div class="field">
            <label for="b-data">Data</label>
            <input
              id="b-data"
              name="data"
              type="date"
              required
              value={erroRegistrar?.valores?.data ?? data.hoje}
              {...ariaErro(erroRegistrar?.erros?.data, 'b-data')}
            />
            {#if erroRegistrar?.erros?.data}<span class="err" id="b-data-erro"
                >{erroRegistrar.erros.data}</span
              >{/if}
          </div>
          <div class="field">
            <label for="b-nota">Nota <span class="opc">opcional</span></label>
            <input
              id="b-nota"
              name="nota"
              maxlength="120"
              placeholder="Ex.: corretora"
              value={erroRegistrar?.valores?.nota ?? ''}
              {...ariaErro(erroRegistrar?.erros?.nota, 'b-nota')}
            />
          </div>
        </div>

        {#if erroRegistrar?.erro}<p class="err" role="alert">{erroRegistrar.erro}</p>{/if}
        <div><button class="btn ink" type="submit">Registrar</button></div>
        {#if okRegistrar}<p class="ok-msg" role="status">{okRegistrar}</p>{/if}
      </form>
    </div>

    <div class="painel-form">
      <h2>Conversor</h2>
      <!-- Sem JavaScript: envia por GET e a resposta vem na URL. Com JavaScript, converte ao digitar. -->
      <form
        class="fc"
        method="GET"
        action={resolve('/bitcoin')}
        data-sveltekit-noscroll
        onsubmit={(e) => e.preventDefault()}
      >
        <div class="field">
          <label for="cv-sats">Em sats</label>
          <input
            id="cv-sats"
            name="sats"
            class="num"
            inputmode="numeric"
            placeholder="Ex.: 150000"
            bind:value={convSats}
            oninput={() => (convReais = '')}
          />
        </div>
        <div class="field">
          <label for="cv-reais">Em reais (R$)</label>
          <input
            id="cv-reais"
            name="reais"
            class="num"
            inputmode="decimal"
            placeholder="0,00"
            bind:value={convReais}
            oninput={() => (convSats = '')}
          />
        </div>
        <button class="btn" type="submit">Converter</button>
      </form>
      <p class="resultado num" role="status" aria-live="polite">
        {#if conversao.texto}
          {conversao.texto}
        {:else if conversao.erro}
          <span class="err">{conversao.erro}</span>
        {/if}
      </p>
    </div>

    <div class="painel-form">
      <h2>Preço do BTC</h2>
      <p class="hint">
        Preço de 1 BTC em reais, por dia. O que você informa aqui vale mais que qualquer busca
        automática.
      </p>
      <form class="fc" method="POST" action="?/preco" autocomplete="off" use:enhance={manterCampos}>
        <div class="duo">
          <div class="field">
            <label for="p-data">Dia</label>
            <input
              id="p-data"
              name="data"
              type="date"
              required
              value={erroPreco?.valores?.data ?? data.hoje}
              {...ariaErro(erroPreco?.erros?.data, 'p-data')}
            />
            {#if erroPreco?.erros?.data}<span class="err" id="p-data-erro"
                >{erroPreco.erros.data}</span
              >{/if}
          </div>
          <div class="field">
            <label for="p-preco">Preço de 1 BTC (R$)</label>
            <input
              id="p-preco"
              name="preco"
              inputmode="decimal"
              placeholder="0,00"
              required
              value={erroPreco?.valores?.preco ?? ''}
              {...ariaErro(erroPreco?.erros?.preco, 'p-preco')}
            />
            {#if erroPreco?.erros?.preco}<span class="err" id="p-preco-erro"
                >{erroPreco.erros.preco}</span
              >{/if}
          </div>
        </div>
        {#if erroPreco?.erro}<p class="err" role="alert">{erroPreco.erro}</p>{/if}
        <div><button class="btn ink" type="submit">Salvar preço do dia</button></div>
        {#if okPreco}<p class="ok-msg" role="status">{okPreco}</p>{/if}
      </form>

      <form method="POST" action="?/buscarPreco" use:enhance class="busca">
        <button class="btn" type="submit">Buscar preço agora</button>
        <p class="hint">
          Consulta a cotação pública do bitcoin em reais. Sem internet, nada quebra: o último preço
          continua valendo.
        </p>
        {#if erroBuscar}
          <p class="err" role="alert">{erroBuscar.erro}</p>
        {:else if okBuscar}
          <p class="ok-msg" role="status">{okBuscar}</p>
        {/if}
      </form>
    </div>
  </div>
</section>

<style>
  .preco-ref {
    text-align: right;
    display: grid;
    gap: 4px;
    justify-items: end;
  }
  .preco-val {
    font-size: clamp(1.5rem, 1.1rem + 1.6vw, 2.25rem);
    font-weight: 700;
    letter-spacing: -0.035em;
    line-height: 1.1;
  }
  .por {
    font-size: 0.5em;
    font-weight: 600;
    letter-spacing: 0;
    color: var(--muted);
    vertical-align: 0.3em;
  }
  @media (max-width: 700px) {
    .preco-ref {
      text-align: left;
      justify-items: start;
    }
  }

  .indi {
    padding-block: clamp(24px, 3vw, 40px) 0;
  }
  .indicadores {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 8px;
    margin: 0;
  }
  .ind {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r);
    padding: 16px 18px;
    display: grid;
    gap: 8px;
    align-content: start;
    min-width: 0;
  }
  .ind dt {
    font-size: var(--s-small);
    font-weight: 600;
    color: var(--muted);
  }
  .ind dd {
    margin: 0;
    font-size: clamp(1.25rem, 1rem + 0.9vw, 1.625rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.15;
    overflow-wrap: anywhere;
    display: grid;
    gap: 4px;
  }
  .ind dd small {
    font-size: var(--s-small);
    font-weight: 500;
    letter-spacing: 0;
    color: var(--muted);
    line-height: 1.4;
  }
  .alta {
    color: var(--pos);
  }
  .baixa {
    color: var(--neg);
  }

  .grade {
    padding-block: clamp(24px, 3vw, 40px) clamp(64px, 10vw, 144px);
  }
  .col-direita {
    display: grid;
    gap: 16px;
    align-content: start;
    min-width: 0;
  }
  .cartao {
    background: var(--paper);
    border-radius: var(--r);
    padding: clamp(16px, 2vw, 24px);
    display: grid;
    gap: 16px;
    min-width: 0;
  }
  .cartao h2 {
    font-size: var(--s-lead);
  }
  .fc {
    display: grid;
    gap: 16px;
  }
  .painel-form .hint {
    margin-top: -8px;
  }
  .opcoes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: 6px;
  }
  .opcoes .op {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--r);
    background: var(--surface);
    color: var(--ink);
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
  }
  .opcoes .op input {
    accent-color: var(--orange);
    width: 16px;
    height: 16px;
    margin: 0;
  }
  .opcoes .op:has(input:checked) {
    background: var(--orange);
    color: var(--orange-ink);
  }
  .opcoes .op:focus-within {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .opc {
    font-weight: 500;
    color: var(--muted);
  }
  .resultado {
    min-height: 1.5em;
    font-size: 1.0625rem;
    font-weight: 600;
  }
  .busca {
    display: grid;
    gap: 10px;
    justify-items: start;
    padding-top: 16px;
    border-top: 1px solid var(--line);
  }

  .movs {
    display: grid;
    gap: 4px;
  }
  .mov {
    display: grid;
    grid-template-columns: 12px minmax(0, 1fr) auto auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    background: var(--paper);
    border-radius: var(--r);
    min-width: 0;
  }
  .mov .sq {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: var(--cc);
    align-self: center;
  }
  .mov-main {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .mov-titulo {
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
    font-weight: 600;
  }
  .mov-val {
    font-weight: 600;
    white-space: nowrap;
    text-align: right;
  }
  .mov form .btn.sm {
    min-height: 44px;
  }
  .mov-erro {
    grid-column: 1 / -1;
  }
  @media (max-width: 560px) {
    .mov {
      grid-template-columns: 12px minmax(0, 1fr) auto;
    }
    .mov-val {
      grid-column: 2;
      text-align: left;
    }
    .mov form {
      grid-column: 3;
      grid-row: 1;
    }
  }
</style>

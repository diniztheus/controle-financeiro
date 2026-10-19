<script lang="ts">
  import ArrowDownLeft from '@lucide/svelte/icons/arrow-down-left';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import Bitcoin from '@lucide/svelte/icons/bitcoin';
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
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
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
    {#if data.precoAuto.ligado}
      <p class="small muted" data-testid="preco-auto">
        Atualizado sozinho a cada hora · {data.precoAuto.ultimaBusca
          ? `última busca ${data.precoAuto.ultimaBusca}`
          : 'ainda sem busca'}
      </p>
    {:else}
      <p class="small muted" data-testid="preco-auto">
        Atualização automática desligada (<a href={resolve('/configuracoes')}>Configurações</a>)
      </p>
    {/if}
  </div>
</header>

<div class="pad indi">
  <dl class="indicadores" data-testid="indicadores">
    <div class="ind destaque">
      <dt><span class="ico-btc" aria-hidden="true"><Bitcoin size={16} /></span>Total em bitcoin</dt>
      <dd class="num" data-testid="total-sats">
        {formatarSats(pos.sats)}
        <small>{btcTotal} BTC</small>
      </dd>
      <dt class="sub-dt">Valor atual</dt>
      <dd class="num valor-atual" data-testid="valor-atual">
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
    <section class="card" aria-labelledby="h-evolucao">
      <div class="card-head">
        <h2 id="h-evolucao">Evolução</h2>
        <span class="small muted">Sats e valor em reais, dia a dia</span>
      </div>
      <GraficoBitcoin pontos={data.painel.evolucao} />
    </section>

    <div class="col-head">
      <h2 class="h">Compras e vendas</h2>
    </div>
    {#if (form?.acao === 'remover' || form?.acao === 'restaurar') && 'ok' in form}
      <p class="ok-msg" role="status">{form.ok}</p>
    {:else if form?.acao === 'restaurar' && !('ok' in form) && form.erro}
      <p class="err" role="alert">{form.erro}</p>
    {/if}
    {#if data.painel.movimentos.length}
      <ul class="rows" data-testid="movimentos">
        {#each data.painel.movimentos as m (m.id)}
          {@const compra = m.sats > 0}
          {@const erroLinha =
            form?.id === m.id && form.acao === 'remover' && !('ok' in form) ? form : null}
          <li class="row">
            <IconeRedondo
              icone={compra ? ArrowDownLeft : ArrowUpRight}
              cor={compra ? 'var(--pos)' : 'var(--neg)'}
              suave
            />
            <span class="row-main">
              <span class="row-title"
                >{compra ? 'Compra' : 'Venda'}
                <span class="num">{formatarSats(Math.abs(m.sats))}</span></span
              >
              <span class="row-meta">{diaPorExtenso(m.data)}{m.nota ? ` · ${m.nota}` : ''}</span>
            </span>
            <span class="mov-acoes">
              <span class="row-val num">
                {#if m.valorCentavos}
                  {formatarBRL(m.valorCentavos)}
                {:else}
                  <span class="muted small">sem valor</span>
                {/if}
              </span>
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
            </span>
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
      <ul class="rows" data-testid="lixeira-bitcoin">
        {#each data.lixeira as m (m.id)}
          <li class="row">
            <IconeRedondo
              icone={m.sats > 0 ? ArrowDownLeft : ArrowUpRight}
              cor="var(--muted)"
              suave
            />
            <span class="row-main">
              <span class="row-title"
                >{m.sats > 0 ? 'Compra' : 'Venda'}
                <span class="num">{formatarSats(Math.abs(m.sats))}</span></span
              >
              <span class="row-meta">{diaPorExtenso(m.data)}</span>
            </span>
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
          <div class="pilulas op-pilulas">
            <label>
              <input
                type="radio"
                name="tipo"
                value="compra"
                checked={(erroRegistrar?.valores?.tipo ?? 'compra') === 'compra'}
              /> Compra
            </label>
            <label>
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
        <div><button class="btn go" type="submit">Registrar</button></div>
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
        <div><button class="btn go" type="submit">Salvar preço do dia</button></div>
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
    gap: 12px;
    margin: 0;
  }
  .ind {
    background: var(--surface);
    border-radius: var(--r-card);
    box-shadow: var(--shadow);
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
    display: flex;
    align-items: center;
    gap: 8px;
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
  /* Cartão de destaque: o saldo em BTC e o valor em reais, na cor do site (como o patrimônio). */
  .destaque {
    grid-column: 1 / -1;
    background: var(--hero);
    color: var(--hero-ink);
    box-shadow: none;
    padding: clamp(20px, 2.6vw, 28px);
    gap: 6px;
  }
  .destaque dt {
    color: inherit;
    opacity: 0.85;
  }
  .destaque dt.sub-dt {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid color-mix(in srgb, var(--hero-ink) 22%, transparent);
  }
  .destaque dd {
    font-size: clamp(2rem, 1.4rem + 2.6vw, 3rem);
    letter-spacing: -0.035em;
    line-height: 1.05;
  }
  .destaque .valor-atual {
    font-size: clamp(1.25rem, 1rem + 1vw, 1.75rem);
  }
  .destaque dd small {
    color: inherit;
    opacity: 0.8;
  }
  .ico-btc {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    background: color-mix(in srgb, var(--hero-ink) 18%, transparent);
    color: inherit;
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
  .fc {
    display: grid;
    gap: 16px;
  }
  .painel-form .hint {
    margin-top: -8px;
  }
  .op-pilulas {
    display: flex;
    width: 100%;
    margin-top: 6px;
  }
  .op-pilulas > label {
    flex: 1;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    cursor: pointer;
  }
  .op-pilulas input {
    accent-color: var(--orange);
    width: 16px;
    height: 16px;
    margin: 0;
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

  /* Movimentos: o valor e o botão empilhados à direita da linha */
  .mov-acoes {
    display: grid;
    justify-items: end;
    gap: 2px;
  }
  .mov-erro {
    grid-column: 1 / -1;
    padding: 0 16px 12px;
  }
</style>

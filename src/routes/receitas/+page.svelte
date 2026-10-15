<script lang="ts">
  import { enhance } from '$app/forms';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { mesDe, primeiroDiaDoMes, ultimoDiaDoMes, type Mes } from '$lib/dominio/datas';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { centavosParaCampo, formatarBRL } from '$lib/dominio/dinheiro';
  import FormReceita from '$lib/ui/FormReceita.svelte';
  import NavMes from '$lib/ui/NavMes.svelte';
  import Valor from '$lib/ui/Valor.svelte';
  import { diaPorExtenso, plural, soNomeMes, tituloMes } from '$lib/ui/formato';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const nomeMes = $derived(soNomeMes(data.mes));
  const linkMes = (m: Mes) => resolve(`/receitas?mes=${m}`);
  const falhou = $derived(form?.acao === 'lancar' && !('lancado' in form));
  /** Falha de uma linha de "A receber" (ou de "desfazer"), com o id dela, para mostrar ali. */
  const falhaDaLinha = (id: string) =>
    form && 'id' in form && form.id === id && form.acao !== 'lancar' ? form : null;
  // O aviso de "desfazer" e o de confirmação vêm pela URL; depois de mostrados, saem da barra.
  onMount(() => {
    if (page.url.searchParams.has('removido') || page.url.searchParams.has('aviso')) {
      replaceState(resolve(`/receitas?mes=${data.mes}`), page.state);
    }
  });
  /** "Salário · Conta Corrente" (a conta na lixeira fica sinalizada). */
  function detalhe(r: (typeof data.dias)[number]['itens'][number]): string {
    if (!r.contaNome) return r.categoria;
    return `${r.categoria} · ${r.contaNome}${r.contaRemovida ? ' (na lixeira)' : ''}`;
  }
  const lancado = $derived(
    form && 'lancado' in form
      ? form.lancado
      : data.lancadoSemJs
        ? { id: '', valorCentavos: data.lancadoSemJs, mes: data.mes }
        : null,
  );
</script>

<svelte:head>
  <title>Controle Financeiro · Receitas de {tituloMes(data.mes).toLowerCase()}</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Receitas</h1>
    <p>
      Salário, freelas e outras entradas de dinheiro. Só registro: o saldo das contas segue o seu.
    </p>
  </div>
  <NavMes mes={data.mes} href={linkMes} />
</header>

{#if data.removido}
  <form class="aviso pad" method="POST" action="?/restaurar" use:enhance>
    <input type="hidden" name="id" value={data.removido} />
    <span>Receita mandada para a lixeira.</span>
    <button class="btn sm ink" type="submit">Desfazer</button>
  </form>
{/if}
{#if form?.acao === 'restaurar' && form.erro}
  <p class="aviso pad err" role="alert">{form.erro}</p>
{/if}
{#if data.aviso}
  <p class="aviso pad ok-msg" role="status" data-testid="receita-aviso">{data.aviso}</p>
{/if}

<section class="sec alt pad grade form-primeiro" aria-label="Lançar e listar receitas">
  <div class="painel-form" id="nova">
    <h2>Lançar receita</h2>
    <FormReceita
      acao="?/lancar"
      rotulo="Lançar receita"
      categorias={data.categorias}
      contas={data.contas}
      inicial={{
        data: data.dataInicial,
        categoria: data.ultimaCategoria,
      }}
      erros={falhou ? form?.erros : undefined}
      erro={falhou ? form?.erro : undefined}
      valores={falhou ? form?.valores : undefined}
    />
    {#if lancado}
      <p class="ok-msg" role="status" data-testid="receita-lancada">
        Receita de {formatarBRL(lancado.valorCentavos)} lançada{#if lancado.mes !== data.mes}
          em {soNomeMes(lancado.mes)}.
          <a href={linkMes(lancado.mes)}>Ver {tituloMes(lancado.mes).toLowerCase()}</a>{:else}.{/if}
      </p>
    {/if}
  </div>

  <div class="col">
    {#if data.aReceber.length}
      <section class="a-receber" aria-labelledby="a-receber-titulo" data-testid="a-receber">
        <div class="col-head">
          <h2 class="sub" id="a-receber-titulo">A receber</h2>
          <p class="muted">
            {plural(data.aReceber.length, 'prevista vencida', 'previstas vencidas')}
          </p>
        </div>
        <p class="small muted">
          Receitas que as recorrentes lançaram. Confirme quando o dinheiro cair; se o valor ou a
          data reais forem outros, ajuste antes.
        </p>
        <ul class="previstas">
          {#each data.aReceber as r (r.id)}
            {@const f = falhaDaLinha(r.id)}
            <li class="prevista">
              <div class="prevista-info">
                <span class="row-title">{r.descricao ?? r.categoria}</span>
                <span class="row-meta"
                  >Prevista para {diaPorExtenso(r.data)} · {r.categoria}{r.contaNome
                    ? ` · ${r.contaNome}`
                    : ''}</span
                >
              </div>
              <form
                class="confirmar"
                method="POST"
                action="?/confirmar"
                use:enhance
                aria-label="Confirmar recebimento: {r.descricao ?? r.categoria}"
              >
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="mes" value={data.mes} />
                <div class="campos">
                  <div class="field">
                    <label for="cr-{r.id}-valor">Valor (R$)</label>
                    <input
                      id="cr-{r.id}-valor"
                      name="valor"
                      inputmode="decimal"
                      required
                      value={f?.valores?.valor ?? centavosParaCampo(r.valorCentavos)}
                      aria-invalid={f?.erros?.valor ? 'true' : undefined}
                    />
                    {#if f?.erros?.valor}<span class="err">{f.erros.valor}</span>{/if}
                  </div>
                  <div class="field">
                    <label for="cr-{r.id}-data">Data</label>
                    <input
                      id="cr-{r.id}-data"
                      name="data"
                      type="date"
                      required
                      min={primeiroDiaDoMes(mesDe(r.data))}
                      max={ultimoDiaDoMes(mesDe(r.data))}
                      value={f?.valores?.data ?? r.data}
                      aria-invalid={f?.erros?.data ? 'true' : undefined}
                      aria-describedby="cr-{r.id}-data-dica"
                    />
                    <span class="small muted" id="cr-{r.id}-data-dica"
                      >A data fica dentro de {soNomeMes(mesDe(r.data))}</span
                    >
                    {#if f?.erros?.data}<span class="err">{f.erros.data}</span>{/if}
                  </div>
                </div>
                {#if f?.erro}<p class="err" role="alert">{f.erro}</p>{/if}
                <div class="acts">
                  <button class="btn sm ink" type="submit">Recebi</button>
                  <button class="btn sm text" type="submit" formaction="?/naoRecebi" formnovalidate>
                    Não recebi
                  </button>
                </div>
              </form>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <div class="col-head">
      <h2 class="h-sec">{tituloMes(data.mes)}</h2>
      <p class="total"><Valor centavos={data.totalCentavos} testid="total-receitas" /></p>
    </div>
    <p class="muted">{plural(data.quantidade, 'lançamento', 'lançamentos')}</p>

    {#if data.fatias.length}
      <section class="cats" aria-label="Receitas por categoria" data-testid="receitas-categorias">
        <h3 class="sub">Por categoria</h3>
        <ul class="fatias">
          {#each data.fatias as f (f.categoria)}
            <li>
              <span class="fatia-head">
                <span>{f.categoria}</span>
                <span class="num"
                  >{formatarBRL(f.totalCentavos)} · {f.percentual.toLocaleString('pt-BR', {
                    maximumFractionDigits: 1,
                  })}%</span
                >
              </span>
              <span class="barra" aria-hidden="true"><i style="width: {f.percentual}%"></i></span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if data.dias.length}
      <div class="days" data-testid="lista-receitas">
        {#each data.dias as d (d.data)}
          <section class="day" aria-label={diaPorExtenso(d.data)}>
            <h3 class="day-head">
              <span>{diaPorExtenso(d.data)}</span>
              <span class="num">{formatarBRL(d.totalCentavos)}</span>
            </h3>
            <ul class="itens">
              {#each d.itens as r (r.id)}
                {@const prevista = r.confirmada === false}
                {@const f = falhaDaLinha(r.id)}
                <li>
                  <a
                    class="row lanc"
                    class:previa={prevista}
                    href={resolve('/receitas/[id]', { id: r.id })}
                  >
                    <span class="sq" style="--cc: {prevista ? 'var(--muted)' : 'var(--pos)'}"
                    ></span>
                    <span class="row-main">
                      <span class="row-title"
                        >{r.descricao ?? r.categoria}{#if r.recorrente}
                          <span class="tag">Recorrente</span>{/if}{#if prevista}
                          <span class="tag previa-tag">Prevista</span>{/if}</span
                      >
                      <span class="row-meta">{detalhe(r)}</span>
                    </span>
                    <span class="row-val num" class:pos={!prevista} class:previa-val={prevista}
                      >{formatarBRL(r.valorCentavos)}</span
                    >
                  </a>
                  {#if r.recorrente && !prevista}
                    <form class="desfazer" method="POST" action="?/desfazerConfirmacao" use:enhance>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="mes" value={data.mes} />
                      <button class="btn sm text" type="submit">Desfazer confirmação</button>
                    </form>
                  {/if}
                  {#if f?.acao === 'desfazerConfirmacao' && f.erro}
                    <p class="err desfazer-erro" role="alert">{f.erro}</p>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    {:else}
      <div class="empty">
        <strong>Nada recebido em {nomeMes}</strong>
        <span>Use o formulário ao lado. O valor aceita vírgula: 4.200,00.</span>
      </div>
    {/if}
    <p class="note">
      Salário ou bolsa todo mês? Cadastre em
      <a href={resolve('/receitas/recorrentes')}>Receitas recorrentes</a>, e o site lança sozinho.
    </p>
    <p class="note">
      Removeu algo sem querer? Está na <a href={resolve('/lixeira')}>lixeira</a>.
    </p>
  </div>
</section>

<style>
  .aviso {
    background: var(--orange-soft);
    padding-block: 12px;
    display: flex;
    align-items: center;
    gap: 8px 16px;
    flex-wrap: wrap;
    font-weight: 500;
  }
  #nova {
    scroll-margin-top: 96px;
  }
  .h-sec {
    font-size: var(--s-head);
  }
  .sub {
    font-size: var(--s-small);
    color: var(--muted);
    font-weight: 600;
    letter-spacing: 0;
  }
  .total {
    font-size: clamp(1.75rem, 1.2rem + 2vw, 3rem);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .fatias {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .fatia-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-weight: 600;
    font-size: 0.9375rem;
  }
  .barra {
    display: block;
    height: 6px;
    margin-top: 6px;
    background: var(--step);
    border-radius: 3px;
    overflow: hidden;
  }
  .barra i {
    display: block;
    height: 100%;
    background: var(--pos);
  }
  .days {
    display: grid;
    gap: 6px;
  }
  .day {
    display: grid;
    gap: 2px;
  }
  .day-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: var(--s-small);
    color: var(--muted);
    font-weight: 600;
    letter-spacing: 0;
    padding: 14px 12px 6px;
  }
  .day-head span:first-child::first-letter {
    text-transform: uppercase;
  }
  .itens {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lanc {
    color: inherit;
    text-decoration: none;
    transition:
      background-color var(--t),
      transform var(--t);
  }
  .lanc:hover {
    background: var(--step) !important;
  }
  .lanc:active {
    transform: scale(0.995);
  }
  .pos {
    color: var(--pos);
  }
  /* Previstas: tom neutro (não é dinheiro que já entrou). */
  .previa-val,
  .previa-tag {
    color: var(--muted);
  }
  .previa-tag {
    background: var(--step);
    color: var(--warn);
  }
  .previa .row-title {
    font-weight: 500;
  }
  .desfazer {
    padding: 0 12px 6px;
    display: flex;
    justify-content: flex-end;
  }
  .desfazer-erro {
    padding: 0 12px 6px;
  }
  .a-receber {
    display: grid;
    gap: 10px;
    margin-bottom: 28px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--line, var(--step));
  }
  .a-receber .col-head {
    align-items: baseline;
  }
  .previstas {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .prevista {
    display: grid;
    gap: 10px;
    padding: 14px 16px;
    background: var(--paper);
    border-radius: var(--r);
  }
  .prevista-info {
    display: grid;
    gap: 2px;
  }
  .confirmar {
    display: grid;
    gap: 10px;
  }
  .confirmar .campos {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px 14px;
  }
  .confirmar .field {
    display: grid;
    gap: 4px;
  }
  .confirmar .acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
  }
  .confirmar .err {
    font-size: 0.8125rem;
  }
  .note a,
  .ok-msg a {
    color: var(--ink);
    font-weight: 600;
    text-underline-offset: 4px;
  }
</style>

<script lang="ts">
  import { enhance } from '$app/forms';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { mesDe, primeiroDiaDoMes, ultimoDiaDoMes, type Mes } from '$lib/dominio/datas';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import ArrowDownLeft from '@lucide/svelte/icons/arrow-down-left';
  import Clock from '@lucide/svelte/icons/clock';
  import { centavosParaCampo, formatarBRL, somar } from '$lib/dominio/dinheiro';
  import FormReceita from '$lib/ui/FormReceita.svelte';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
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
  /** Previstas do mês (não confirmadas): não entram no total recebido. */
  const previstasMes = $derived(
    data.dias.flatMap((d) => d.itens).filter((i) => i.confirmada === false),
  );
  const recebidasMes = $derived(
    data.dias.flatMap((d) => d.itens).filter((i) => i.confirmada !== false).length,
  );
  const totalPrevistasCentavos = $derived(somar(previstasMes.map((i) => i.valorCentavos)));
  const lancado = $derived(
    form && 'lancado' in form
      ? form.lancado
      : data.lancadoSemJs
        ? {
            id: '',
            valorCentavos: data.lancadoSemJs,
            mes: data.mes,
            prevista: data.lancadoPrevista,
          }
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

<section class="resumo pad" aria-label="Resumo de {nomeMes}">
  <div class="card resumo-item">
    <div class="resumo-cab">
      <span class="ico ico-pos"><ArrowDownLeft size={20} /></span>
      <span class="resumo-rot">Recebido em {nomeMes}</span>
    </div>
    <p class="resumo-val pos"><Valor centavos={data.totalCentavos} testid="total-receitas" /></p>
    <p class="small muted">
      {plural(recebidasMes, 'receita confirmada', 'receitas confirmadas')}
    </p>
  </div>
  <div class="card resumo-item">
    <div class="resumo-cab">
      <span class="ico ico-warn"><Clock size={20} /></span>
      <span class="resumo-rot">A receber</span>
    </div>
    <p class="resumo-val neutro">
      <Valor centavos={totalPrevistasCentavos} testid="previstas-mes" />
    </p>
    <p class="small muted">
      {#if previstasMes.length}
        {plural(previstasMes.length, 'prevista', 'previstas')} em {nomeMes}, ainda não confirmadas
      {:else}
        Nenhuma prevista em {nomeMes}
      {/if}
      {#if data.aReceber.length}
        · <a href="#a-receber"
          >{plural(data.aReceber.length, 'vencida', 'vencidas')} para confirmar</a
        >
      {/if}
    </p>
  </div>
</section>

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
      perguntarRecebida
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
        Receita de {formatarBRL(lancado.valorCentavos)}
        {lancado.prevista ? 'lançada como prevista' : 'lançada'}{#if lancado.mes !== data.mes}
          em {soNomeMes(lancado.mes)}.
          <a href={linkMes(lancado.mes)}>Ver {tituloMes(lancado.mes).toLowerCase()}</a>{:else}.{/if}
      </p>
    {/if}
  </div>

  <div class="col">
    {#if data.aReceber.length}
      <section
        class="card a-receber"
        id="a-receber"
        aria-labelledby="a-receber-titulo"
        data-testid="a-receber"
      >
        <div class="col-head">
          <h2 class="sub" id="a-receber-titulo">A receber</h2>
          <p class="muted">
            {plural(data.aReceber.length, 'prevista vencida', 'previstas vencidas')}
          </p>
        </div>
        <p class="small muted">
          Receitas previstas cuja data já chegou. Elas só entram nos totais quando você confirma que
          o dinheiro caiu; se o valor ou a data reais forem outros, ajuste antes.
        </p>
        <ul class="previstas">
          {#each data.aReceber as r (r.id)}
            {@const f = falhaDaLinha(r.id)}
            <li class="prevista">
              <div class="prevista-topo">
                <IconeRedondo nome={r.descricao ?? r.categoria} cor="var(--warn)" suave />
                <div class="prevista-info">
                  <span class="row-title">{r.descricao ?? r.categoria}</span>
                  <span class="row-meta"
                    >Prevista para {diaPorExtenso(r.data)} · {r.categoria}{r.contaNome
                      ? ` · ${r.contaNome}`
                      : ''}</span
                  >
                </div>
                <span class="etiq etiq-prevista">Prevista</span>
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
                      min={r.recorrente ? primeiroDiaDoMes(mesDe(r.data)) : undefined}
                      max={r.recorrente ? ultimoDiaDoMes(mesDe(r.data)) : undefined}
                      value={f?.valores?.data ?? r.data}
                      aria-invalid={f?.erros?.data ? 'true' : undefined}
                      aria-describedby={r.recorrente ? `cr-${r.id}-data-dica` : undefined}
                    />
                    {#if r.recorrente}
                      <span class="small muted" id="cr-{r.id}-data-dica"
                        >A data fica dentro de {soNomeMes(mesDe(r.data))}</span
                      >
                    {/if}
                    {#if f?.erros?.data}<span class="err">{f.erros.data}</span>{/if}
                  </div>
                </div>
                {#if f?.erro}<p class="err" role="alert">{f.erro}</p>{/if}
                <div class="acts">
                  <button class="btn go recebi" type="submit">Recebi</button>
                  <button class="btn text" type="submit" formaction="?/naoRecebi" formnovalidate>
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
      <p class="muted">{plural(data.quantidade, 'lançamento', 'lançamentos')}</p>
    </div>

    {#if data.fatias.length}
      <section
        class="card cats"
        aria-label="Receitas por categoria"
        data-testid="receitas-categorias"
      >
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
            <ul class="rows">
              {#each d.itens as r (r.id)}
                {@const prevista = r.confirmada === false}
                {@const f = falhaDaLinha(r.id)}
                <li class="lanc-item">
                  <a class="row lanc" href={resolve('/receitas/[id]', { id: r.id })}>
                    <IconeRedondo
                      nome={r.descricao ?? r.categoria}
                      cor={prevista ? 'var(--muted)' : 'var(--pos)'}
                      suave={prevista}
                    />
                    <span class="row-main">
                      <span class="row-title"
                        >{r.descricao ?? r.categoria}{#if r.recorrente}
                          <span class="tag">Recorrente</span>{/if}{#if prevista}
                          <span class="etiq etiq-prevista">Prevista</span>{/if}</span
                      >
                      <span class="row-meta">{detalhe(r)}</span>
                    </span>
                    <span class="row-val num" class:pos={!prevista} class:previa-val={prevista}
                      >{prevista ? '' : '+'}{formatarBRL(r.valorCentavos)}</span
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
  #nova,
  #a-receber {
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

  /* Resumo do mês: dois cartões no topo */
  .resumo {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
    gap: 14px;
    padding-block: 4px 0;
  }
  .resumo-item {
    gap: 8px;
  }
  .resumo-cab {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .resumo-rot {
    font-weight: 600;
    color: var(--muted);
    font-size: 0.9375rem;
  }
  .ico {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
  }
  .ico-pos {
    background: var(--pos-soft);
    color: var(--pos);
  }
  .ico-warn {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .resumo-val {
    font-size: clamp(1.75rem, 1.2rem + 1.4vw, 2.25rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }
  .resumo-val.neutro {
    color: var(--muted);
  }
  .resumo-item .small a {
    color: var(--warn);
    font-weight: 600;
  }
  @media (max-width: 560px) {
    .resumo-val {
      font-size: 1.5rem;
    }
  }

  .h-sec {
    letter-spacing: -0.01em;
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
    gap: 16px;
  }
  .day {
    display: grid;
    gap: 8px;
  }
  .day-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: var(--s-small);
    color: var(--muted);
    font-weight: 600;
    letter-spacing: 0;
    padding: 0 4px;
  }
  .day-head span:first-child::first-letter {
    text-transform: uppercase;
  }
  .lanc-item {
    min-width: 0;
  }
  .lanc {
    color: inherit;
    text-decoration: none;
    transition: background-color var(--t);
  }
  .lanc:hover {
    background: var(--paper);
  }
  .pos {
    color: var(--pos);
    font-weight: 700;
  }
  /* Etiquetas: "Prevista" em âmbar, recorrência em azul do site */
  .etiq {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 1px 8px;
    border-radius: 999px;
    margin-left: 6px;
    vertical-align: 1px;
  }
  .etiq-prevista {
    background: var(--warn-soft);
    color: var(--warn);
  }
  /* Previstas: valor em cinza, sem o sinal de entrada */
  .previa-val {
    color: var(--muted);
    font-weight: 600;
  }
  .desfazer {
    padding: 0 16px 8px;
    display: flex;
    justify-content: flex-end;
  }
  .desfazer-erro {
    padding: 0 16px 8px;
  }
  .a-receber {
    gap: 12px;
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
    gap: 12px;
    padding: 14px 16px;
    background: var(--warn-soft);
    border-radius: var(--r-card);
  }
  .prevista-topo {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .prevista-info {
    display: grid;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .prevista-topo .etiq {
    margin-left: 0;
    flex: none;
  }
  .prevista .field input {
    background: var(--surface);
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
  .confirmar .recebi {
    flex: 1 1 160px;
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

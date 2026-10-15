<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { centavosParaCampo, formatarBRL } from '$lib/dominio/dinheiro';
  import GraficoMes from '$lib/ui/GraficoMes.svelte';
  import LinhaRazao from '$lib/ui/LinhaRazao.svelte';
  import ListaLancamentos from '$lib/ui/ListaLancamentos.svelte';
  import Medidor from '$lib/ui/Medidor.svelte';
  import NavMes from '$lib/ui/NavMes.svelte';
  import Valor from '$lib/ui/Valor.svelte';
  import { corCss, dataDeIso, plural, soNomeMes, tituloMes } from '$lib/ui/formato';
  import { ariaErro } from '$lib/ui/formularios';
  import { mesAtual, somarMeses, type Mes } from '$lib/dominio/datas';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const p = $derived(data.painel);
  const nomeMes = $derived(soNomeMes(p.mes));
  const linkMes = (m: Mes) => resolve(`/?mes=${m}`);
  const linkGastos = $derived(resolve(`/gastos?mes=${p.mes}`));
  // Sem JavaScript o formulário abre pela URL (?limite); depois de um erro, continua aberto.
  let editandoLimite = $derived(
    data.editarLimite || (form?.acao === 'limite' && !('ok' in form && form.ok)),
  );
  /** Nome do mês com o ano quando não for o ano corrente. */
  const mesNoTitulo = $derived(
    p.mes.slice(0, 4) === mesAtual().slice(0, 4) ? nomeMes : tituloMes(p.mes).toLowerCase(),
  );
</script>

<svelte:head>
  <title>Controle Financeiro · Painel</title>
</svelte:head>

<section class="hero pad" aria-labelledby="h-pat">
  <div class="hero-top">
    <h1 id="h-pat">Patrimônio líquido</h1>
    <p class="hero-note">
      {#if p.patrimonio.saldoAtualizadoEm}
        Último saldo informado em {dataDeIso(p.patrimonio.saldoAtualizadoEm)}
      {:else}
        Nenhum saldo informado ainda
      {/if}
    </p>
  </div>

  <p
    class="giant"
    aria-live="polite"
    style="--n: {formatarBRL(p.patrimonio.liquidoCentavos).length}"
  >
    <span class="rise"><Valor centavos={p.patrimonio.liquidoCentavos} testid="patrimonio" /></span>
  </p>

  <div class="hero-bottom">
    <div>
      <p class="hero-lead">
        {#if p.patrimonio.quantidadeContas}
          A soma dos saldos das suas contas. Cartões e bitcoin entram nesta conta quando chegarem ao
          site.
        {:else}
          Comece cadastrando suas contas com o saldo de hoje. O patrimônio sai da soma delas.
        {/if}
      </p>
      <div class="hero-acts">
        <a class="btn" href={resolve('/contas')}
          >{p.patrimonio.quantidadeContas ? 'Atualizar saldos' : 'Cadastrar contas'}</a
        >
        <a class="btn alt" href="{resolve('/gastos')}#novo">Novo gasto</a>
      </div>
    </div>
    <div class="ledger" aria-label="Composição do patrimônio">
      <LinhaRazao
        rotulo="Contas"
        detalhe={p.patrimonio.quantidadeContas
          ? plural(p.patrimonio.quantidadeContas, 'conta', 'contas')
          : 'nenhuma conta ainda'}
        centavos={p.patrimonio.contasCentavos}
      />
      <LinhaRazao rotulo="Patrimônio líquido" centavos={p.patrimonio.liquidoCentavos} total />
    </div>
  </div>
</section>

<section class="sec pad" aria-labelledby="h-mes" data-testid="painel-mes">
  <div class="sec-head">
    <h2 id="h-mes">Gastos de {mesNoTitulo}</h2>
    <NavMes mes={p.mes} href={linkMes} />
  </div>

  <div class="mes-grid">
    <div class="mes-sum">
      <p class="big"><Valor centavos={p.totalMesCentavos} testid="total-mes" /></p>
      {#if p.comparacao}
        <p class="delta" class:up={p.comparacao.diferencaCentavos > 0}>
          {p.comparacao.percentual > 0 ? '+' : ''}{p.comparacao.percentual}% em relação a {soNomeMes(
            somarMeses(p.mes, -1),
          )} até o dia {p.comparacao.ateDia}
        </p>
      {:else}
        <p class="delta muted">
          {p.ateDia === 0
            ? 'Este mês ainda não começou.'
            : 'Sem gastos no mês anterior para comparar.'}
        </p>
      {/if}

      <div class="limite">
        {#if p.limite && !editandoLimite}
          <Medidor s={p.limite} />
        {:else if !editandoLimite}
          <p>Defina quanto quer gastar por mês e acompanhe quanto ainda resta.</p>
        {/if}

        {#if editandoLimite}
          <form
            class="form-limite"
            method="POST"
            action="?/limite"
            use:enhance={() =>
              async ({ result, update }) => {
                await update({ reset: false });
                if (result.type === 'success') editandoLimite = false;
              }}
          >
            <div class="field">
              <label for="limite-valor">Limite por mês (R$)</label>
              <input
                id="limite-valor"
                name="valor"
                inputmode="decimal"
                placeholder="Vazio para não ter limite"
                {...ariaErro(
                  form?.acao === 'limite' ? form.erros?.valor : undefined,
                  'limite-valor',
                )}
                value={form?.acao === 'limite' && form.valores
                  ? form.valores.valor
                  : p.limite
                    ? centavosParaCampo(p.limite.limiteCentavos)
                    : ''}
              />
            </div>
            <div class="acts">
              <button class="btn ink sm" type="submit">Salvar limite</button>
              <a
                class="btn sm"
                href={resolve(`/?mes=${p.mes}`)}
                onclick={(e) => {
                  e.preventDefault();
                  editandoLimite = false;
                }}>Cancelar</a
              >
            </div>
          </form>
        {:else}
          <div>
            <a
              class="btn ink sm"
              href={resolve(`/?mes=${p.mes}&limite`)}
              onclick={(e) => {
                e.preventDefault();
                editandoLimite = true;
              }}>{p.limite ? 'Alterar limite' : 'Definir limite'}</a
            >
          </div>
        {/if}
        {#if form?.acao === 'limite'}
          {#if form.erros?.valor}<p class="err" role="alert" id="limite-valor-erro">
              {form.erros.valor}
            </p>{/if}
          {#if form.erro}<p class="err" role="alert">{form.erro}</p>{/if}
          {#if 'ok' in form && form.ok}<p class="ok-msg" role="status">{form.ok}</p>{/if}
        {/if}
      </div>
    </div>

    <GraficoMes atual={p.acumulado} anterior={p.acumuladoAnterior} ateDia={p.ateDia} />
  </div>

  <div class="col">
    <div class="col-head">
      <h3>Por categoria</h3>
      <a class="btn text" href={resolve('/categorias')}>Editar categorias</a>
    </div>
    {#if p.categorias.length}
      <div class="stack" aria-hidden="true">
        {#each p.categorias as c (c.categoriaId)}
          <span style="--cc: {corCss(c.cor)}; flex-grow: {c.totalCentavos}"></span>
        {/each}
      </div>
      <ul class="cat-list" data-testid="categorias-mes">
        {#each p.categorias as c (c.categoriaId)}
          <li class="cat">
            <span class="sq" style="--cc: {corCss(c.cor)}"></span>
            <span class="cat-nome">{c.nome}</span>
            <span class="num cat-val">{formatarBRL(c.totalCentavos)}</span>
            <span class="num pc">{c.percentual}%</span>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty">
        <strong>Nenhum gasto em {nomeMes}</strong>
        <span>Os gastos lançados aparecem aqui, somados por categoria.</span>
      </div>
    {/if}
  </div>
</section>

<section class="sec alt pad" aria-labelledby="h-lanc">
  <div class="two-col">
    <div class="col">
      <div class="col-head">
        <h2 id="h-lanc" class="h-sec">Lançamentos</h2>
        <span class="muted">{plural(p.quantidade, 'lançamento', 'lançamentos')}</span>
      </div>
      {#if p.dias.length}
        <ListaLancamentos dias={p.dias} limiteDias={5} />
        <a class="btn" href={linkGastos}>Ver todos os gastos de {nomeMes}</a>
      {:else}
        <div class="empty">
          <strong>Nada lançado em {nomeMes}</strong>
          <span>Lance o primeiro gasto: valor, categoria e pronto.</span>
          <a class="btn ink" href="{resolve('/gastos')}#novo">Lançar gasto</a>
        </div>
      {/if}
    </div>

    <div class="col">
      <div class="col-head">
        <h3>Contas</h3>
        <a class="btn text" href={resolve('/contas')}>Atualizar saldos</a>
      </div>
      <p class="note">Saldos informados por você. Lançar um gasto não muda esses valores.</p>
      {#if p.contas.length}
        <ul class="rows">
          {#each p.contas as c (c.id)}
            <li>
              <a class="row conta" href={resolve('/contas/[id]', { id: c.id })}>
                <span class="sq" style="--cc: var(--ink)"></span>
                <span class="row-main"><span class="row-title">{c.nome}</span></span>
                <span class="row-val num" class:neg={c.saldoCentavos < 0}
                  >{formatarBRL(c.saldoCentavos)}</span
                >
              </a>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="empty">
          <strong>Nenhuma conta ainda</strong>
          <span>Cadastre conta corrente, poupança, investimentos ou dinheiro em espécie.</span>
          <a class="btn ink" href={resolve('/contas')}>Cadastrar conta</a>
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  .hero {
    background: var(--surface);
    color: var(--ink);
    border-bottom: 1px solid var(--line);
    padding-block: clamp(28px, 5vw, 56px) clamp(28px, 5vw, 56px);
    display: grid;
    gap: clamp(20px, 3vw, 36px);
  }
  .hero-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px 24px;
    flex-wrap: wrap;
  }
  .hero h1 {
    font-size: var(--s-lead);
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .hero-note {
    font-size: 0.9375rem;
  }
  .giant {
    /* Encolhe com a quantidade de dígitos: um valor nunca é cortado. */
    font-size: min(var(--s-giant), calc((100vw - 2 * var(--gut)) / (var(--n, 12) * 0.56)));
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 0.88;
    white-space: nowrap;
    padding-bottom: 0.06em;
  }
  .giant span {
    display: inline-block;
  }
  .giant :global(.cur) {
    font-size: 0.32em;
    vertical-align: 0.95em;
    margin-right: 0.18em;
  }
  .giant :global(.cts) {
    font-size: 0.5em;
  }
  .hero-bottom {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 24px 48px;
    align-items: end;
  }
  @media (max-width: 860px) {
    .hero-bottom {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .hero-lead {
    font-size: 1.125rem;
    max-width: 34ch;
  }
  .hero-acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 18px;
  }
  .hero .btn {
    background: var(--orange);
    color: var(--orange-ink);
  }
  .hero .btn:hover {
    background: color-mix(in srgb, var(--orange) 88%, #000 12%);
  }
  .hero .btn.alt {
    background: var(--step);
    color: var(--ink);
  }
  .ledger {
    display: grid;
    gap: 4px;
  }

  .mes-grid {
    display: grid;
    grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
    gap: 32px 56px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .mes-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .mes-sum {
    display: grid;
    gap: 18px;
    align-content: start;
  }
  .big {
    font-size: clamp(2rem, 1.4rem + 2.4vw, 3rem);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 0.95;
  }
  .delta {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--pos);
  }
  .delta.up {
    color: var(--neg);
  }
  .delta.muted {
    color: var(--muted);
    font-weight: 500;
  }
  .limite {
    display: grid;
    gap: 12px;
    padding: 18px;
    background: var(--surface);
  }
  .limite .field input {
    background: var(--paper);
  }
  .form-limite,
  .acts {
    display: grid;
    gap: 10px;
  }
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .stack {
    display: flex;
    height: 28px;
    background: var(--step);
    overflow: hidden;
    gap: 2px;
  }
  .stack > span {
    height: 100%;
    background: var(--cc);
    min-width: 3px;
    flex-basis: 0;
  }
  .cat-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 2px 32px;
  }
  .cat {
    display: grid;
    grid-template-columns: 12px minmax(0, 1fr) auto 3em;
    gap: 12px;
    align-items: baseline;
    padding-block: 8px;
  }
  .cat .sq {
    align-self: center;
  }
  .cat-nome {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cat-val {
    font-weight: 600;
  }
  .pc {
    color: var(--muted);
    font-size: var(--s-small);
    text-align: right;
  }
  .h-sec {
    font-size: var(--s-head);
  }
  .conta {
    color: inherit;
    text-decoration: none;
    transition: background-color var(--t);
  }
  .conta:hover {
    background: var(--step) !important;
  }
  .neg {
    color: var(--neg);
  }
  .two-col > .col > .btn {
    justify-self: start;
  }
</style>

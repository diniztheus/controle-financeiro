<script lang="ts">
  import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import PiggyBank from '@lucide/svelte/icons/piggy-bank';
  import Target from '@lucide/svelte/icons/target';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { centavosParaCampo, formatarBRL } from '$lib/dominio/dinheiro';
  import GraficoMes from '$lib/ui/GraficoMes.svelte';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import ListaLancamentos from '$lib/ui/ListaLancamentos.svelte';
  import Medidor from '$lib/ui/Medidor.svelte';
  import NavMes from '$lib/ui/NavMes.svelte';
  import Rosca from '$lib/ui/Rosca.svelte';
  import Valor from '$lib/ui/Valor.svelte';
  import { ICONE_CONTA } from '$lib/ui/icones';
  import { corCss, dataDeIso, plural, soNomeMes, tituloMes } from '$lib/ui/formato';
  import { ariaErro } from '$lib/ui/formularios';
  import { mesAtual, somarMeses, type Mes } from '$lib/dominio/datas';
  import { ROTULO_TIPO } from '$lib/dominio/contas';
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
  /** Escopo marcado no formulário: o último envio (se falhou), senão o que está em vigor. */
  const escopoMarcado = $derived(
    form?.acao === 'limite' && form.valores?.escopo
      ? form.valores.escopo
      : data.limiteDoMes === 'mes'
        ? 'mes'
        : 'padrao',
  );
  /** Nome do mês com o ano quando não for o ano corrente. */
  const mesNoTitulo = $derived(
    p.mes.slice(0, 4) === mesAtual().slice(0, 4) ? nomeMes : tituloMes(p.mes).toLowerCase(),
  );
  /** Rosca: as 6 maiores categorias e o resto junto, para o desenho não virar confete. */
  const fatias = $derived.by(() => {
    const maiores = p.categorias.slice(0, 6).map((c) => ({
      valor: c.totalCentavos,
      cor: corCss(c.cor),
    }));
    const resto = p.categorias.slice(6).reduce((s, c) => s + c.totalCentavos, 0);
    return resto > 0 ? [...maiores, { valor: resto, cor: 'var(--c9)' }] : maiores;
  });
</script>

<svelte:head>
  <title>Controle Financeiro · Painel</title>
</svelte:head>

<div class="pad painel">
  <header class="ola">
    <div>
      <p class="muted">Olá! Este é o seu resumo de</p>
      <h1>{tituloMes(p.mes)}</h1>
    </div>
    <NavMes mes={p.mes} href={linkMes} />
  </header>

  <div class="topo">
    <section class="card saldo" aria-labelledby="h-pat">
      <div class="saldo-cab">
        <h2 id="h-pat">Patrimônio líquido</h2>
        <a class="saldo-link" href={resolve('/contas')}
          >{p.patrimonio.quantidadeContas ? 'Atualizar saldos' : 'Cadastrar contas'}
          <ChevronRight size={16} /></a
        >
      </div>
      <p class="giant" aria-live="polite">
        <span class="rise"
          ><Valor centavos={p.patrimonio.liquidoCentavos} testid="patrimonio" /></span
        >
      </p>
      <p class="saldo-nota">
        {#if !p.patrimonio.quantidadeContas}
          Comece cadastrando suas contas com o saldo de hoje. O patrimônio sai da soma delas.
        {:else if p.patrimonio.saldoAtualizadoEm}
          Último saldo informado em {dataDeIso(p.patrimonio.saldoAtualizadoEm)}
        {:else}
          Nenhum saldo informado ainda
        {/if}
      </p>
      <dl class="composicao" aria-label="Composição do patrimônio">
        <div>
          <dt>
            Contas
            <small
              >{p.patrimonio.quantidadeContas
                ? plural(p.patrimonio.quantidadeContas, 'conta', 'contas')
                : 'nenhuma conta ainda'}</small
            >
          </dt>
          <dd class="num">{formatarBRL(p.patrimonio.contasCentavos)}</dd>
        </div>
        {#if p.patrimonio.bitcoinCentavos > 0}
          <div>
            <dt>Bitcoin <small>ao último preço informado</small></dt>
            <dd class="num">{formatarBRL(p.patrimonio.bitcoinCentavos)}</dd>
          </div>
        {/if}
        {#if p.patrimonio.aPagarCartoesCentavos > 0}
          <div data-testid="cartoes-a-pagar">
            <dt>Cartões a pagar <small>parcelas em faturas não pagas</small></dt>
            <dd class="num">−{formatarBRL(p.patrimonio.aPagarCartoesCentavos)}</dd>
          </div>
        {/if}
      </dl>
    </section>

    <section class="resumo" aria-labelledby="h-mes" data-testid="painel-mes">
      <h2 id="h-mes" class="sr">Entradas e gastos de {mesNoTitulo}</h2>

      <div class="card stat">
        <div class="stat-cab">
          <span class="ico receita"><ArrowUpRight size={20} /></span>
          <span class="stat-rot">Receitas</span>
        </div>
        {#if p.fluxo.quantidadeReceitas}
          <p class="stat-val pos">
            <Valor centavos={p.fluxo.entradasCentavos} testid="entradas-mes" />
          </p>
          {#if p.aReceber.quantidade > 0}
            <p class="small stat-nota" data-testid="a-receber-home">
              A receber: <span class="num">{formatarBRL(p.aReceber.totalCentavos)}</span>
              ({plural(p.aReceber.quantidade, 'prevista', 'previstas')}) ·
              <a href={resolve('/receitas')}>ver receitas</a>
            </p>
          {/if}
        {:else}
          <p class="small stat-nota">
            Nenhuma receita neste mês. <a href="{resolve('/receitas')}#nova">Lançar receita</a>
          </p>
        {/if}
      </div>

      <div class="card stat">
        <div class="stat-cab">
          <span class="ico gasto"><ArrowDownRight size={20} /></span>
          <span class="stat-rot">Gastos</span>
        </div>
        <p class="stat-val neg"><Valor centavos={p.totalMesCentavos} testid="total-mes" /></p>
        {#if p.comparacao}
          <p class="small stat-nota delta" class:up={p.comparacao.diferencaCentavos > 0}>
            {p.comparacao.percentual > 0 ? '+' : ''}{p.comparacao.percentual}% em relação a {soNomeMes(
              somarMeses(p.mes, -1),
            )} até o dia {p.comparacao.ateDia}
          </p>
        {:else}
          <p class="small stat-nota">
            {p.ateDia === 0
              ? 'Este mês ainda não começou.'
              : 'Sem gastos no mês anterior para comparar.'}
          </p>
        {/if}
      </div>

      {#if p.fluxo.quantidadeReceitas}
        <div class="card stat">
          <div class="stat-cab">
            <span class="ico"><PiggyBank size={20} /></span>
            <span class="stat-rot">Sobra do mês</span>
          </div>
          <p class="stat-val" class:neg={p.fluxo.saldoCentavos < 0}>
            <Valor centavos={p.fluxo.saldoCentavos} testid="sobra-mes" />
          </p>
          {#if p.fluxo.taxaPoupancaPercentual !== null}
            <p class="small stat-nota">
              Taxa de poupança:
              <b class="num" data-testid="taxa-poupanca"
                >{p.fluxo.taxaPoupancaPercentual.toLocaleString('pt-BR', {
                  maximumFractionDigits: 1,
                })}%</b
              >
            </p>
          {/if}
        </div>
      {/if}

      <div class="card stat limite">
        <div class="stat-cab">
          <span class="ico"><Target size={20} /></span>
          <span class="stat-rot">Limite de gastos</span>
        </div>
        {#if p.limite && !editandoLimite}
          <Medidor s={p.limite} />
          <p class="small muted" data-testid="limite-tipo">
            {data.limiteDoMes === 'mes'
              ? 'Limite deste mês.'
              : 'Limite padrão, que vale para todos os meses.'}
          </p>
        {:else if !editandoLimite}
          <p class="small muted">Defina quanto quer gastar por mês e acompanhe quanto resta.</p>
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
            <input type="hidden" name="mes" value={p.mes} />
            <fieldset class="field escopo">
              <legend class="lbl">Vale para</legend>
              <label class="opc">
                <input type="radio" name="escopo" value="mes" checked={escopoMarcado === 'mes'} />
                Só este mês
              </label>
              <label class="opc">
                <input
                  type="radio"
                  name="escopo"
                  value="padrao"
                  checked={escopoMarcado === 'padrao'}
                />
                Todos os meses (padrão)
              </label>
            </fieldset>
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
              <button class="btn go sm" type="submit">Salvar limite</button>
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
              class="btn text sm"
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
    </section>
  </div>

  <div class="meio">
    <section class="card" aria-labelledby="h-cat">
      <div class="card-head">
        <h2 id="h-cat">Gastos por categoria</h2>
        <a class="btn text sm" href={resolve('/categorias')}>Editar categorias</a>
      </div>
      {#if p.categorias.length}
        <div class="cat-corpo">
          <Rosca {fatias} rotulo="Total" centro={formatarBRL(p.totalMesCentavos)} />
          <ul class="cat-list" data-testid="categorias-mes">
            {#each p.categorias as c (c.categoriaId)}
              <li class="cat">
                <IconeRedondo nome={c.nome} cor={corCss(c.cor)} tamanho={34} />
                <span class="cat-main">
                  <span class="cat-nome">{c.nome}</span>
                  <span class="barra" aria-hidden="true"
                    ><span style="--cc: {corCss(c.cor)}; width: {c.percentual}%"></span></span
                  >
                </span>
                <span class="cat-num">
                  <span class="num cat-val">{formatarBRL(c.totalCentavos)}</span>
                  <span class="num pc">{c.percentual}%</span>
                </span>
              </li>
            {/each}
          </ul>
        </div>
      {:else}
        <div class="empty">
          <strong>Nenhum gasto em {nomeMes}</strong>
          <span>Os gastos lançados aparecem aqui, somados por categoria.</span>
        </div>
      {/if}
    </section>
  </div>

  <div class="baixo">
    <section class="col" aria-labelledby="h-lanc">
      <div class="col-head">
        <h2 id="h-lanc">Últimos lançamentos</h2>
        {#if p.dias.length}
          <a class="btn text sm" href={linkGastos}>Ver todos</a>
        {/if}
      </div>
      {#if p.dias.length}
        <ListaLancamentos dias={p.dias} limiteDias={4} />
        <p class="small muted">{plural(p.quantidade, 'lançamento', 'lançamentos')} em {nomeMes}</p>
      {:else}
        <div class="empty">
          <strong>Nada lançado em {nomeMes}</strong>
          <span>Lance o primeiro gasto: valor, categoria e pronto.</span>
          <a class="btn go" href="{resolve('/gastos')}#novo">Lançar gasto</a>
        </div>
      {/if}
    </section>

    <div class="col lado">
      <section class="card" aria-labelledby="h-graf">
        <div class="card-head">
          <h2 id="h-graf">Gasto acumulado</h2>
          <span class="small muted">{tituloMes(p.mes)} contra o mês anterior</span>
        </div>
        <GraficoMes atual={p.acumulado} anterior={p.acumuladoAnterior} ateDia={p.ateDia} />
      </section>

      <section class="col" aria-labelledby="h-contas">
        <div class="col-head">
          <h2 id="h-contas">Contas</h2>
          <a class="btn text sm" href={resolve('/contas')}>Atualizar saldos</a>
        </div>
        {#if p.contas.length}
          <ul class="rows">
            {#each p.contas as c (c.id)}
              <li>
                <a class="row" href={resolve('/contas/[id]', { id: c.id })}>
                  <IconeRedondo icone={ICONE_CONTA[c.tipo]} cor="var(--orange)" suave />
                  <span class="row-main">
                    <span class="row-title">{c.nome}</span>
                    <span class="row-meta">{ROTULO_TIPO[c.tipo]}</span>
                  </span>
                  <span class="row-val num" class:neg={c.saldoCentavos < 0}
                    >{formatarBRL(c.saldoCentavos)}</span
                  >
                </a>
              </li>
            {/each}
          </ul>
          <p class="small muted">
            Saldos informados por você. Lançar um gasto não muda esses valores.
          </p>
        {:else}
          <div class="empty">
            <strong>Nenhuma conta ainda</strong>
            <span>Cadastre conta corrente, poupança, investimentos ou dinheiro em espécie.</span>
            <a class="btn go" href={resolve('/contas')}>Cadastrar conta</a>
          </div>
        {/if}
      </section>
    </div>
  </div>
</div>

<style>
  .painel {
    display: grid;
    gap: 20px;
    padding-block: clamp(20px, 3vw, 32px) 32px;
  }
  .ola {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 12px 24px;
    flex-wrap: wrap;
  }
  .ola h1 {
    font-size: clamp(1.5rem, 1.2rem + 1vw, 2rem);
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .topo {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 20px;
    align-items: stretch;
  }
  .baixo {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: 20px;
    align-items: start;
  }
  .lado {
    gap: 20px;
  }
  @media (max-width: 1100px) {
    .topo {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 860px) {
    .baixo {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* Cartão do saldo: o destaque da tela, na cor do site */
  .saldo {
    background: var(--hero);
    color: var(--hero-ink);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: clamp(20px, 2.6vw, 28px);
  }
  .composicao {
    margin-top: auto !important;
  }
  .saldo-cab {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .saldo h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    opacity: 0.85;
  }
  .saldo-link {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 36px;
    padding: 0 6px 0 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--hero-ink) 16%, transparent);
    color: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    text-decoration: none;
  }
  .saldo-link:hover {
    background: color-mix(in srgb, var(--hero-ink) 26%, transparent);
  }
  .giant {
    font-size: var(--s-giant);
    font-weight: 700;
    letter-spacing: -0.035em;
    line-height: 1;
    white-space: nowrap;
    overflow-wrap: normal;
  }
  .giant span {
    display: inline-block;
  }
  .giant :global(.cur) {
    font-size: 0.4em;
    vertical-align: 0.9em;
    margin-right: 0.2em;
  }
  .giant :global(.cts) {
    font-size: 0.55em;
  }
  .saldo-nota {
    font-size: 0.8125rem;
    opacity: 0.85;
  }
  .composicao {
    margin: 6px 0 0;
    display: grid;
    gap: 8px;
    padding-top: 14px;
    border-top: 1px solid color-mix(in srgb, var(--hero-ink) 22%, transparent);
  }
  .composicao div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .composicao dt {
    font-size: 0.875rem;
    font-weight: 600;
  }
  .composicao small {
    display: block;
    font-size: 0.75rem;
    font-weight: 400;
    opacity: 0.8;
  }
  .composicao dd {
    margin: 0;
    font-weight: 650;
    white-space: nowrap;
  }

  /* Resumo do mês: cartões pequenos lado a lado */
  .resumo {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: 20px;
  }
  .stat {
    gap: 8px;
  }
  @media (max-width: 560px) {
    .resumo {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 12px;
    }
    .stat {
      padding: 14px;
    }
    .stat-val {
      font-size: 1.25rem !important;
    }
    .stat-cab .ico {
      width: 32px;
      height: 32px;
    }
  }
  .stat-cab {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .stat-rot {
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
    background: var(--orange-soft);
    color: var(--orange);
  }
  .ico.gasto {
    background: var(--neg-soft);
    color: var(--neg);
  }
  .ico.receita {
    background: var(--pos-soft);
    color: var(--pos);
  }
  .stat-val {
    font-size: clamp(1.5rem, 1.2rem + 1vw, 1.875rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }
  .stat-val :global(.cur) {
    font-size: 0.5em;
    vertical-align: 0.6em;
  }
  .stat-nota {
    color: var(--muted);
  }
  .stat-nota a {
    color: var(--orange);
    font-weight: 600;
  }
  .stat-nota b {
    color: var(--ink);
  }
  .delta {
    color: var(--pos);
    font-weight: 600;
  }
  .delta.up {
    color: var(--neg);
  }
  .limite {
    grid-column: 1 / -1;
  }
  .escopo {
    gap: 8px;
  }
  .opc {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9375rem;
    color: var(--ink);
    font-weight: 500;
  }
  .escopo .opc input {
    width: auto;
    min-height: 0;
    margin: 0;
    accent-color: var(--orange);
  }
  .form-limite {
    display: grid;
    gap: 12px;
  }
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* Categorias: rosca e lista com barras */
  .cat-corpo {
    display: flex;
    gap: 24px;
    align-items: center;
  }
  @media (max-width: 560px) {
    .cat-corpo {
      flex-direction: column;
      align-items: stretch;
    }
    .cat-corpo > :global(.rosca) {
      align-self: center;
    }
  }
  .cat-list {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
    gap: 12px 28px;
  }
  .cat {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
  }
  .cat-main {
    display: grid;
    gap: 5px;
    min-width: 0;
  }
  .cat-nome {
    font-weight: 600;
    font-size: 0.9375rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .barra {
    height: 6px;
    border-radius: 999px;
    background: var(--step);
    overflow: hidden;
  }
  .barra span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--cc);
  }
  .cat-num {
    display: grid;
    justify-items: end;
  }
  .cat-val {
    font-weight: 650;
    font-size: 0.9375rem;
  }
  .pc {
    color: var(--muted);
    font-size: 0.75rem;
  }
</style>

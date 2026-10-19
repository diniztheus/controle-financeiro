<script lang="ts">
  import Search from '@lucide/svelte/icons/search';
  import { resolve } from '$app/paths';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import { corCss, diaCurto, plural, tituloMes } from '$lib/ui/formato';
  import { ariaErro } from '$lib/ui/formularios';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const v = $derived(data.valores);
  const receitas = $derived(data.tipo === 'receitas');
  /** Links de exportação para o período da busca (meses inteiros, como a tela de relatórios). */
  const linkExportar = (formato: 'csv' | 'json') =>
    data.periodo
      ? resolve(
          `/relatorios/exportar?de=${data.periodo.de}&ate=${data.periodo.ate}&formato=${formato}${receitas ? '&tipo=receitas' : ''}`,
        )
      : null;
  const exportarCsv = $derived(linkExportar('csv'));
  const exportarJson = $derived(linkExportar('json'));
</script>

<svelte:head>
  <title>Controle Financeiro · Busca</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Buscar lançamentos</h1>
    <p>
      {#if receitas}
        Procure receitas por texto, categoria, conta, situação ou valor. Sem datas, a busca cobre os
        últimos 12 meses.
      {:else}
        Procure gastos por texto, categoria, conta ou valor. Sem datas, a busca cobre os últimos 12
        meses.
      {/if}
    </p>
    <p class="voltar-l">
      <a class="voltar" href={resolve('/relatorios')}>Voltar aos relatórios</a>
    </p>
  </div>
</header>

<div class="pad abas">
  <span class="small muted">Procurar em:</span>
  <nav class="pilulas" aria-label="Procurar em">
    <a href={resolve('/busca')} aria-current={receitas ? undefined : 'page'}>Gastos</a>
    <a href={resolve('/busca?tipo=receitas')} aria-current={receitas ? 'page' : undefined}
      >Receitas</a
    >
  </nav>
</div>

<form class="pad busca" method="GET" action={resolve('/busca')} data-testid="filtros">
  {#if receitas}<input type="hidden" name="tipo" value="receitas" />{/if}

  <div class="caixa" class:com-erro={!!data.erros?.q}>
    <span class="lupa" aria-hidden="true"><Search size={22} /></span>
    <label class="sr" for="b-q">Texto</label>
    <input
      id="b-q"
      name="q"
      value={v.q}
      maxlength="80"
      placeholder={receitas
        ? 'Descrição, categoria ou conta'
        : 'Descrição, categoria, conta ou cartão'}
      {...ariaErro(data.erros?.q, 'b-q')}
    />
    <button class="btn go" type="submit">Buscar</button>
  </div>
  {#if data.erros?.q}<span class="err" id="b-q-erro">{data.erros.q}</span>{/if}

  <div class="grade-busca">
    <div class="col">
      <div class="col-head">
        <h2>Resultados</h2>
      </div>

      {#if data.erro}
        <p class="err" role="alert">{data.erro}</p>
      {:else if receitas && data.resultadoReceitas && data.periodo}
        <div class="resumo">
          <div class="card hero-card">
            <span class="rot">Total recebido</span>
            <span class="big num" data-testid="total-recebido"
              >{formatarBRL(data.resultadoReceitas.totalRecebidoCentavos)}</span
            >
          </div>
          <div class="card">
            <span class="small muted">Previsto, ainda não recebido</span>
            <span class="num valor-medio" data-testid="total-previsto"
              >{formatarBRL(data.resultadoReceitas.totalPrevistoCentavos)}</span
            >
          </div>
        </div>
        <p data-testid="contagem" class="small muted">
          {plural(data.resultadoReceitas.receitas.length, 'receita', 'receitas')}
          de {tituloMes(data.periodo.de).toLowerCase()} a {tituloMes(
            data.periodo.ate,
          ).toLowerCase()}
        </p>
        <p class="note">As previstas não entram no total recebido.</p>

        {#if data.resultadoReceitas.truncado}
          <p class="note" role="status">
            Mostrando só as 500 mais recentes. Refine os filtros ou diminua o período para ver o
            resto.
          </p>
        {/if}

        {#if data.resultadoReceitas.receitas.length}
          <ul class="rows" data-testid="resultados">
            {#each data.resultadoReceitas.receitas as r (r.id)}
              <li>
                <a class="row lanc" href={resolve('/receitas/[id]', { id: r.id })}>
                  <IconeRedondo nome={r.categoria} cor="var(--pos)" suave />
                  <span class="row-main">
                    <span class="row-title"
                      >{r.descricao ?? r.categoria}{#if r.confirmada === false}
                        <span class="tag">Prevista</span>{/if}</span
                    >
                    <span class="row-meta"
                      >{diaCurto(r.data)} · {r.categoria} · {r.contaNome ??
                        'Sem conta'}{r.recorrente ? ' · Recorrente' : ''}</span
                    >
                  </span>
                  <span class="row-val num pos">{formatarBRL(r.valorCentavos)}</span>
                </a>
              </li>
            {/each}
          </ul>

          {#if exportarCsv && exportarJson}
            <div class="exportar">
              <p class="note">
                A exportação traz todas as receitas dos meses do período, sem os outros filtros.
              </p>
              <div class="acts">
                <a class="btn" href={exportarCsv} data-sveltekit-reload>Exportar CSV</a>
                <a class="btn" href={exportarJson} data-sveltekit-reload>Exportar JSON</a>
              </div>
            </div>
          {/if}
        {:else}
          <div class="empty">
            <strong>Nenhuma receita encontrada</strong>
            <span>Confira os filtros ou amplie o período.</span>
          </div>
        {/if}
      {:else if data.resultado && data.periodo}
        <div class="resumo">
          <div class="card hero-card">
            <span class="rot">Total encontrado</span>
            <span class="big num" data-testid="total-busca"
              >{formatarBRL(data.resultado.totalCentavos)}</span
            >
          </div>
        </div>
        <p data-testid="contagem" class="small muted">
          {plural(data.resultado.lancamentos.length, 'lançamento', 'lançamentos')}
          de {tituloMes(data.periodo.de).toLowerCase()} a {tituloMes(
            data.periodo.ate,
          ).toLowerCase()}
        </p>

        {#if data.resultado.truncado}
          <p class="note" role="status">
            Mostrando só os 500 mais recentes. Refine os filtros ou diminua o período para ver o
            resto.
          </p>
        {/if}

        {#if data.resultado.lancamentos.length}
          <ul class="rows" data-testid="resultados">
            {#each data.resultado.lancamentos as l (l.compraId + ':' + l.parcela)}
              <li>
                <a class="row lanc" href={resolve('/gastos/[id]', { id: l.compraId })}>
                  <IconeRedondo nome={l.categoriaNome} cor={corCss(l.categoriaCor)} />
                  <span class="row-main">
                    <span class="row-title"
                      >{l.descricao ?? l.categoriaNome}{#if l.numParcelas > 1}
                        <span class="tag num">{l.parcela}/{l.numParcelas}</span>{/if}</span
                    >
                    <span class="row-meta"
                      >{diaCurto(l.data)} · {l.categoriaNome} · {l.meio === 'cartao'
                        ? (l.cartaoNome ?? 'Cartão')
                        : (l.contaNome ?? 'Sem conta')}</span
                    >
                  </span>
                  <span class="row-val num neg">−{formatarBRL(l.valorCentavos)}</span>
                </a>
              </li>
            {/each}
          </ul>

          {#if exportarCsv && exportarJson}
            <div class="exportar">
              <p class="note">
                A exportação traz todos os lançamentos dos meses do período, sem os outros filtros.
              </p>
              <div class="acts">
                <a class="btn" href={exportarCsv} data-sveltekit-reload>Exportar CSV</a>
                <a class="btn" href={exportarJson} data-sveltekit-reload>Exportar JSON</a>
              </div>
            </div>
          {/if}
        {:else}
          <div class="empty">
            <strong>Nenhum lançamento encontrado</strong>
            <span>Confira os filtros ou amplie o período.</span>
          </div>
        {/if}
      {:else}
        <div class="empty">
          <strong>Busca com erro</strong>
          <span>Corrija os campos destacados ao lado e busque de novo.</span>
        </div>
      {/if}
    </div>

    <div class="col-direita">
      <div class="card filtros">
        <div class="card-head">
          <h2>Filtros</h2>
        </div>

        {#if receitas}
          <div class="campos">
            <div class="field">
              <label for="b-categoria">Categoria</label>
              <select id="b-categoria" name="categoria">
                <option value="">Todas</option>
                {#each data.categoriasReceita as c (c)}
                  <option value={c} selected={v.categoria === c}>{c}</option>
                {/each}
              </select>
            </div>
            <div class="field">
              <label for="b-situacao">Situação</label>
              <select
                id="b-situacao"
                name="situacao"
                {...ariaErro(data.erros?.situacao, 'b-situacao')}
              >
                <option value="" selected={v.situacao === ''}>Todas</option>
                <option value="recebida" selected={v.situacao === 'recebida'}>Recebidas</option>
                <option value="prevista" selected={v.situacao === 'prevista'}>Previstas</option>
              </select>
              {#if data.erros?.situacao}<span class="err" id="b-situacao-erro"
                  >{data.erros.situacao}</span
                >{/if}
            </div>
          </div>
        {:else}
          <div class="campos">
            <div class="field">
              <label for="b-categoria">Categoria</label>
              <select id="b-categoria" name="categoria">
                <option value="">Todas</option>
                {#each data.categorias as c (c.id)}
                  <option value={c.id} selected={v.categoria === c.id}>{c.nome}</option>
                {/each}
              </select>
            </div>
            <div class="field">
              <label for="b-meio">Pago com</label>
              <select id="b-meio" name="meio">
                <option value="" selected={v.meio === ''}>Qualquer</option>
                <option value="conta" selected={v.meio === 'conta'}>Conta</option>
                <option value="cartao" selected={v.meio === 'cartao'}>Cartão</option>
              </select>
            </div>
          </div>
        {/if}

        <div class="campos">
          <div class="field">
            <label for="b-de">De</label>
            <input
              id="b-de"
              name="de"
              type="date"
              value={v.de}
              {...ariaErro(data.erros?.de, 'b-de')}
            />
            {#if data.erros?.de}<span class="err" id="b-de-erro">{data.erros.de}</span>{/if}
          </div>
          <div class="field">
            <label for="b-ate">Até</label>
            <input
              id="b-ate"
              name="ate"
              type="date"
              value={v.ate}
              {...ariaErro(data.erros?.ate, 'b-ate')}
            />
            {#if data.erros?.ate}<span class="err" id="b-ate-erro">{data.erros.ate}</span>{/if}
          </div>
        </div>

        <div class="field">
          <label for="b-origem">{receitas ? 'Conta' : 'Conta ou cartão'}</label>
          <input
            id="b-origem"
            name="origem"
            value={v.origem}
            list="b-origens"
            maxlength="60"
            placeholder="Nome exato, como aparece na lista"
            {...ariaErro(data.erros?.origem, 'b-origem')}
          />
          <datalist id="b-origens">
            {#each data.contas as c (c.id)}
              <option value={c.nome}></option>
            {/each}
          </datalist>
          {#if data.erros?.origem}<span class="err" id="b-origem-erro">{data.erros.origem}</span
            >{/if}
        </div>

        <div class="campos">
          <div class="field">
            <label for="b-min">Valor mínimo (R$)</label>
            <input
              id="b-min"
              name="min"
              class="num"
              inputmode="decimal"
              value={v.min}
              {...ariaErro(data.erros?.min, 'b-min')}
            />
            {#if data.erros?.min}<span class="err" id="b-min-erro">{data.erros.min}</span>{/if}
          </div>
          <div class="field">
            <label for="b-max">Valor máximo (R$)</label>
            <input
              id="b-max"
              name="max"
              class="num"
              inputmode="decimal"
              value={v.max}
              {...ariaErro(data.erros?.max, 'b-max')}
            />
            {#if data.erros?.max}<span class="err" id="b-max-erro">{data.erros.max}</span>{/if}
          </div>
        </div>

        {#if data.temFiltro}
          <div class="acts">
            <a class="btn" href={resolve(receitas ? '/busca?tipo=receitas' : '/busca')}
              >Limpar filtros</a
            >
          </div>
        {/if}
      </div>
    </div>
  </div>
</form>

<style>
  .abas {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding-bottom: 16px;
  }
  .abas nav > a {
    min-height: 44px;
    padding: 0 18px;
  }

  /* Campo de busca grande, com a lupa e o botão dentro da mesma pílula */
  .busca {
    display: grid;
    gap: 8px;
    padding-bottom: clamp(16px, 2vw, 24px);
  }
  .caixa {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 6px 6px 6px 18px;
    border-radius: 999px;
    background: var(--surface);
    box-shadow: var(--shadow);
    transition: box-shadow var(--t);
  }
  .caixa:focus-within {
    box-shadow:
      0 0 0 3px var(--orange-soft),
      var(--shadow);
  }
  .caixa.com-erro {
    box-shadow: 0 0 0 3px var(--neg-soft);
  }
  .lupa {
    display: grid;
    place-items: center;
    flex: none;
    color: var(--muted);
  }
  .caixa input {
    flex: 1;
    min-width: 0;
    min-height: 48px;
    padding: 0;
    border: 0;
    background: transparent;
    font-size: 1.0625rem;
    outline: none;
  }
  .caixa input::placeholder {
    color: var(--muted);
  }
  .caixa .btn {
    min-height: 48px;
    padding: 0 22px;
    border-radius: 999px;
  }

  .grade-busca {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: 20px;
    align-items: start;
    padding-bottom: clamp(40px, 6vw, 80px);
  }
  @media (max-width: 960px) {
    .grade-busca {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .col {
    display: grid;
    gap: 14px;
    min-width: 0;
    align-content: start;
  }
  .col-direita {
    min-width: 0;
  }
  @media (min-width: 961px) {
    .col-direita {
      position: sticky;
      top: 16px;
    }
  }
  .filtros {
    gap: 16px;
  }
  .campos {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  @media (max-width: 420px) {
    .campos {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* Totais em destaque, na cor do site */
  .resumo {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: 12px;
  }
  .hero-card {
    background: var(--hero);
    color: var(--hero-ink);
    box-shadow: none;
    gap: 6px;
  }
  .hero-card .rot {
    font-size: var(--s-small);
    font-weight: 600;
    opacity: 0.85;
  }
  .big {
    font-size: clamp(1.75rem, 1.2rem + 2vw, 2.5rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }
  .valor-medio {
    font-size: clamp(1.25rem, 1rem + 0.8vw, 1.625rem);
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .lanc {
    color: inherit;
    text-decoration: none;
  }
  .lanc:hover .row-title {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .exportar {
    display: grid;
    gap: 10px;
  }
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pos {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }
</style>

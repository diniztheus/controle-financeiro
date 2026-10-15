<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import { corCss, diaCurto, plural, tituloMes } from '$lib/ui/formato';
  import { ariaErro } from '$lib/ui/formularios';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const v = $derived(data.valores);
  /** Links de exportação para o período da busca (meses inteiros, como a tela de relatórios). */
  const linkExportar = (formato: 'csv' | 'json') =>
    data.periodo
      ? resolve(
          `/relatorios/exportar?de=${data.periodo.de}&ate=${data.periodo.ate}&formato=${formato}`,
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
      Procure gastos por texto, categoria, conta ou valor. Sem datas, a busca cobre os últimos 12
      meses.
    </p>
    <p class="voltar-l">
      <a class="voltar" href={resolve('/relatorios')}>Voltar aos relatórios</a>
    </p>
  </div>
</header>

<section class="sec alt pad grade">
  <div class="col">
    <div class="col-head">
      <h2 class="h">Resultados</h2>
    </div>

    {#if data.erro}
      <p class="err" role="alert">{data.erro}</p>
    {:else if data.resultado && data.periodo}
      <div class="resumo">
        <p class="resumo-total">
          <span class="muted small">Total encontrado</span>
          <span class="big num" data-testid="total-busca"
            >{formatarBRL(data.resultado.totalCentavos)}</span
          >
        </p>
        <p data-testid="contagem">
          {plural(data.resultado.lancamentos.length, 'lançamento', 'lançamentos')}
          de {tituloMes(data.periodo.de).toLowerCase()} a {tituloMes(
            data.periodo.ate,
          ).toLowerCase()}
        </p>
      </div>

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
                <span class="sq" style="--cc: {corCss(l.categoriaCor)}"></span>
                <span class="row-main">
                  <span class="row-title"
                    >{l.descricao ?? l.categoriaNome}{#if l.numParcelas > 1}
                      <span class="num small muted">{l.parcela}/{l.numParcelas}</span>{/if}</span
                  >
                  <span class="row-meta"
                    >{diaCurto(l.data)} · {l.categoriaNome} · {l.meio === 'cartao'
                      ? (l.cartaoNome ?? 'Cartão')
                      : (l.contaNome ?? 'Sem conta')}</span
                  >
                </span>
                <span class="row-val num">{formatarBRL(l.valorCentavos)}</span>
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
    <div class="painel-form">
      <h2>Filtros</h2>
      <form class="fc" method="GET" action={resolve('/busca')} data-testid="filtros">
        <div class="field">
          <label for="b-q">Texto</label>
          <input
            id="b-q"
            name="q"
            value={v.q}
            maxlength="80"
            placeholder="Descrição, categoria, conta ou cartão"
            {...ariaErro(data.erros?.q, 'b-q')}
          />
          {#if data.erros?.q}<span class="err" id="b-q-erro">{data.erros.q}</span>{/if}
        </div>

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

        <div class="field">
          <label for="b-origem">Conta ou cartão</label>
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

        <div class="acts">
          <button class="btn ink" type="submit">Buscar</button>
          {#if data.temFiltro}
            <a class="btn" href={resolve('/busca')}>Limpar filtros</a>
          {/if}
        </div>
      </form>
    </div>
  </div>
</section>

<style>
  .lanc {
    color: inherit;
    text-decoration: none;
  }
  .lanc:hover .row-title {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .resumo {
    display: grid;
    gap: 6px;
  }
  .resumo-total {
    display: grid;
    gap: 2px;
  }
  .big {
    font-size: clamp(1.75rem, 1.2rem + 2vw, 2.5rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .painel-form form {
    display: grid;
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
  .exportar {
    display: grid;
    gap: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>

<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { ariaErro } from '$lib/ui/formularios';
  import { resolve } from '$app/paths';
  import EscolhaCor from '$lib/ui/EscolhaCor.svelte';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import { corCss, plural } from '$lib/ui/formato';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const erroCriar = $derived(form?.acao === 'criar' && !('ok' in form) ? form : null);
  /** Linha aberta para edição (sem JavaScript, vem da URL: ?editar=<id>). */
  let editando = $derived<string | null>(data.editar);
  const salvarEdicao: SubmitFunction =
    () =>
    async ({ result, update }) => {
      await update({ reset: false });
      if (result.type === 'success') editando = null;
    };
</script>

<svelte:head>
  <title>Controle Financeiro · Categorias</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Categorias</h1>
    <p>
      Renomeie, troque a cor e ponha na ordem em que aparecem ao lançar. Arquivar tira a categoria
      das opções sem mexer nos gastos antigos.
    </p>
    <p class="voltar-l"><a class="voltar" href={resolve('/gastos')}>‹ Voltar aos gastos</a></p>
  </div>
</header>

<section class="sec alt pad grade">
  <div class="col">
    <ul class="rows cats" data-testid="lista-categorias">
      {#each data.ativas as c, i (c.id)}
        {@const erroLinha = form?.id === c.id && !('ok' in form) ? form : null}
        {@const erroEdicao =
          erroLinha && (erroLinha.acao === 'editar' || erroLinha.acao === 'arquivar')
            ? erroLinha
            : null}
        <li class="cat">
          <div class="cat-linha">
            <IconeRedondo nome={c.nome} cor={corCss(c.cor)} tamanho={40} />
            <span class="cat-nome">{c.nome}</span>
            <span class="muted small num">{plural(c.uso, 'gasto', 'gastos')}</span>
            <div class="cat-acts">
              <form method="POST" action="?/mover" use:enhance class="inline">
                <input type="hidden" name="id" value={c.id} />
                <button
                  class="btn sm"
                  name="direcao"
                  value="subir"
                  disabled={i === 0}
                  aria-label="Subir {c.nome}">↑</button
                >
                <button
                  class="btn sm"
                  name="direcao"
                  value="descer"
                  disabled={i === data.ativas.length - 1}
                  aria-label="Descer {c.nome}">↓</button
                >
              </form>
              <a
                class="btn sm"
                href={resolve(`/categorias?editar=${c.id}`)}
                aria-expanded={editando === c.id}
                onclick={(e) => {
                  e.preventDefault();
                  editando = editando === c.id ? null : c.id;
                }}>Editar</a
              >
            </div>
          </div>
          {#if erroLinha?.acao === 'mover'}<p class="err" role="alert">{erroLinha.erro}</p>{/if}
          {#if form?.acao === 'editar' && form.id === c.id && 'ok' in form}
            <p class="ok-msg" role="status">{form.ok}</p>
          {/if}
          {#if editando === c.id || erroEdicao}
            <div class="editar">
              <form class="fe" method="POST" action="?/editar" use:enhance={salvarEdicao}>
                <input type="hidden" name="id" value={c.id} />
                <div class="field">
                  <label for="n-{c.id}">Nome</label>
                  <input
                    id="n-{c.id}"
                    name="nome"
                    maxlength="40"
                    required
                    value={erroEdicao?.valores?.nome ?? c.nome}
                    {...ariaErro(erroEdicao?.erros?.nome, `n-${c.id}`)}
                  />
                  {#if erroEdicao?.erros?.nome}<span class="err" id="n-{c.id}-erro"
                      >{erroEdicao.erros.nome}</span
                    >{/if}
                </div>
                <EscolhaCor id="cor-{c.id}" valor={erroEdicao?.valores?.cor ?? c.cor} />
                <div class="acts">
                  <button class="btn ink sm" type="submit">Salvar</button>
                </div>
              </form>
              <form method="POST" action="?/arquivar" use:enhance>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="arquivar" value="sim" />
                <button class="btn sm" type="submit">Arquivar</button>
              </form>
              {#if erroEdicao?.erro}<p class="err" role="alert">{erroEdicao.erro}</p>{/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    {#if data.arquivadas.length}
      <div class="col-head arq-head"><h2 class="h">Arquivadas</h2></div>
      <ul class="rows cats">
        {#each data.arquivadas as c (c.id)}
          <li class="cat arquivada">
            <div class="cat-linha">
              <IconeRedondo nome={c.nome} cor={corCss(c.cor)} tamanho={40} />
              <span class="cat-nome">{c.nome}</span>
              <span class="muted small num">{plural(c.uso, 'gasto', 'gastos')}</span>
              <form method="POST" action="?/arquivar" use:enhance>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="arquivar" value="nao" />
                <button class="btn sm" type="submit">Desarquivar</button>
              </form>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="painel-form">
    <h2>Nova categoria</h2>
    <form class="fe" method="POST" action="?/criar" use:enhance autocomplete="off">
      <div class="field">
        <label for="nova-nome">Nome</label>
        <input
          id="nova-nome"
          name="nome"
          maxlength="40"
          required
          placeholder="Ex.: Pets, Viagens"
          value={erroCriar?.valores?.nome ?? ''}
          {...ariaErro(erroCriar?.erros?.nome, 'nova-nome')}
        />
        {#if erroCriar?.erros?.nome}<span class="err" id="nova-nome-erro"
            >{erroCriar.erros.nome}</span
          >{/if}
      </div>
      <EscolhaCor id="nova-cor" valor={erroCriar?.valores?.cor || null} automatica />
      {#if erroCriar?.erro}<p class="err" role="alert">{erroCriar.erro}</p>{/if}
      <div><button class="btn ink" type="submit">Criar categoria</button></div>
      {#if form?.acao === 'criar' && 'ok' in form}<p class="ok-msg" role="status">{form.ok}</p>{/if}
    </form>
  </div>
</section>

<style>
  .cats {
    min-width: 0;
  }
  .cat {
    padding: 12px 14px;
    display: grid;
    gap: 12px;
    min-width: 0;
    --chip-bg: var(--paper);
  }
  .cat .field input {
    background: var(--paper);
  }
  .cat-linha {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    gap: 12px;
    align-items: center;
  }
  .cat-nome {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cat-acts,
  .inline,
  .acts {
    display: flex;
    gap: 4px;
  }
  .cat-acts .btn {
    min-width: 44px;
  }
  .btn:disabled {
    cursor: default;
    opacity: 0.4;
  }
  .editar {
    display: grid;
    gap: 12px;
    padding: 4px 0 6px 52px;
  }
  .fe {
    display: grid;
    gap: 14px;
  }
  .arquivada .cat-nome {
    color: var(--muted);
  }
  .arq-head {
    margin-top: 24px;
  }
  .h {
    font-size: var(--s-lead);
  }
  @media (max-width: 520px) {
    .cat-linha {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }
    .cat-linha > .muted {
      display: none;
    }
    .editar {
      padding-left: 0;
    }
  }
</style>

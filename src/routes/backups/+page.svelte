<script lang="ts">
  import Archive from '@lucide/svelte/icons/archive';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Clock from '@lucide/svelte/icons/clock';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import { dataHoraBR, ROTULO_TIPO_BACKUP, tamanhoLegivel } from '$lib/ui/backupsFormato';
  import { ariaErro } from '$lib/ui/formularios';
  import { plural } from '$lib/ui/formato';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  // Resultado de cada formulário: sucesso tem `ok`; falha tem `erro` ou `erros`.
  const sucesso = (acao: string) => (form && form.acao === acao && 'ok' in form ? form : null);
  const falha = (acao: string) => (form && form.acao === acao && !('ok' in form) ? form : null);

  const okSalvar = $derived(sucesso('salvar'));
  const falhaSalvar = $derived(falha('salvar'));
  const okAgora = $derived(sucesso('agora'));
  const falhaAgora = $derived(falha('agora'));
  const okVerificar = $derived(sucesso('verificar'));
  const falhaVerificar = $derived(falha('verificar'));
  const falhaExcluir = $derived(falha('excluir'));
  const okExcluir = $derived(sucesso('excluir'));

  const valorManter = $derived(falhaSalvar?.valores?.manter ?? String(data.config.manter));
  const proximo = $derived(
    data.proximo === 'desligado' ? 'desligado' : data.proximo === 'hoje' ? 'hoje' : 'amanhã',
  );
</script>

<svelte:head>
  <title>Controle Financeiro · Backups</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Backups</h1>
    <p>
      Cópias do banco guardadas neste computador. Um backup automático é feito uma vez por dia,
      antes de qualquer mudança grande, e as cópias antigas são apagadas conforme o limite
      escolhido.
    </p>
  </div>
</header>

{#if data.restaurado}
  <div class="pad" role="status" data-testid="restaurado">
    <div class="aviso-ok">
      <IconeRedondo icone={CircleCheck} cor="var(--pos)" tamanho={36} suave />
      <p>
        Backup restaurado. O banco anterior foi guardado como “Antes de restaurar”:
        <span class="num">{data.restaurado}</span>
      </p>
    </div>
  </div>
{/if}

<section class="sec pad" aria-labelledby="h-auto">
  <div class="card">
    <div class="cabeca">
      <IconeRedondo icone={Clock} cor="var(--orange)" suave />
      <div class="cabeca-texto">
        <h2 id="h-auto">Backup automático</h2>
        <p>Mantém uma cópia por dia enquanto o site estiver rodando.</p>
      </div>
    </div>

    <div class="duo">
      <form class="auto bloco" method="POST" action="?/salvar" use:enhance>
        <label class="marcar">
          <input type="checkbox" name="ativo" checked={data.config.ativo} />
          <span>Fazer backup automático todo dia</span>
        </label>
        <div class="field">
          <label for="b-manter">Manter os últimos</label>
          <div class="linha-campo">
            <input
              id="b-manter"
              class="inp num"
              name="manter"
              type="number"
              inputmode="numeric"
              min="1"
              max="365"
              step="1"
              value={valorManter}
              {...ariaErro(falhaSalvar?.erros?.manter, 'b-manter')}
            />
            <span>backups automáticos</span>
          </div>
          {#if falhaSalvar?.erros?.manter}
            <span class="err" id="b-manter-erro">{falhaSalvar.erros.manter}</span>
          {/if}
        </div>
        <div class="acoes">
          <button class="btn go" type="submit">Salvar</button>
        </div>
        {#if okSalvar}
          <p class="ok-msg" role="status" data-testid="auto-salvo">{okSalvar.ok}</p>
        {:else if falhaSalvar?.erro}
          <p class="err" role="alert">{falhaSalvar.erro}</p>
        {/if}
      </form>

      <dl class="fatos" data-testid="estado-auto">
        <div>
          <dt>Situação</dt>
          <dd>
            <span class="etiqueta" class:ok={data.config.ativo} data-testid="auto-situacao"
              >{data.config.ativo ? 'Ligado' : 'Desligado'}</span
            >
          </dd>
        </div>
        <div>
          <dt>Último automático</dt>
          <dd class="num" data-testid="auto-ultimo">
            {data.config.ultimoAutomatico
              ? dataHoraBR(data.config.ultimoAutomatico)
              : 'nenhum ainda'}
          </dd>
        </div>
        <div>
          <dt>Próximo</dt>
          <dd data-testid="auto-proximo">{proximo}</dd>
        </div>
        <div>
          <dt>Mantidos</dt>
          <dd class="num">{data.config.manter}</dd>
        </div>
      </dl>
    </div>

    {#if data.config.ultimaFalha}
      <p class="alerta" role="alert" data-testid="auto-falha">
        <TriangleAlert size={18} strokeWidth={2.2} aria-hidden="true" />
        <span>
          A última tentativa de backup automático falhou: {data.config.ultimaFalha}. Faça um backup
          agora para conferir o banco.
        </span>
      </p>
    {/if}
  </div>
</section>

<section class="sec pad" aria-labelledby="h-lista">
  <div class="card">
    <div class="cabeca">
      <IconeRedondo icone={Archive} cor="var(--orange)" suave />
      <div class="cabeca-texto">
        <h2 id="h-lista">Backups guardados</h2>
        <p class="num" data-testid="total-backups">
          {plural(data.backups.length, 'backup', 'backups')} · {tamanhoLegivel(data.totalBytes)} no total
        </p>
      </div>
      <form method="POST" action="?/agora" use:enhance class="controle">
        <button class="btn go" type="submit">Fazer backup agora</button>
      </form>
    </div>

    {#if okAgora}
      <p class="ok-msg" role="status" data-testid="backup-feito">{okAgora.ok}</p>
    {:else if falhaAgora?.erro}
      <p class="err" role="alert">{falhaAgora.erro}</p>
    {/if}
    {#if okExcluir}
      <p class="ok-msg" role="status">{okExcluir.ok}</p>
    {/if}
    {#if falhaExcluir?.erro}
      <p class="err" role="alert">{falhaExcluir.erro}</p>
    {/if}

    {#if data.backups.length}
      <ul class="rows lista-backups" data-testid="lista-backups">
        {#each data.backups as b (b.nome)}
          <li class="row linha-backup" data-testid="backup-linha" data-nome={b.nome}>
            <IconeRedondo
              icone={Archive}
              cor={b.tipo === 'antes-de-restaurar' ? 'var(--warn)' : 'var(--pos)'}
              tamanho={38}
              suave
            />
            <span class="row-main">
              <span class="row-title">
                {dataHoraBR(b.criadoEm)}
                <span class="tag" data-tipo={b.tipo}>{ROTULO_TIPO_BACKUP[b.tipo]}</span>
              </span>
              <span class="row-meta num">{b.nome}</span>
            </span>
            <span class="row-val num">{tamanhoLegivel(b.bytes)}</span>
            <div class="acoes-backup">
              <a class="btn sm" href={resolve('/backups/restaurar/[nome]', { nome: b.nome })}>
                Restaurar<span class="sr"> {b.nome}</span>
              </a>
              <details class="excluir">
                <summary class="btn sm perigo">Excluir<span class="sr"> {b.nome}</span></summary>
                <form method="POST" action="?/excluir" use:enhance class="confirma">
                  <input type="hidden" name="nome" value={b.nome} />
                  <p>Apagar este backup? Não dá para desfazer.</p>
                  <button class="btn sm perigo" type="submit">Confirmar exclusão</button>
                </form>
              </details>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty">
        <strong>Nenhum backup ainda</strong>
        <span>Use “Fazer backup agora” ou aguarde o backup automático de hoje.</span>
      </div>
    {/if}

    <p class="note">
      Os arquivos ficam na pasta <span class="path num">{data.pasta}</span>. Para ter uma cópia fora
      deste computador, copie essa pasta para outro disco.
    </p>
  </div>
</section>

<section class="sec pad" aria-labelledby="h-integridade">
  <div class="card">
    <div class="cabeca">
      {#if data.integridade && !data.integridade.ok}
        <IconeRedondo icone={ShieldAlert} cor="var(--neg)" suave />
      {:else}
        <IconeRedondo icone={ShieldCheck} cor="var(--pos)" suave />
      {/if}
      <div class="cabeca-texto">
        <h2 id="h-integridade">Integridade</h2>
        <p>Confere se o banco está inteiro, sem tabelas nem registros quebrados.</p>
      </div>
      <form method="POST" action="?/verificar" use:enhance class="controle">
        <button class="btn go" type="submit">Verificar agora</button>
      </form>
    </div>

    {#if data.integridade}
      {#if data.integridade.ok}
        <p class="etiqueta ok">Tudo ok</p>
        <p class="ok-msg" data-testid="integridade-ok">Última verificação: nenhum problema.</p>
      {:else}
        <p class="etiqueta falha">Problemas</p>
        <p class="err" role="alert" data-testid="integridade-problemas">
          Última verificação: o banco apresentou problemas.
        </p>
        <ul class="rows erros">
          {#each data.integridade.mensagens as m, i (i)}
            <li class="row">
              <span class="row-main"><span class="row-title erro-texto">{m}</span></span>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="note num">Verificado em {dataHoraBR(data.integridade.verificadoEm)}</p>
    {:else}
      <p class="note">Ainda não verificado nesta execução.</p>
    {/if}

    {#if okVerificar}
      <p class="ok-msg" role="status" data-testid="verificacao-feita">{okVerificar.ok}</p>
    {:else if falhaVerificar?.erro}
      <p class="err" role="alert">{falhaVerificar.erro}</p>
    {/if}
  </div>
</section>

<style>
  .card {
    gap: 18px;
  }
  .cabeca {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .cabeca-texto {
    display: grid;
    gap: 2px;
    min-width: 0;
    flex: 1 1 220px;
  }
  .cabeca h2 {
    font-size: 1.0625rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .cabeca p {
    color: var(--muted);
    font-size: 0.9375rem;
  }
  .controle {
    margin-left: auto;
  }
  .duo {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 760px) {
    .duo {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .bloco {
    padding: clamp(16px, 2vw, 20px);
    border-radius: var(--r-card);
    background: var(--paper);
  }
  .auto {
    display: grid;
    gap: 16px;
    align-content: start;
  }
  .auto .field input {
    background: var(--surface);
    border-color: var(--line);
  }
  .marcar {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-weight: 500;
    cursor: pointer;
    min-height: 44px;
  }
  .marcar input {
    width: 20px;
    height: 20px;
    margin-top: 2px;
    accent-color: var(--orange);
  }
  .linha-campo {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .linha-campo .inp {
    width: 7em;
  }
  .acoes {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .etiqueta {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    min-height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 650;
    background: var(--step);
    color: var(--muted);
    margin: 0;
  }
  .etiqueta.ok {
    background: var(--pos-soft);
    color: var(--pos);
  }
  .etiqueta.falha {
    background: var(--neg-soft);
    color: var(--neg);
  }
  .fatos {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
  }
  .fatos div {
    background: var(--paper);
    padding: 14px 16px;
    border-radius: var(--r);
    display: grid;
    gap: 4px;
    min-width: 0;
    align-content: start;
  }
  .fatos dt {
    font-size: var(--s-small);
    color: var(--muted);
  }
  .fatos dd {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .aviso-ok {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: var(--r-card);
    background: var(--pos-soft);
    color: var(--ink);
  }
  .aviso-ok p {
    margin: 0;
    font-weight: 600;
  }
  .alerta {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 16px;
    border-radius: var(--r);
    background: var(--neg-soft);
    color: var(--neg);
    font-weight: 600;
    font-size: 0.9375rem;
  }
  .alerta :global(svg) {
    flex: none;
    margin-top: 2px;
  }
  .lista-backups .row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    flex-wrap: wrap;
  }
  .acoes-backup {
    grid-column: 2 / -1;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .excluir {
    position: relative;
  }
  .excluir summary {
    list-style: none;
    cursor: pointer;
  }
  .excluir summary::-webkit-details-marker {
    display: none;
  }
  .confirma {
    display: grid;
    gap: 8px;
    margin-top: 8px;
    padding: 12px;
    border-radius: var(--r);
    background: var(--neg-soft);
    max-width: 36ch;
  }
  .confirma p {
    margin: 0;
  }
  .path {
    overflow-wrap: anywhere;
    font-weight: 600;
  }
  .erros {
    border-radius: var(--r);
    overflow: hidden;
  }
  .erros .row {
    background: var(--neg-soft);
    min-height: 0;
  }
  .erro-texto {
    white-space: normal;
    color: var(--neg);
    font-weight: 500;
  }
  @media (max-width: 480px) {
    .lista-backups .row {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }
    .acoes-backup {
      grid-column: 1 / -1;
    }
    .controle {
      margin-left: 0;
      width: 100%;
    }
    .controle .btn {
      width: 100%;
    }
  }
</style>

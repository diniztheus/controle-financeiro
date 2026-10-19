<script lang="ts">
  import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Clock from '@lucide/svelte/icons/clock';
  import Database from '@lucide/svelte/icons/database';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Table from '@lucide/svelte/icons/table';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { enhance } from '$app/forms';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import LinhaRazao from '$lib/ui/LinhaRazao.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let salvando = $state(false);

  const st = $derived(data.status);

  const NOMES: Record<string, string> = {
    contas: 'Contas',
    saldos_historico: 'Histórico de saldos',
    categorias: 'Categorias',
    cartoes: 'Cartões',
    compras: 'Compras',
    parcelas: 'Parcelas',
    faturas: 'Faturas',
    btc_movimentos: 'Movimentos de bitcoin',
    btc_precos: 'Preços do bitcoin',
    limites_mensais: 'Limites do mês',
    config: 'Preferências',
  };

  /** Última onda do plano já entregue. */
  const ONDA_ATUAL = 1;
  const ONDAS = [
    { n: 0, nome: 'Fundação', o: 'Projeto de pé, banco criado sozinho, backup e esta página.' },
    { n: 1, nome: 'Núcleo', o: 'Contas, categorias, gastos à vista, painel do mês e importação.' },
    { n: 2, nome: 'Cartão de crédito', o: 'Compras parceladas, faturas e limite disponível.' },
    { n: 3, nome: 'Bitcoin em sats', o: 'Posição em sats, preço médio e cotação automática.' },
    { n: 4, nome: 'Visão completa', o: 'Evolução do patrimônio, relatórios, busca e exportação.' },
    { n: 5, nome: 'Acabamento', o: 'Backups diários, PIN opcional, atalhos e iniciar com o PC.' },
  ];

  const fmtInt = (n: number) => n.toLocaleString('pt-BR');
  const pad2 = (n: number) => String(n).padStart(2, '0');
  function quando(iso: string | number): string {
    const d = new Date(iso);
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} às ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function tamanho(bytes: number): { inteiro: string; cauda: string } {
    if (bytes < 1024 * 1024)
      return { inteiro: fmtInt(Math.max(1, Math.round(bytes / 1024))), cauda: 'KB' };
    return {
      inteiro: (bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 }),
      cauda: 'MB',
    };
  }
  const tam = $derived(st ? tamanho(st.bytes) : { inteiro: '0', cauda: 'KB' });
</script>

<svelte:head>
  <title>Controle Financeiro · Estado do sistema</title>
</svelte:head>

<section
  class="sec pad"
  aria-labelledby="h-estado"
  data-testid="status"
  data-ok={st?.ok ? 'sim' : 'nao'}
>
  <div class="card cabeca">
    <div class="cabeca-topo">
      <IconeRedondo
        icone={st?.ok ? ShieldCheck : ShieldAlert}
        cor={st?.ok ? 'var(--pos)' : 'var(--neg)'}
        tamanho={52}
        suave
      />
      <div class="cabeca-texto">
        <h1 id="h-estado">Estado do sistema</h1>
        <p class="hero-note">
          {#if st}Verificado em {quando(st.verificadoEm)}{:else}Não foi possível ler o banco{/if}
        </p>
      </div>
    </div>

    <p class="etiqueta" class:ok={st?.ok} class:falha={!st?.ok} aria-live="polite">
      <span class="rise" data-testid="veredito">{st?.ok ? 'Tudo ok' : 'Atenção'}</span>
    </p>

    <div class="cabeca-base">
      <div class="cabeca-acoes">
        {#if st?.ok}
          <p class="hero-lead">
            O banco {st.criadoAgora ? 'foi criado agora' : 'está conectado'} e o esquema está em dia.
            Todas as seções do site estão funcionando.
          </p>
        {:else if st}
          <p class="hero-lead">
            O banco abriu, mas algo não bate: {st.migrationsPendentes} migration(s) pendente(s),
            {st.tabelasPresentes} de {st.tabelasEsperadas} tabelas, verificação “{st.pragmas
              .integridadeRapida}”.
          </p>
        {:else}
          <p class="hero-lead">O banco não respondeu: {data.erro}</p>
        {/if}

        {#if st}
          <form
            class="hero-acts"
            method="POST"
            action="?/backup"
            use:enhance={() => {
              salvando = true;
              return async ({ update }) => {
                await update({ reset: false });
                salvando = false;
              };
            }}
          >
            <button class="btn go" type="submit" disabled={salvando}>
              {salvando ? 'Copiando…' : 'Fazer backup agora'}
            </button>
          </form>
          {#if form?.backup}
            <p class="hero-msg ok-msg" role="status" data-testid="backup-feito">
              Backup criado: {form.backup}
            </p>
          {:else if form?.erroBackup}
            <p class="hero-msg err" role="alert">Falhou: {form.erroBackup}</p>
          {/if}
        {/if}
      </div>

      {#if st}
        <div class="ledger" aria-label="Resumo do banco">
          <LinhaRazao
            rotulo="Tabelas"
            detalhe="do esquema completo"
            inteiro={fmtInt(st.tabelasPresentes)}
            cauda={`/${st.tabelasEsperadas}`}
            testid="linha-tabelas"
          />
          <LinhaRazao
            rotulo="Migrations aplicadas"
            detalhe={st.versaoEsquema ?? 'nenhuma'}
            inteiro={fmtInt(st.migrationsAplicadas)}
            testid="linha-migrations"
          />
          <LinhaRazao
            rotulo="Backups guardados"
            detalhe="na pasta de dados"
            inteiro={fmtInt(st.backups.length)}
          />
          <LinhaRazao
            rotulo="Tamanho do banco"
            detalhe="arquivo e diário"
            inteiro={tam.inteiro}
            cauda={tam.cauda}
          />
          <LinhaRazao
            rotulo="Integridade"
            detalhe={data.integridade
              ? `verificada em ${quando(data.integridade.verificadoEm)}`
              : 'ainda não verificada'}
            inteiro={data.integridade ? (data.integridade.ok ? 'ok' : 'problemas') : '—'}
            testid="linha-integridade"
          />
          <LinhaRazao
            rotulo="Backup automático"
            detalhe={data.backupAuto?.ultimoAutomatico
              ? `último em ${quando(data.backupAuto.ultimoAutomatico)}`
              : 'nenhum automático ainda'}
            inteiro={data.backupAuto?.ativo ? 'ligado' : 'desligado'}
            testid="linha-backup-auto"
          />
          <LinhaRazao
            rotulo={st.conectado ? 'Banco conectado' : 'Banco sem resposta'}
            detalhe={`SQLite ${st.pragmas.sqliteVersao} · ${st.pragmas.journalMode.toUpperCase()}`}
            inteiro={st.ok ? 'ok' : '—'}
            total
          />
        </div>
      {/if}
    </div>
  </div>
</section>

{#if st}
  <section class="sec pad" aria-labelledby="h-dados">
    <div class="sec-head">
      <div>
        <h2 id="h-dados">Onde ficam seus dados</h2>
        <p>Fora da pasta do código. Apagar ou atualizar o site nunca toca no banco.</p>
      </div>
    </div>

    <div class="two-col">
      <div class="col">
        <div class="card caminho">
          <div class="caminho-cab">
            <IconeRedondo icone={Database} cor="var(--orange)" tamanho={38} suave />
            <span class="lbl">Arquivo do banco</span>
          </div>
          <span class="path" data-testid="caminho-banco">{st.bancoArquivo}</span>
        </div>
        <div class="card caminho">
          <div class="caminho-cab">
            <IconeRedondo icone={ArchiveRestore} cor="var(--orange)" tamanho={38} suave />
            <span class="lbl">Pasta de backups</span>
          </div>
          <span class="path">{st.backupsDir}</span>
        </div>
        <p class="note">
          Para mudar o lugar, defina <b>DADOS_DIR</b> no arquivo <b>.env</b> do projeto. Um backup
          também pode ser feito pelo terminal com <b>pnpm backup</b>.
        </p>
      </div>

      <div class="col">
        <dl class="fatos">
          <div>
            <dt>Diário</dt>
            <dd>{st.pragmas.journalMode === 'wal' ? 'WAL' : st.pragmas.journalMode}</dd>
          </div>
          <div>
            <dt>Chaves estrangeiras</dt>
            <dd>{st.pragmas.foreignKeys ? 'ligadas' : 'desligadas'}</dd>
          </div>
          <div>
            <dt>Espera em bloqueio</dt>
            <dd class="num">{st.pragmas.busyTimeoutMs / 1000} s</dd>
          </div>
          <div>
            <dt>Verificação rápida</dt>
            <dd>{st.pragmas.integridadeRapida}</dd>
          </div>
        </dl>
        <div class="col-head"><h3>Últimos backups</h3></div>
        {#if st.backups.length}
          <ul class="rows">
            {#each st.backups.slice(0, 4) as b (b.nome)}
              <li class="row">
                <IconeRedondo icone={ArchiveRestore} cor="var(--pos)" tamanho={36} suave />
                <span class="row-main"><span class="row-title num">{b.nome}</span></span>
                <span class="row-val num">{tamanho(b.bytes).inteiro} {tamanho(b.bytes).cauda}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="empty">
            <strong>Nenhum backup ainda</strong>
            <span
              >Use o botão no topo ou rode pnpm backup. Antes de cada migration nova, um backup é
              feito sozinho.</span
            >
          </div>
        {/if}
      </div>
    </div>
  </section>

  <section class="sec pad" aria-labelledby="h-esquema">
    <div class="sec-head">
      <div>
        <h2 id="h-esquema">Esquema do banco</h2>
        <p>
          Versão {st.versaoEsquema ?? 'nenhuma'}. Valores em centavos e sats inteiros, regras
          conferidas pelo próprio banco.
        </p>
      </div>
    </div>

    <div class="two-col">
      <div class="col">
        <div class="col-head">
          <h3>Tabelas</h3>
          <span class="note num">{st.tabelasPresentes} de {st.tabelasEsperadas}</span>
        </div>
        <ul class="rows tabelas">
          {#each st.tabelas as t, i (t.nome)}
            <li class="row">
              <IconeRedondo icone={Table} cor="var(--c{i % 11})" tamanho={36} suave />
              <span class="row-main">
                <span class="row-title">{NOMES[t.nome] ?? t.nome}</span>
                <span class="row-meta">{t.nome}</span>
              </span>
              <span class="row-val num">
                {#if t.linhas < 0}<span class="neg">faltando</span>{:else}{fmtInt(t.linhas)}<small
                    >{t.linhas === 1 ? 'linha' : 'linhas'}</small
                  >{/if}
              </span>
            </li>
          {/each}
        </ul>
      </div>

      <div class="col">
        <div class="col-head">
          <h3>Migrations</h3>
          <span class="note num"
            >{st.migrationsAplicadas} aplicada{st.migrationsAplicadas === 1 ? '' : 's'}</span
          >
        </div>
        <ul class="rows">
          {#each st.migrations as m (m.tag)}
            <li class="row">
              {#if m.aplicadaEm}
                <IconeRedondo icone={CircleCheck} cor="var(--pos)" tamanho={36} suave />
              {:else}
                <IconeRedondo icone={TriangleAlert} cor="var(--warn)" tamanho={36} suave />
              {/if}
              <span class="row-main">
                <span class="row-title">{m.tag}</span>
                <span class="row-meta"
                  >{m.aplicadaEm ? `gerada em ${quando(m.aplicadaEm)}` : 'pendente'}</span
                >
              </span>
              <span class="etiqueta pequena" class:ok={m.aplicadaEm} class:aviso={!m.aplicadaEm}
                >{m.aplicadaEm ? 'aplicada' : 'pendente'}</span
              >
            </li>
          {/each}
        </ul>
        <p class="note">
          Mudança de esquema entra sempre por migration nova, com backup automático antes de
          aplicar.
        </p>
      </div>
    </div>
  </section>
{/if}

<section class="sec pad" aria-labelledby="h-ondas">
  <div class="sec-head">
    <div>
      <h2 id="h-ondas">O que vem a seguir</h2>
      <p>
        Cada onda termina com o site funcionando e os testes passando. Numeração do plano
        (docs/PLANO-SITE-LOCAL.md).
      </p>
    </div>
  </div>
  <ol class="rows ondas">
    {#each ONDAS as o (o.n)}
      <li class="row" class:feita={o.n <= ONDA_ATUAL}>
        {#if o.n <= ONDA_ATUAL}
          <IconeRedondo icone={CircleCheck} cor="var(--pos)" tamanho={36} suave />
        {:else}
          <IconeRedondo icone={Clock} cor="var(--c9)" tamanho={36} suave />
        {/if}
        <span class="row-main">
          <span class="row-title onda-nome"
            >{o.nome}{#if o.n <= ONDA_ATUAL}<span class="etiqueta pequena ok">pronta</span
              >{/if}</span
          >
          <span class="row-meta onda-o">{o.o}</span>
        </span>
        <span class="onda-n num">Onda {o.n}</span>
      </li>
    {/each}
  </ol>
</section>

<style>
  .cabeca {
    gap: 18px;
    padding: clamp(20px, 3vw, 28px);
  }
  .cabeca-topo {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .cabeca-texto {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .cabeca h1 {
    font-size: var(--s-head);
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .hero-note {
    font-size: 0.9375rem;
    color: var(--muted);
  }
  /* "Tudo ok" é uma etiqueta: verde quando está bem, vermelha quando há problema */
  .etiqueta {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    min-height: 40px;
    padding: 0 16px;
    border-radius: 999px;
    font-size: clamp(1.125rem, 0.9rem + 0.8vw, 1.375rem);
    font-weight: 700;
    letter-spacing: -0.01em;
    background: var(--step);
    color: var(--muted);
  }
  .etiqueta.ok {
    background: var(--pos-soft);
    color: var(--pos);
  }
  .etiqueta.falha {
    background: var(--neg-soft);
    color: var(--neg);
  }
  .etiqueta.aviso {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .etiqueta.pequena {
    min-height: 28px;
    padding: 0 10px;
    font-size: 0.8125rem;
    margin-left: 8px;
    vertical-align: 1px;
  }
  .cabeca-base {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 20px 32px;
    align-items: start;
  }
  @media (max-width: 860px) {
    .cabeca-base {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .cabeca-acoes {
    display: grid;
    gap: 12px;
  }
  .hero-lead {
    font-size: 1.0625rem;
    max-width: 38ch;
  }
  .hero-acts {
    display: flex;
    flex-wrap: wrap;
  }
  .hero-msg {
    font-size: 0.9375rem;
    overflow-wrap: anywhere;
  }
  .ledger {
    display: grid;
    gap: 8px;
  }

  /* Caminhos */
  .caminho {
    gap: 12px;
    padding: 18px;
  }
  .caminho-cab {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .lbl {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--muted);
  }
  .path {
    font-size: clamp(1.0625rem, 0.9rem + 0.6vw, 1.25rem);
    font-weight: 650;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  .note b {
    color: var(--ink);
    font-weight: 600;
  }
  .fatos {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
  }
  .fatos div {
    background: var(--surface);
    box-shadow: var(--shadow);
    border-radius: var(--r);
    padding: 14px 16px;
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .fatos dt {
    font-size: var(--s-small);
    color: var(--muted);
  }
  .fatos dd {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }

  /* Listas: a linha de cada onda ganha ícone e a etiqueta de pronta */
  .ondas .row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .onda-nome {
    font-size: 1rem;
  }
  .onda-o {
    white-space: normal;
  }
  .onda-n {
    color: var(--muted);
    font-weight: 600;
    font-size: var(--s-small);
  }
  .ondas li.feita .row-title {
    color: var(--ink);
  }
  @media (max-width: 560px) {
    .fatos {
      grid-template-columns: minmax(0, 1fr);
    }
    .ondas .row {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .ondas .onda-n {
      grid-column: 2;
      justify-self: start;
    }
  }
</style>

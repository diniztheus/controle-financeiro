<script lang="ts">
  import { enhance } from '$app/forms';
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
  class="hero pad"
  aria-labelledby="h-estado"
  data-testid="status"
  data-ok={st?.ok ? 'sim' : 'nao'}
>
  <div class="hero-top">
    <h1 id="h-estado">Estado do sistema</h1>
    <p class="hero-note">
      {#if st}Verificado em {quando(st.verificadoEm)}{:else}Não foi possível ler o banco{/if}
    </p>
  </div>

  <p class="giant" aria-live="polite">
    <span class="rise" data-testid="veredito">{st?.ok ? 'Tudo ok' : 'Atenção'}</span>
  </p>

  <div class="hero-bottom">
    <div>
      {#if st?.ok}
        <p class="hero-lead">
          O banco {st.criadoAgora ? 'foi criado agora' : 'está conectado'} e o esquema está em dia. As
          telas de contas, gastos, cartões e bitcoin chegam nas próximas ondas.
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
          <button class="btn" type="submit" disabled={salvando}>
            {salvando ? 'Copiando…' : 'Fazer backup agora'}
          </button>
        </form>
        {#if form?.backup}
          <p class="hero-msg" role="status" data-testid="backup-feito">
            Backup criado: {form.backup}
          </p>
        {:else if form?.erroBackup}
          <p class="hero-msg" role="alert">Falhou: {form.erroBackup}</p>
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
          rotulo={st.conectado ? 'Banco conectado' : 'Banco sem resposta'}
          detalhe={`SQLite ${st.pragmas.sqliteVersao} · ${st.pragmas.journalMode.toUpperCase()}`}
          inteiro={st.ok ? 'ok' : '—'}
          total
        />
      </div>
    {/if}
  </div>
</section>

{#if st}
  <section class="sec alt pad" aria-labelledby="h-dados">
    <div class="sec-head">
      <div>
        <h2 id="h-dados">Onde ficam seus dados</h2>
        <p>Fora da pasta do código. Apagar ou atualizar o site nunca toca no banco.</p>
      </div>
    </div>

    <div class="two-col">
      <div class="col">
        <div class="caminho">
          <span class="lbl">Arquivo do banco</span>
          <span class="path" data-testid="caminho-banco">{st.bancoArquivo}</span>
        </div>
        <div class="caminho">
          <span class="lbl">Pasta de backups</span>
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
                <span class="sq" style="--cc: var(--pos)"></span>
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
              <span class="sq" style="--cc: var(--c{i % 11})"></span>
              <span class="row-main">
                <span class="row-title">{NOMES[t.nome] ?? t.nome}</span>
                <span class="row-meta">{t.nome}</span>
              </span>
              <span class="row-val num">
                {#if t.linhas < 0}faltando{:else}{fmtInt(t.linhas)}<small
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
              <span class="sq" style="--cc: {m.aplicadaEm ? 'var(--pos)' : 'var(--warn)'}"></span>
              <span class="row-main">
                <span class="row-title">{m.tag}</span>
                <span class="row-meta"
                  >{m.aplicadaEm ? `gerada em ${quando(m.aplicadaEm)}` : 'pendente'}</span
                >
              </span>
              <span class="row-val">{m.aplicadaEm ? 'aplicada' : 'pendente'}</span>
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

<section class="sec alt pad" aria-labelledby="h-ondas">
  <div class="sec-head">
    <div>
      <h2 id="h-ondas">O que vem a seguir</h2>
      <p>
        Cada onda termina com o site funcionando e os testes passando. O uso diário começa na Onda
        1.
      </p>
    </div>
  </div>
  <ol class="ondas">
    {#each ONDAS as o (o.n)}
      <li class:feita={o.n === 0}>
        <span class="onda-n num">Onda {o.n}</span>
        <span class="onda-nome"
          >{o.nome}{#if o.n === 0}<span class="tag">pronta</span>{/if}</span
        >
        <span class="onda-o">{o.o}</span>
      </li>
    {/each}
  </ol>
</section>

<footer class="foot pad">
  <p class="name">Controle Financeiro</p>
  <p>Versão 0.0, Onda 0. Rodando só neste computador, em 127.0.0.1: nada fica exposto na rede.</p>
</footer>

<style>
  /* Campo laranja */
  .hero {
    background: var(--orange);
    color: var(--orange-ink);
    padding-block: clamp(32px, 6vw, 72px) clamp(36px, 6vw, 80px);
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
    font-size: var(--s-giant);
    font-weight: 700;
    letter-spacing: -0.045em;
    line-height: 0.88;
    white-space: nowrap;
    overflow: hidden;
    padding-bottom: 0.06em;
  }
  .giant span {
    display: inline-block;
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
    background: var(--orange-ink);
    color: var(--orange);
  }
  .hero .btn:hover {
    background: color-mix(in srgb, var(--orange-ink) 85%, var(--orange) 15%);
  }
  .hero-msg {
    margin-top: 12px;
    font-size: 0.9375rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .ledger {
    display: grid;
    gap: 4px;
  }

  /* Caminhos e fatos */
  .caminho {
    display: grid;
    gap: 6px;
    padding: 18px;
    background: var(--paper);
  }
  .lbl {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--muted);
  }
  .path {
    font-size: clamp(1.0625rem, 0.9rem + 0.6vw, 1.375rem);
    font-weight: 600;
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
    gap: 4px;
    margin: 0;
  }
  .fatos div {
    background: var(--paper);
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
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  /* Ondas */
  .ondas {
    display: grid;
    gap: 4px;
  }
  .ondas li {
    display: grid;
    grid-template-columns: 7em minmax(0, 14em) minmax(0, 1fr);
    gap: 4px 24px;
    align-items: baseline;
    padding: 16px 12px;
    background: var(--paper);
  }
  .ondas li.feita {
    background: var(--orange-soft);
  }
  .onda-n {
    color: var(--muted);
    font-weight: 600;
    font-size: 0.9375rem;
  }
  .onda-nome {
    font-weight: 600;
    font-size: 1.125rem;
    letter-spacing: -0.01em;
  }
  @media (max-width: 700px) {
    .ondas li {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* Rodapé */
  .foot {
    padding-block: 56px 120px;
    display: grid;
    gap: 14px;
  }
  .foot .name {
    font-size: clamp(2.5rem, 1rem + 7vw, 7.5rem);
    font-weight: 700;
    letter-spacing: -0.045em;
    line-height: 0.9;
  }
  .foot p:not(.name) {
    color: var(--muted);
    max-width: 70ch;
  }
</style>

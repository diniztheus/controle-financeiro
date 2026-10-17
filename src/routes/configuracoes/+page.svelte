<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import { ATALHOS } from '$lib/ui/atalhosLista';
  import { ariaErro } from '$lib/ui/formularios';
  import { aplicarTema, lerTema, type Tema } from '$lib/ui/tema';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  // Uma forma só para as respostas das três ações de PIN (o tipo gerado é uma união estrita).
  interface RespostaPin {
    acao?: string;
    erros?: Partial<Record<'atual' | 'novo' | 'confirmar', string>>;
    erro?: string;
    ok?: string;
  }
  const resposta = $derived(form as RespostaPin | null | undefined);
  const dePin = (acao: string) => (resposta?.acao === acao ? resposta : null);
  const definir = $derived(dePin('definir'));
  const alterar = $derived(dePin('alterar'));
  const remover = $derived(dePin('remover'));
  const okSeguranca = $derived(resposta?.ok ?? null);

  const OPCOES_TEMA: { valor: Tema; rotulo: string }[] = [
    { valor: 'auto', rotulo: 'Automático (segue o computador)' },
    { valor: 'claro', rotulo: 'Claro' },
    { valor: 'escuro', rotulo: 'Escuro' },
  ];
  // O tema fica salvo só neste navegador, então só é lido depois que a página carrega.
  let tema = $state<Tema>('auto');
  onMount(() => {
    tema = lerTema();
  });
</script>

<svelte:head>
  <title>Controle Financeiro · Configurações</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>Configurações</h1>
    <p>Segurança, aparência, atalhos e como usar o site como aplicativo.</p>
  </div>
</header>

<section class="sec alt pad grade" aria-labelledby="sec-seguranca">
  <div class="col">
    <div class="sec-head">
      <div>
        <h2 id="sec-seguranca">Segurança</h2>
        <p>
          {#if data.pinAtivo}
            O PIN está definido. Ele protege o acesso ao site neste computador{data.acessoRede
              ? ' e pela rede'
              : ''}.
          {:else}
            Sem PIN, qualquer pessoa que abrir o endereço do site neste computador entra direto.
          {/if}
        </p>
      </div>
      <p class="estado" data-testid="estado-pin">
        {data.pinAtivo ? 'PIN definido' : 'Sem PIN'}
      </p>
    </div>

    {#if okSeguranca}<p class="ok-msg" role="status">{okSeguranca}</p>{/if}

    {#if !data.pinAtivo}
      <div class="painel-form">
        <h3>Definir PIN</h3>
        <form class="fc" method="POST" action="?/definir" use:enhance autocomplete="off">
          <div class="field">
            <label for="d-novo">PIN (4 a 12 números)</label>
            <input
              id="d-novo"
              name="novo"
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              maxlength="12"
              required
              {...ariaErro(definir?.erros?.novo, 'd-novo')}
            />
            {#if definir?.erros?.novo}<span class="err" id="d-novo-erro">{definir.erros.novo}</span
              >{/if}
          </div>
          <div class="field">
            <label for="d-confirmar">Confirmar PIN</label>
            <input
              id="d-confirmar"
              name="confirmar"
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              maxlength="12"
              required
              {...ariaErro(definir?.erros?.confirmar, 'd-confirmar')}
            />
            {#if definir?.erros?.confirmar}<span class="err" id="d-confirmar-erro"
                >{definir.erros.confirmar}</span
              >{/if}
          </div>
          {#if definir?.erro}<p class="err" role="alert">{definir.erro}</p>{/if}
          <div><button class="btn ink" type="submit">Definir PIN</button></div>
        </form>
      </div>
    {:else}
      <div class="painel-form">
        <h3>Alterar PIN</h3>
        <form class="fc" method="POST" action="?/alterar" use:enhance autocomplete="off">
          <div class="field">
            <label for="a-atual">PIN atual</label>
            <input
              id="a-atual"
              name="atual"
              type="password"
              inputmode="numeric"
              autocomplete="current-password"
              maxlength="12"
              required
              {...ariaErro(alterar?.erros?.atual, 'a-atual')}
            />
            {#if alterar?.erros?.atual}<span class="err" id="a-atual-erro"
                >{alterar.erros.atual}</span
              >{/if}
          </div>
          <div class="field">
            <label for="a-novo">Novo PIN (4 a 12 números)</label>
            <input
              id="a-novo"
              name="novo"
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              maxlength="12"
              required
              {...ariaErro(alterar?.erros?.novo, 'a-novo')}
            />
            {#if alterar?.erros?.novo}<span class="err" id="a-novo-erro">{alterar.erros.novo}</span
              >{/if}
          </div>
          <div class="field">
            <label for="a-confirmar">Confirmar novo PIN</label>
            <input
              id="a-confirmar"
              name="confirmar"
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              maxlength="12"
              required
              {...ariaErro(alterar?.erros?.confirmar, 'a-confirmar')}
            />
            {#if alterar?.erros?.confirmar}<span class="err" id="a-confirmar-erro"
                >{alterar.erros.confirmar}</span
              >{/if}
          </div>
          {#if alterar?.erro}<p class="err" role="alert">{alterar.erro}</p>{/if}
          <div><button class="btn ink" type="submit">Alterar PIN</button></div>
        </form>
      </div>

      <div class="painel-form">
        <h3>Remover PIN</h3>
        <p class="muted">Sem PIN, o site volta a abrir sem pedir senha neste computador.</p>
        <form class="fc" method="POST" action="?/remover" use:enhance autocomplete="off">
          <div class="field">
            <label for="r-atual">PIN atual</label>
            <input
              id="r-atual"
              name="atual"
              type="password"
              inputmode="numeric"
              autocomplete="current-password"
              maxlength="12"
              required
              {...ariaErro(remover?.erros?.atual, 'r-atual')}
            />
            {#if remover?.erros?.atual}<span class="err" id="r-atual-erro"
                >{remover.erros.atual}</span
              >{/if}
          </div>
          {#if remover?.erro}<p class="err" role="alert">{remover.erro}</p>{/if}
          <div><button class="btn" type="submit">Remover PIN</button></div>
        </form>
      </div>
    {/if}
  </div>
</section>

<section class="sec pad" aria-labelledby="sec-aparencia">
  <div class="sec-head">
    <div>
      <h2 id="sec-aparencia">Aparência</h2>
      <p>
        A escolha vale só neste navegador. Com JavaScript desligado, o site segue o computador
        (automático).
      </p>
    </div>
  </div>
  <fieldset class="escolhas">
    <legend class="sr">Tema</legend>
    {#each OPCOES_TEMA as o (o.valor)}
      <label class="escolha">
        <input
          type="radio"
          name="tema"
          value={o.valor}
          checked={tema === o.valor}
          onchange={() => {
            tema = o.valor;
            aplicarTema(o.valor);
          }}
        />
        <span>{o.rotulo}</span>
      </label>
    {/each}
  </fieldset>
</section>

<section class="sec alt pad" aria-labelledby="sec-atalhos">
  <div class="sec-head">
    <div>
      <h2 id="sec-atalhos">Atalhos de teclado</h2>
      <p>
        Valem quando o foco não está num campo de texto. Pressione ? em qualquer tela para ver esta
        lista.
      </p>
    </div>
  </div>
  <table class="atalhos">
    <caption class="sr">Atalhos de teclado</caption>
    <thead>
      <tr>
        <th scope="col">Tecla</th>
        <th scope="col">Ação</th>
      </tr>
    </thead>
    <tbody>
      {#each ATALHOS as a (a.teclas)}
        <tr>
          <td><kbd>{a.teclas}</kbd></td>
          <td>{a.descricao}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<section class="sec pad" aria-labelledby="sec-app">
  <div class="sec-head">
    <div>
      <h2 id="sec-app">Aplicativo</h2>
      <p>
        O site instala como um aplicativo, com janela própria, e pode abrir junto com o computador.
      </p>
    </div>
  </div>
  <ul class="passos">
    <li>
      <strong>Chrome ou Edge:</strong> no menu do navegador, escolha "Instalar Controle Financeiro".
    </li>
    <li><strong>Safari (Mac):</strong> em Arquivo, escolha "Adicionar ao Dock".</li>
    <li>
      <strong>Abrir junto com o computador:</strong> no terminal, na pasta do projeto, rode
      <code>pnpm iniciar-com-o-computador</code>. Veja o README para desfazer (<code
        >pnpm parar-de-iniciar</code
      >).
    </li>
  </ul>
</section>

<section class="sec alt pad" aria-labelledby="sec-rede">
  <div class="sec-head">
    <div>
      <h2 id="sec-rede">Acesso pela rede</h2>
      <p>
        Permite abrir o site de outros aparelhos da sua rede local (celular, tablet). Vem desligado
        por padrão. Quando estiver ligado, defina um PIN: sem ele, o site não aceita acesso pela
        rede.
      </p>
    </div>
    <p class="estado" data-testid="estado-rede">{data.acessoRede ? 'Ligado' : 'Desligado'}</p>
  </div>
  <p class="muted">
    Para mudar, edite o arquivo <code>.env</code> na pasta do projeto: <code>ACESSO_REDE=1</code>
    liga; apagar a linha (ou <code>ACESSO_REDE=0</code>) desliga. Depois reinicie o site.
  </p>
</section>

<style>
  .estado {
    font-weight: 600;
    white-space: nowrap;
  }
  .fc {
    display: grid;
    gap: 18px;
  }
  .painel-form h3 {
    font-size: var(--s-lead);
  }
  .escolhas {
    border: 0;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 10px;
  }
  .escolha {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    cursor: pointer;
  }
  .escolha input {
    width: 18px;
    height: 18px;
    accent-color: var(--orange);
  }
  .atalhos {
    width: 100%;
    max-width: 560px;
    border-collapse: collapse;
  }
  .atalhos th,
  .atalhos td {
    text-align: left;
    padding: 10px 8px;
    border-bottom: 1px solid var(--line);
  }
  .atalhos kbd {
    font-family: var(--mono, ui-monospace, monospace);
    border: 1px solid var(--line);
    border-radius: var(--r);
    padding: 2px 8px;
  }
  .passos {
    display: grid;
    gap: 12px;
    padding-left: 20px;
    max-width: 68ch;
  }
</style>

<script lang="ts">
  import Keyboard from '@lucide/svelte/icons/keyboard';
  import Lock from '@lucide/svelte/icons/lock';
  import Palette from '@lucide/svelte/icons/palette';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import Wifi from '@lucide/svelte/icons/wifi';
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
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

<section class="sec pad" aria-labelledby="sec-seguranca">
  <div class="card">
    <div class="item">
      <IconeRedondo icone={Lock} cor="var(--orange)" suave />
      <div class="item-texto">
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
      <p class="etiqueta controle" class:ok={data.pinAtivo} data-testid="estado-pin">
        {data.pinAtivo ? 'PIN definido' : 'Sem PIN'}
      </p>
    </div>

    {#if okSeguranca}<p class="ok-msg aviso-ok" role="status">{okSeguranca}</p>{/if}

    {#if !data.pinAtivo}
      <div class="extra">
        <div class="bloco">
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
              {#if definir?.erros?.novo}<span class="err" id="d-novo-erro"
                  >{definir.erros.novo}</span
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
            <div><button class="btn go" type="submit">Definir PIN</button></div>
          </form>
        </div>
      </div>
    {:else}
      <div class="extra">
        <div class="bloco">
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
              {#if alterar?.erros?.novo}<span class="err" id="a-novo-erro"
                  >{alterar.erros.novo}</span
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
            <div><button class="btn go" type="submit">Alterar PIN</button></div>
          </form>
        </div>

        <div class="bloco">
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
      </div>
    {/if}
  </div>
</section>

<section class="sec pad" aria-labelledby="sec-aparencia">
  <div class="card">
    <div class="item">
      <IconeRedondo icone={Palette} cor="var(--c3)" suave />
      <div class="item-texto">
        <h2 id="sec-aparencia">Aparência</h2>
        <p>
          A escolha vale só neste navegador. Com JavaScript desligado, o site segue o computador
          (automático).
        </p>
      </div>
      <fieldset class="escolhas controle">
        <legend class="sr">Tema</legend>
        <div class="pilulas">
          {#each OPCOES_TEMA as o (o.valor)}
            <label>
              <input
                class="sr"
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
        </div>
      </fieldset>
    </div>
  </div>
</section>

<section class="sec pad" aria-labelledby="sec-atalhos">
  <div class="card">
    <div class="item">
      <IconeRedondo icone={Keyboard} cor="var(--c1)" suave />
      <div class="item-texto">
        <h2 id="sec-atalhos">Atalhos de teclado</h2>
        <p>
          Valem quando o foco não está num campo de texto. Pressione ? em qualquer tela para ver
          esta lista.
        </p>
      </div>
    </div>
    <div class="extra">
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
    </div>
  </div>
</section>

<section class="sec pad" aria-labelledby="sec-app">
  <div class="card">
    <div class="item">
      <IconeRedondo icone={Smartphone} cor="var(--c0)" suave />
      <div class="item-texto">
        <h2 id="sec-app">Aplicativo</h2>
        <p>
          O site instala como um aplicativo, com janela própria, e pode abrir junto com o
          computador.
        </p>
      </div>
    </div>
    <div class="extra">
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
    </div>
  </div>
</section>

<section class="sec pad" aria-labelledby="sec-rede">
  <div class="card">
    <div class="item">
      <IconeRedondo icone={Wifi} cor="var(--c7)" suave />
      <div class="item-texto">
        <h2 id="sec-rede">Acesso pela rede</h2>
        <p>
          Permite abrir o site de outros aparelhos da sua rede local (celular, tablet). Vem
          desligado por padrão. Quando estiver ligado, defina um PIN: sem ele, o site não aceita
          acesso pela rede.
        </p>
      </div>
      <p class="etiqueta controle" class:ok={data.acessoRede} data-testid="estado-rede">
        {data.acessoRede ? 'Ligado' : 'Desligado'}
      </p>
    </div>
    <div class="extra">
      <p class="muted">
        Para mudar, edite o arquivo <code>.env</code> na pasta do projeto:
        <code>ACESSO_REDE=1</code>
        liga; apagar a linha (ou <code>ACESSO_REDE=0</code>) desliga. Depois reinicie o site.
      </p>
    </div>
  </div>
</section>

<style>
  /* Cada cartão é um grupo de ajustes; cada ajuste é uma linha com ícone, texto e controle */
  .card {
    gap: 0;
    padding: 0;
    overflow: hidden;
  }
  .item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 14px 16px;
    align-items: center;
    padding: 18px 20px;
  }
  .item-texto {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .item h2 {
    font-size: 1.0625rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .item-texto p {
    font-size: 0.9375rem;
    color: var(--muted);
    max-width: 62ch;
  }
  .extra {
    display: grid;
    gap: 16px;
    padding: 4px 20px 20px;
    border-top: 1px solid var(--line);
  }
  .controle {
    justify-self: end;
  }
  .aviso-ok {
    margin: 0 20px 16px;
    padding: 12px 16px;
    background: var(--pos-soft);
    border-radius: var(--r);
  }
  .etiqueta {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 0.8125rem;
    font-weight: 650;
    white-space: nowrap;
    background: var(--step);
    color: var(--muted);
  }
  .etiqueta.ok {
    background: var(--pos-soft);
    color: var(--pos);
  }

  /* Blocos de formulário dentro do cartão de Segurança */
  .bloco {
    display: grid;
    gap: 14px;
    padding: clamp(16px, 2vw, 20px);
    border-radius: var(--r-card);
    background: var(--paper);
    align-content: start;
  }
  .bloco h3 {
    font-size: 1rem;
    font-weight: 650;
  }
  .bloco .field input {
    background: var(--surface);
    border-color: var(--line);
  }
  .bloco .field input:focus {
    background: var(--surface);
    border-color: var(--orange);
  }
  .fc {
    display: grid;
    gap: 16px;
  }
  .estado {
    font-weight: 600;
  }

  /* Tema como pílulas: a escolha ativa vira o botão branco */
  .escolhas {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
    max-width: 100%;
  }
  .pilulas > label {
    min-height: 44px;
    padding: 0 16px;
    cursor: pointer;
  }
  .pilulas > label:focus-within {
    outline: 2px solid var(--orange);
    outline-offset: 2px;
  }

  /* Atalhos: tabela dentro do cartão */
  .atalhos {
    width: 100%;
    border-collapse: collapse;
  }
  .atalhos th,
  .atalhos td {
    text-align: left;
    padding: 10px 8px;
    border-bottom: 1px solid var(--line);
  }
  .atalhos tbody tr:last-child td {
    border-bottom: 0;
  }
  .atalhos th {
    font-size: var(--s-small);
    font-weight: 600;
    color: var(--muted);
  }
  .atalhos kbd {
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 0.875rem;
    display: inline-block;
    min-width: 2.2em;
    text-align: center;
    padding: 3px 9px;
    border: 0;
    border-radius: 10px;
    background: var(--step);
    box-shadow: inset 0 -2px 0 var(--line);
  }

  /* Passos do app: cada um numa faixa clara */
  .passos {
    display: grid;
    gap: 8px;
    max-width: 68ch;
  }
  .passos li {
    padding: 12px 14px;
    border-radius: var(--r);
    background: var(--paper);
  }

  @media (max-width: 640px) {
    .item {
      grid-template-columns: auto minmax(0, 1fr);
      padding: 16px;
    }
    .item .controle {
      grid-column: 1 / -1;
      justify-self: start;
    }
    .extra {
      padding-inline: 16px;
    }
    .aviso-ok {
      margin-inline: 16px;
    }
  }
</style>

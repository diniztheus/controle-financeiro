<script lang="ts">
  import { goto } from '$app/navigation';
  import { tick } from 'svelte';
  import { ATALHOS } from '$lib/ui/atalhosLista';

  /** Para onde cada tecla leva. O hash abre direto o formulário certo. */
  const DESTINOS: Record<string, string> = {
    n: '/gastos#novo',
    r: '/receitas#nova',
    b: '/busca',
    p: '/',
  };

  let dialogo: HTMLDialogElement | undefined = $state();
  let focoAnterior: HTMLElement | null = null;

  /** Campos onde digitar não deve disparar atalho. */
  function digitando(alvo: EventTarget | null): boolean {
    if (!(alvo instanceof HTMLElement)) return false;
    return (
      alvo.isContentEditable ||
      alvo.tagName === 'INPUT' ||
      alvo.tagName === 'TEXTAREA' ||
      alvo.tagName === 'SELECT'
    );
  }

  function abrirAjuda() {
    if (!dialogo || dialogo.open) return;
    focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogo.showModal();
  }

  function fecharAjuda() {
    dialogo?.close();
  }

  function aoFechar() {
    focoAnterior?.focus();
    focoAnterior = null;
  }

  /**
   * Foca o campo de valor do formulário da página. Depois de navegar, o SvelteKit devolve o foco ao
   * corpo da página um instante depois: por isso insiste por alguns instantes até o foco "pegar".
   */
  async function focarValor() {
    const seletor = '#novo input[name="valor"], #nova input[name="valor"]';
    let estaveis = 0;
    for (let i = 0; i < 20 && estaveis < 3; i++) {
      const campo = document.querySelector<HTMLInputElement>(seletor);
      if (campo && document.activeElement === campo) {
        estaveis++;
      } else {
        estaveis = 0;
        campo?.focus();
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async function irPara(destino: string) {
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- destinos fixos das teclas (DESTINOS)
    await goto(destino);
    await tick();
    if (destino.startsWith('/gastos') || destino.startsWith('/receitas')) await focarValor();
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const ajudaAberta = dialogo?.open ?? false;
    const outroDialogo = document.querySelector('dialog[open]');
    if (outroDialogo && outroDialogo !== dialogo) return;

    if (e.key === '?') {
      if (ajudaAberta) {
        e.preventDefault();
        fecharAjuda();
      } else if (!digitando(e.target)) {
        e.preventDefault();
        abrirAjuda();
      }
      return;
    }
    // Esc fecha o diálogo pelo próprio navegador (cancel/close).
    if (ajudaAberta || digitando(e.target)) return;

    const tecla = e.key.toLowerCase();
    const destino = DESTINOS[tecla];
    if (destino) {
      e.preventDefault();
      void irPara(destino);
    }
  }
</script>

<svelte:window onkeydown={aoTeclar} />

<dialog
  bind:this={dialogo}
  class="atalhos"
  aria-labelledby="atalhos-titulo"
  data-testid="atalhos-dialogo"
  onclose={aoFechar}
>
  <h2 id="atalhos-titulo">Atalhos de teclado</h2>
  <table>
    <thead>
      <tr>
        <th scope="col">Tecla</th>
        <th scope="col">Ação</th>
      </tr>
    </thead>
    <tbody>
      {#each ATALHOS as atalho (atalho.teclas)}
        <tr>
          <td><kbd>{atalho.teclas}</kbd></td>
          <td>{atalho.descricao}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="nota">Os atalhos não funcionam enquanto você digita em um campo.</p>
  <div class="acoes">
    <button type="button" class="btn" onclick={fecharAjuda}>Fechar</button>
  </div>
</dialog>

<style>
  /* Cartão flutuante: cantos grandes, sombra forte e teclas como chaves arredondadas */
  .atalhos {
    width: min(420px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    padding: 24px;
    background: var(--surface);
    color: var(--ink);
    border: 0;
    border-radius: 24px;
    box-shadow: var(--shadow-up);
  }
  .atalhos::backdrop {
    background: rgb(10 12 18 / 0.45);
  }
  .atalhos h2 {
    margin: 0 0 16px;
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.015em;
  }
  .atalhos table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  .atalhos th,
  .atalhos td {
    text-align: left;
    padding: 9px 4px;
    border-bottom: 1px solid var(--line);
  }
  .atalhos tbody tr:last-child td {
    border-bottom: 0;
  }
  .atalhos th {
    color: var(--muted);
    font-weight: 600;
    font-size: var(--s-small);
  }
  .atalhos td:first-child {
    width: 88px;
  }
  .atalhos kbd {
    display: inline-block;
    min-width: 2.2em;
    padding: 3px 9px;
    text-align: center;
    font-family: inherit;
    font-weight: 650;
    font-size: 0.9375rem;
    color: var(--ink);
    border: 0;
    border-radius: 10px;
    background: var(--step);
    box-shadow: inset 0 -2px 0 var(--line);
  }
  .atalhos .nota {
    margin: 16px 0 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .atalhos .acoes {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }
  .atalhos button:focus-visible,
  .atalhos kbd:focus-visible {
    outline: 2px solid var(--orange);
    outline-offset: 2px;
  }
</style>

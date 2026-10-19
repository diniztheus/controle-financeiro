<script lang="ts">
  /**
   * Cartão discreto no painel com as contas cujo saldo está sem atualização há mais tempo que o
   * configurado. Lista vazia: não aparece nada.
   */
  import Clock from '@lucide/svelte/icons/clock';
  import { resolve } from '$app/paths';
  import type { ContaDesatualizada } from '$lib/dominio/lembretes';

  let { contas }: { contas: ContaDesatualizada[] } = $props();

  const LIMITE_NOMES = 3;

  const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

  const titulo = $derived.by(() => {
    const n = contas.length;
    if (n === 1) {
      const c = contas[0]!;
      return `Faz ${dias(c.diasSemAtualizar)} que você não atualiza ${c.nome}`;
    }
    const nomes = contas
      .slice(0, LIMITE_NOMES)
      .map((c) => `${c.nome} (${dias(c.diasSemAtualizar)})`);
    const resto = n - nomes.length;
    let lista: string;
    if (resto > 0) {
      lista = `${nomes.join(', ')} e mais ${resto}`;
    } else if (nomes.length > 1) {
      lista = `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
    } else {
      lista = nomes[0] ?? '';
    }
    return `${n} contas estão com o saldo desatualizado: ${lista}`;
  });
</script>

{#if contas.length > 0}
  <section class="aviso" aria-label="Saldos desatualizados" data-testid="aviso-saldos">
    <span class="icone" aria-hidden="true"><Clock size={18} strokeWidth={2.2} /></span>
    <p>
      {titulo}.
      <a href={resolve('/contas')}>Atualizar saldos</a>
    </p>
  </section>
{/if}

<style>
  .aviso {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--warn-soft);
    color: var(--ink);
    border-radius: var(--r-card);
    padding: 12px 16px;
  }
  .icone {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    background: var(--surface);
    color: var(--warn);
  }
  .aviso p {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 500;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .aviso a {
    color: var(--warn);
    font-weight: 650;
    text-underline-offset: 3px;
    white-space: nowrap;
    display: inline-block;
    min-height: 44px;
    line-height: 44px;
    margin-left: 4px;
  }
</style>

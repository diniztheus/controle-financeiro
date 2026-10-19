<script lang="ts">
  /**
   * Cartão compacto do painel: "Seu resumo de setembro está pronto". Aparece nos primeiros dias do
   * mês, com o mês anterior. "Dispensar" esconde só neste navegador (localStorage). Sem JavaScript
   * o cartão simplesmente aparece.
   */
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { formatarBRL, type Centavos } from '$lib/dominio/dinheiro';
  import type { Mes } from '$lib/dominio/datas';
  import IconeRedondo from './IconeRedondo.svelte';
  import Valor from './Valor.svelte';
  import { corCss, soNomeMes } from './formato';
  import Sparkles from '@lucide/svelte/icons/sparkles';

  interface Props {
    mes: Mes;
    entradasCentavos: Centavos;
    saidasCentavos: Centavos;
    sobraCentavos: Centavos;
    maisSubiu: { nome: string; cor: string | null; diferencaCentavos: Centavos } | null;
  }
  let { mes, entradasCentavos, saidasCentavos, sobraCentavos, maisSubiu }: Props = $props();

  const nomeDoMes = $derived(soNomeMes(mes));
  const chave = $derived(`resumo-visto-${mes}`);
  let visivel = $state(true);

  onMount(() => {
    try {
      if (localStorage.getItem(chave)) visivel = false;
    } catch {
      // Sem armazenamento (navegação privada, bloqueio): o cartão continua visível.
    }
  });

  function dispensar() {
    visivel = false;
    try {
      localStorage.setItem(chave, '1');
    } catch {
      // Sem armazenamento: some só nesta visita.
    }
  }
</script>

{#if visivel}
  <section class="card resumo-mes" aria-labelledby="resumo-mes-titulo-{mes}">
    <div class="cabeca">
      <span class="ico"><Sparkles size={18} /></span>
      <h2 id="resumo-mes-titulo-{mes}">Seu resumo de {nomeDoMes} está pronto</h2>
    </div>

    <dl class="numeros">
      <div>
        <dt>Sobra</dt>
        <dd class:neg={sobraCentavos < 0} class:pos={sobraCentavos >= 0}>
          <Valor centavos={sobraCentavos} testid="resumo-mes-sobra" />
        </dd>
      </div>
      <div>
        <dt>Gastos</dt>
        <dd><Valor centavos={saidasCentavos} testid="resumo-mes-gastos" /></dd>
      </div>
      <div>
        <dt>Entradas</dt>
        <dd><Valor centavos={entradasCentavos} testid="resumo-mes-entradas" /></dd>
      </div>
    </dl>

    {#if maisSubiu}
      <p class="subiu">
        <IconeRedondo nome={maisSubiu.nome} cor={corCss(maisSubiu.cor)} tamanho={28} />
        <span>
          <strong>{maisSubiu.nome}</strong> subiu {formatarBRL(maisSubiu.diferencaCentavos)} acima da
          média
        </span>
      </p>
    {:else}
      <p class="small muted">Nenhuma categoria subiu em relação à média.</p>
    {/if}

    <div class="acoes">
      <a class="btn go" href={resolve('/resumo/[mes]', { mes })}>Ver resumo</a>
      <button type="button" class="btn text" onclick={dispensar}>Dispensar</button>
    </div>
  </section>
{/if}

<style>
  .resumo-mes {
    gap: 12px;
  }
  .cabeca {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .cabeca h2 {
    font-size: 1rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .ico {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    background: var(--orange-soft);
    color: var(--orange);
  }
  .numeros {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
  }
  .numeros dt {
    font-size: var(--s-small);
    color: var(--muted);
  }
  .numeros dd {
    margin: 0;
    font-weight: 650;
    font-size: 1.0625rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .subiu {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.9375rem;
  }
  .acoes {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .acoes .btn {
    min-height: 44px;
  }
  .pos {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }
</style>

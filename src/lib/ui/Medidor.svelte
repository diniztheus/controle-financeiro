<script lang="ts">
  /** Barra de uso do limite do mês (ok / alerta a partir de 85% / estourado). */
  import type { SituacaoLimite } from '$lib/dominio/resumo';
  import { formatarBRL } from '$lib/dominio/dinheiro';

  let { s }: { s: SituacaoLimite } = $props();
</script>

<div class="medidor" data-testid="limite" data-estado={s.estado}>
  <div class="linha">
    <span>Limite de <b class="num">{formatarBRL(s.limiteCentavos)}</b></span>
    <span class="num nota {s.estado}">
      {#if s.restanteCentavos >= 0}
        Restam {formatarBRL(s.restanteCentavos)}
      {:else}
        {formatarBRL(-s.restanteCentavos)} acima do limite
      {/if}
    </span>
  </div>
  <div
    class="meter {s.estado}"
    role="progressbar"
    aria-label="Uso do limite"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.min(100, s.percentual)}
    aria-valuetext="{s.percentual}% usado"
  >
    <span style="transform: scaleX({Math.min(100, s.percentual) / 100})"></span>
  </div>
  <p class="muted num small">{s.percentual}% usado</p>
</div>

<style>
  .medidor {
    display: grid;
    gap: 10px;
  }
  .linha {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.9375rem;
  }
  .meter {
    height: 12px;
    background: var(--step);
    overflow: hidden;
  }
  .meter > span {
    display: block;
    height: 100%;
    background: var(--ink);
    transform-origin: left;
  }
  .meter.alerta > span {
    background: var(--warn);
  }
  .meter.estourado > span {
    background: var(--neg);
  }
  .nota {
    font-weight: 600;
    color: var(--pos);
  }
  .nota.alerta {
    color: var(--warn);
  }
  .nota.estourado {
    color: var(--neg);
  }
  @media (prefers-reduced-motion: no-preference) {
    .meter > span {
      transition: transform 0.5s cubic-bezier(0.2, 0.7, 0.2, 1);
      animation: encher 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    @keyframes encher {
      from {
        transform: scaleX(0);
      }
    }
  }
</style>

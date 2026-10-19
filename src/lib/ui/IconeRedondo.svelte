<script lang="ts">
  /**
   * Círculo colorido com um ícone branco, como nos apps de banco: categoria, conta, cartão.
   * Passe `icone` direto, ou `nome` para escolher pelo nome da categoria. Só decoração.
   */
  import { iconeDoNome, type Icone } from './icones';

  interface Props {
    icone?: Icone;
    nome?: string | null;
    /** Cor CSS do círculo (ex.: corCss(categoria.cor) ou 'var(--pos)'). */
    cor?: string;
    /** Diâmetro em px. */
    tamanho?: number;
    /** Fundo claro com ícone colorido, em vez de fundo cheio. */
    suave?: boolean;
  }
  let { icone, nome, cor = 'var(--c9)', tamanho = 40, suave = false }: Props = $props();
  const Escolhido = $derived(icone ?? iconeDoNome(nome));
</script>

<span class="bola" class:suave style="--cor: {cor}; --tam: {tamanho}px" aria-hidden="true">
  <Escolhido size={Math.round(tamanho * 0.48)} strokeWidth={2.1} />
</span>

<style>
  .bola {
    width: var(--tam);
    height: var(--tam);
    flex: none;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--cor);
    color: #fff;
  }
  .suave {
    background: color-mix(in srgb, var(--cor) 14%, transparent);
    color: var(--cor);
  }
</style>

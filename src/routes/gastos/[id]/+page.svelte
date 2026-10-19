<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatarBRL } from '$lib/dominio/dinheiro';
  import { nomeMesCurto } from '$lib/dominio/datas';
  import ConfirmarRemocao from '$lib/ui/ConfirmarRemocao.svelte';
  import FormGasto from '$lib/ui/FormGasto.svelte';
  import IconeRedondo from '$lib/ui/IconeRedondo.svelte';
  import { corCss } from '$lib/ui/formato';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const g = $derived(data.gasto);
  const voltar = $derived(resolve(`/gastos?mes=${g.dataCompra.slice(0, 7)}`));
  const erroSalvar = $derived(form?.acao === 'salvar' ? form : null);
  const corDaCategoria = $derived(corCss(data.categorias.find((c) => c.id === g.categoriaId)?.cor));
</script>

<svelte:head>
  <title>Controle Financeiro · {g.descricao ?? data.categoriaNome}</title>
</svelte:head>

<header class="page-head pad">
  <div>
    <h1>{g.meio === 'cartao' ? 'Compra no cartão' : 'Editar gasto'}</h1>
    <p class="voltar-l"><a class="voltar" href={voltar}>‹ Voltar aos gastos</a></p>
  </div>
</header>

<section class="pad topo-gasto" aria-label="Resumo do gasto">
  <div class="card gasto-cartao">
    <div class="gasto-cab">
      <IconeRedondo nome={data.categoriaNome} cor={corDaCategoria} tamanho={56} />
      <div class="gasto-txt">
        <p class="small muted">
          {data.categoriaNome}{g.meio === 'cartao' && data.cartaoNome
            ? ` · ${data.cartaoNome}`
            : ''}
        </p>
        <h2>{g.descricao ?? data.categoriaNome}</h2>
      </div>
    </div>
    <p class="gasto-val num">−{formatarBRL(g.valorTotalCentavos)}</p>
  </div>
</section>

<section class="sec alt pad grade">
  <div class="painel-form">
    <FormGasto
      acao="?/salvar"
      rotulo="Salvar alterações"
      id="e"
      categorias={data.categorias}
      contas={data.contas}
      cartoes={data.cartoes}
      inicial={{
        valorCentavos: g.valorTotalCentavos,
        descricao: g.descricao,
        categoriaId: g.categoriaId,
        data: g.dataCompra,
        contaId: g.contaId,
        meio: g.meio,
        cartaoId: g.cartaoId,
        numParcelas: g.numParcelas,
      }}
      erros={erroSalvar?.erros}
      erro={erroSalvar?.erro}
      valores={erroSalvar?.valores}
    />
    {#if g.meio === 'cartao'}
      <p class="note">
        Mudar a data ou o número de parcelas refaz as parcelas. Se alguma delas já estiver em fatura
        paga, desfaça o pagamento antes.
      </p>
    {/if}

    {#if data.parcelas.length}
      <section class="parcelas" aria-labelledby="h-parcelas">
        <h2 id="h-parcelas">Parcelas</h2>
        <div class="rolagem">
          <table>
            <caption class="sr">Parcelas desta compra e a fatura de cada uma</caption>
            <thead>
              <tr>
                <th scope="col">Parcela</th>
                <th scope="col">Fatura</th>
                <th scope="col" class="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {#each data.parcelas as p (p.numero)}
                <tr>
                  <td class="num">{p.numero}/{g.numParcelas}</td>
                  <td>
                    <a href={resolve(`/cartoes/${g.cartaoId}/faturas/${p.faturaMes}`)}
                      >{nomeMesCurto(p.faturaMes)}/{p.faturaMes.slice(0, 4)}</a
                    >{#if p.paga}<span class="muted"> · paga</span>{/if}
                  </td>
                  <td class="num">{formatarBRL(p.valorCentavos)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="small muted">
          Cada parcela cai na fatura do mês em que vence o cartão, a partir da data da compra.
        </p>
      </section>
    {/if}
  </div>

  <div class="col remover">
    <h2>Remover</h2>
    <p class="note">O gasto vai para a lixeira e sai das somas. Dá para restaurar quando quiser.</p>
    <ConfirmarRemocao />
    {#if form?.acao === 'remover' && form.erro}<p class="err" role="alert">{form.erro}</p>{/if}
  </div>
</section>

<style>
  .topo-gasto {
    padding-block: 12px 0;
  }
  .gasto-cartao {
    gap: 14px;
  }
  .gasto-cab {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .gasto-txt {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .gasto-txt h2 {
    font-size: clamp(1.125rem, 1rem + 0.6vw, 1.375rem);
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .gasto-val {
    font-size: clamp(2.25rem, 1.6rem + 2.6vw, 3.25rem);
    font-weight: 750;
    letter-spacing: -0.035em;
    line-height: 1.05;
    color: var(--neg);
    overflow-wrap: anywhere;
  }
  .remover h2 {
    font-size: var(--s-lead);
  }
  .parcelas {
    margin-top: 28px;
    display: grid;
    gap: 10px;
  }
  .parcelas h2 {
    font-size: var(--s-lead);
  }
  .parcelas a {
    color: var(--ink);
    font-weight: 600;
    text-underline-offset: 4px;
  }
</style>

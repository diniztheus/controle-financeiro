import { mesAtual, mesDe, somarMeses } from '$lib/dominio/datas';
import { CATEGORIAS_RECEITA } from '$lib/dominio/receitas';
import { obterBanco } from '$lib/server/db';
import type { Banco } from '$lib/server/db/conexao';
import { ErroDeNegocio } from '$lib/server/servicos/erros';
import { listarCategorias } from '$lib/server/servicos/categorias';
import { listarContas } from '$lib/server/servicos/contas';
import { buscarLancamentos, buscarReceitas } from '$lib/server/servicos/relatorios';
import { errosPorCampo, filtroForm, filtroReceitasForm } from '$lib/validacao/nucleo';
import type { PageServerLoad } from './$types';

/** Campos do formulário, do jeito que a URL traz (para preencher os campos de volta). */
const CAMPOS = ['q', 'de', 'ate', 'categoria', 'meio', 'origem', 'situacao', 'min', 'max'] as const;
/** Campos que contam como filtro preenchido em cada tipo de busca. */
const CAMPOS_GASTOS = ['q', 'de', 'ate', 'categoria', 'meio', 'origem', 'min', 'max'] as const;
const CAMPOS_RECEITAS = [
  'q',
  'de',
  'ate',
  'categoria',
  'origem',
  'situacao',
  'min',
  'max',
] as const;

export const load: PageServerLoad = ({ url }) => {
  const banco = obterBanco();
  const agora = new Date();
  const tipo: 'gastos' | 'receitas' =
    url.searchParams.get('tipo') === 'receitas' ? 'receitas' : 'gastos';
  const valores = Object.fromEntries(CAMPOS.map((c) => [c, url.searchParams.get(c) ?? '']));
  const campos = tipo === 'receitas' ? CAMPOS_RECEITAS : CAMPOS_GASTOS;
  const temFiltro = campos.some((c) => valores[c] !== '');
  const base = {
    tipo,
    valores,
    temFiltro,
    categorias: listarCategorias(banco).map((c) => ({ id: c.id, nome: c.nome })),
    categoriasReceita: [...CATEGORIAS_RECEITA],
    contas: listarContas(banco).map((c) => ({ id: c.id, nome: c.nome })),
  };

  if (tipo === 'receitas') return buscarReceitasNaPagina(banco, url, agora, base);

  const r = filtroForm.safeParse(Object.fromEntries(url.searchParams));
  if (!r.success) {
    return {
      ...base,
      erros: errosPorCampo(r.error),
      erro: null,
      resultado: null,
      resultadoReceitas: null,
      periodo: null,
    };
  }

  // Sem datas, a busca cobre os últimos 12 meses (o mesmo padrão do serviço). Os meses
  // são calculados aqui para a exportação usar exatamente o mesmo período.
  const f = r.data;
  const ate = f.ate ? mesDe(f.ate) : mesAtual(agora);
  const de = f.de ? mesDe(f.de) : somarMeses(ate, -11);
  try {
    const achados = buscarLancamentos(banco, { ...f, deMes: de, ateMes: ate }, agora);
    return {
      ...base,
      erros: null,
      erro: null,
      periodo: { de, ate },
      resultado: {
        lancamentos: achados.lancamentos,
        totalCentavos: achados.totalCentavos,
        truncado: achados.truncado,
      },
      resultadoReceitas: null,
    };
  } catch (e) {
    if (!(e instanceof ErroDeNegocio)) throw e;
    return {
      ...base,
      erros: null,
      erro: e.message,
      periodo: null,
      resultado: null,
      resultadoReceitas: null,
    };
  }
};

/** Busca de receitas (`tipo=receitas`): mesmo período da busca de gastos, filtros próprios. */
function buscarReceitasNaPagina(
  banco: Banco,
  url: URL,
  agora: Date,
  base: {
    valores: Record<string, string>;
    temFiltro: boolean;
    categorias: { id: string; nome: string }[];
    categoriasReceita: string[];
    contas: { id: string; nome: string }[];
  },
) {
  const r = filtroReceitasForm.safeParse(Object.fromEntries(url.searchParams));
  if (!r.success) {
    return {
      ...base,
      erros: errosPorCampo(r.error),
      erro: null,
      resultado: null,
      resultadoReceitas: null,
      periodo: null,
    };
  }

  const f = r.data;
  const ate = f.ate ? mesDe(f.ate) : mesAtual(agora);
  const de = f.de ? mesDe(f.de) : somarMeses(ate, -11);
  try {
    const achados = buscarReceitas(banco, { ...f, deMes: de, ateMes: ate }, agora);
    return {
      ...base,
      erros: null,
      erro: null,
      periodo: { de, ate },
      resultado: null,
      resultadoReceitas: {
        receitas: achados.receitas,
        totalRecebidoCentavos: achados.totalRecebidoCentavos,
        totalPrevistoCentavos: achados.totalPrevistoCentavos,
        truncado: achados.truncado,
      },
    };
  } catch (e) {
    if (!(e instanceof ErroDeNegocio)) throw e;
    return {
      ...base,
      erros: null,
      erro: e.message,
      periodo: null,
      resultado: null,
      resultadoReceitas: null,
    };
  }
}

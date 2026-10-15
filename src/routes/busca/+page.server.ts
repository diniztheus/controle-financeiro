import { mesAtual, mesDe, somarMeses } from '$lib/dominio/datas';
import { obterBanco } from '$lib/server/db';
import { ErroDeNegocio } from '$lib/server/servicos/erros';
import { listarCategorias } from '$lib/server/servicos/categorias';
import { listarContas } from '$lib/server/servicos/contas';
import { buscarLancamentos } from '$lib/server/servicos/relatorios';
import { errosPorCampo, filtroForm } from '$lib/validacao/nucleo';
import type { PageServerLoad } from './$types';

/** Campos do formulário, do jeito que a URL traz (para preencher os campos de volta). */
const CAMPOS = ['q', 'de', 'ate', 'categoria', 'meio', 'origem', 'min', 'max'] as const;

export const load: PageServerLoad = ({ url }) => {
  const banco = obterBanco();
  const agora = new Date();
  const valores = Object.fromEntries(CAMPOS.map((c) => [c, url.searchParams.get(c) ?? '']));
  const temFiltro = CAMPOS.some((c) => valores[c] !== '');
  const base = {
    valores,
    temFiltro,
    categorias: listarCategorias(banco).map((c) => ({ id: c.id, nome: c.nome })),
    contas: listarContas(banco).map((c) => ({ id: c.id, nome: c.nome })),
  };

  const r = filtroForm.safeParse(Object.fromEntries(url.searchParams));
  if (!r.success) {
    return { ...base, erros: errosPorCampo(r.error), erro: null, resultado: null, periodo: null };
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
    };
  } catch (e) {
    if (!(e instanceof ErroDeNegocio)) throw e;
    return {
      ...base,
      erros: null,
      erro: e.message,
      periodo: null,
      resultado: null,
    };
  }
};

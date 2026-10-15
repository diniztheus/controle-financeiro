import { campo, executar, validar } from '$lib/server/acoes';
import { obterBanco } from '$lib/server/db';
import {
  arquivarCategoria,
  criarCategoria,
  editarCategoria,
  listarCategorias,
  moverCategoria,
  usoPorCategoria,
} from '$lib/server/servicos/categorias';
import { categoriaForm } from '$lib/validacao/nucleo';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const banco = obterBanco();
  const uso = usoPorCategoria(banco);
  const todas = listarCategorias(banco, { incluirArquivadas: true }).map((c) => ({
    id: c.id,
    nome: c.nome,
    cor: c.cor,
    arquivada: c.arquivada,
    uso: uso.get(c.id) ?? 0,
  }));
  return {
    ativas: todas.filter((c) => !c.arquivada),
    arquivadas: todas.filter((c) => c.arquivada),
    /** Sem JavaScript, "Editar" abre a linha pela URL. */
    editar: url.searchParams.get('editar'),
  };
};

export const actions: Actions = {
  criar: async ({ request }) => {
    const v = await validar(request, categoriaForm, 'criar');
    if (!v.ok) return v.falha;
    return executar(
      'criar',
      () => {
        const c = criarCategoria(obterBanco(), v.dados);
        return { acao: 'criar', ok: `Categoria "${c.nome}" criada.` };
      },
      { valores: v.valores },
    );
  },
  editar: async ({ request }) => {
    const v = await validar(request, categoriaForm, 'editar');
    if (!v.ok) return v.falha;
    const id = v.valores.id ?? '';
    return executar(
      'editar',
      () => {
        editarCategoria(obterBanco(), id, v.dados);
        return { acao: 'editar', id, ok: 'Salvo.' };
      },
      { id, valores: v.valores },
    );
  },
  arquivar: async ({ request }) => {
    const fd = await request.formData();
    const id = campo(fd, 'id');
    const arquivar = campo(fd, 'arquivar') === 'sim';
    return executar('arquivar', () => void arquivarCategoria(obterBanco(), id, arquivar), { id });
  },
  mover: async ({ request }) => {
    const fd = await request.formData();
    const id = campo(fd, 'id');
    const direcao = campo(fd, 'direcao') === 'subir' ? -1 : 1;
    return executar('mover', () => moverCategoria(obterBanco(), id, direcao), { id });
  },
};

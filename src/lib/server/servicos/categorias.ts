/**
 * Categorias: renomear, trocar a cor, ordenar e arquivar.
 *
 * Categoria não é apagada: arquivar tira das opções de lançamento, mas os gastos antigos
 * continuam com ela (e com o nome e a cor atuais). Nome é único sem diferenciar maiúsculas.
 */
import { asc, count, eq, max } from 'drizzle-orm';
import {
  CATEGORIAS_PADRAO,
  chaveCategoria,
  corPorPosicao,
  proximaCor,
  type Cor,
} from '../../dominio/categorias.ts';
import type { Banco } from '../db/conexao.ts';
import { categorias, compras } from '../db/esquema.ts';
import { agoraIso, ErroDeNegocio, naoEncontrado } from './erros.ts';

export type Categoria = typeof categorias.$inferSelect;

/** Na ordem escolhida; arquivadas no fim (ou de fora). */
export function listarCategorias(
  banco: Banco,
  opcoes: { incluirArquivadas?: boolean } = {},
): Categoria[] {
  const todas = banco.db
    .select()
    .from(categorias)
    .orderBy(asc(categorias.arquivada), asc(categorias.ordem), asc(categorias.nome))
    .all();
  return opcoes.incluirArquivadas ? todas : todas.filter((c) => !c.arquivada);
}

export function obterCategoria(banco: Banco, id: string): Categoria | undefined {
  return banco.db.select().from(categorias).where(eq(categorias.id, id)).get();
}

/**
 * Na primeira vez (nenhuma categoria no banco), cria as mesmas do app atual.
 * Não faz nada se já existe alguma, mesmo arquivada.
 */
export function garantirCategoriasPadrao(banco: Banco): void {
  const existe = banco.db.select({ id: categorias.id }).from(categorias).limit(1).get();
  if (existe) return;
  banco.db.transaction((tx) => {
    CATEGORIAS_PADRAO.forEach((nome, i) => {
      tx.insert(categorias)
        .values({ nome, cor: corPorPosicao(i), ordem: i })
        .run();
    });
  });
}

function comMesmoNome(banco: Banco, nome: string, excetoId?: string): Categoria | undefined {
  const chave = chaveCategoria(nome);
  return listarCategorias(banco, { incluirArquivadas: true }).find(
    (c) => c.id !== excetoId && chaveCategoria(c.nome) === chave,
  );
}

function nomeLimpo(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ');
}

export function criarCategoria(banco: Banco, d: { nome: string; cor: Cor | null }): Categoria {
  const nome = nomeLimpo(d.nome);
  const igual = comMesmoNome(banco, nome);
  if (igual) {
    throw new ErroDeNegocio(
      igual.arquivada
        ? `"${igual.nome}" já existe e está arquivada. Desarquive em vez de criar de novo.`
        : `Já existe a categoria "${igual.nome}".`,
      'nome',
    );
  }
  const todas = listarCategorias(banco, { incluirArquivadas: true });
  const ultima = banco.db
    .select({ m: max(categorias.ordem) })
    .from(categorias)
    .get();
  return banco.db
    .insert(categorias)
    .values({
      nome,
      cor: d.cor ?? proximaCor(todas.map((c) => c.cor ?? '')),
      ordem: (ultima?.m ?? -1) + 1,
    })
    .returning()
    .get();
}

export function editarCategoria(
  banco: Banco,
  id: string,
  d: { nome: string; cor: Cor | null },
): Categoria {
  const atual = obterCategoria(banco, id);
  if (!atual) throw naoEncontrado('Categoria');
  const nome = nomeLimpo(d.nome);
  const igual = comMesmoNome(banco, nome, id);
  if (igual) throw new ErroDeNegocio(`Já existe a categoria "${igual.nome}".`, 'nome');
  return banco.db
    .update(categorias)
    .set({ nome, cor: d.cor ?? atual.cor, atualizadoEm: agoraIso() })
    .where(eq(categorias.id, id))
    .returning()
    .get();
}

/** Arquiva ou desarquiva. Precisa sobrar pelo menos uma categoria ativa para lançar gastos. */
export function arquivarCategoria(banco: Banco, id: string, arquivar: boolean): Categoria {
  const atual = obterCategoria(banco, id);
  if (!atual) throw naoEncontrado('Categoria');
  if (arquivar && !atual.arquivada && listarCategorias(banco).length <= 1) {
    throw new ErroDeNegocio('Mantenha pelo menos uma categoria ativa para lançar gastos.');
  }
  const ultima = banco.db
    .select({ m: max(categorias.ordem) })
    .from(categorias)
    .get();
  return banco.db
    .update(categorias)
    .set({
      arquivada: arquivar,
      // Ao desarquivar, volta para o fim da lista.
      ...(arquivar || !atual.arquivada ? {} : { ordem: (ultima?.m ?? -1) + 1 }),
      atualizadoEm: agoraIso(),
    })
    .where(eq(categorias.id, id))
    .returning()
    .get();
}

/** Sobe (-1) ou desce (+1) entre as categorias ativas. */
export function moverCategoria(banco: Banco, id: string, direcao: -1 | 1): void {
  const lista = listarCategorias(banco);
  const i = lista.findIndex((c) => c.id === id);
  if (i < 0) throw naoEncontrado('Categoria');
  const j = i + direcao;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j]!, lista[i]!];
  banco.db.transaction((tx) => {
    lista.forEach((c, ordem) => {
      if (c.ordem !== ordem) {
        tx.update(categorias).set({ ordem }).where(eq(categorias.id, c.id)).run();
      }
    });
  });
}

/** Quantos gastos (fora da lixeira ou não) usam cada categoria. */
export function usoPorCategoria(banco: Banco): Map<string, number> {
  const linhas = banco.db
    .select({ id: compras.categoriaId, n: count() })
    .from(compras)
    .groupBy(compras.categoriaId)
    .all();
  return new Map(linhas.map((l) => [l.id, l.n]));
}

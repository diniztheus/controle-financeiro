/**
 * Categorias: renomear, trocar a cor, ordenar e arquivar.
 *
 * Categoria não é apagada: arquivar tira das opções de lançamento, mas os gastos antigos
 * continuam com ela (e com o nome e a cor atuais). Nome é único sem diferenciar maiúsculas
 * (regra de nomes.ts); o banco ainda garante com o índice `lower(nome)`.
 */
import { asc, count, eq, max } from 'drizzle-orm';
import {
  CATEGORIAS_PADRAO,
  corPorPosicao,
  proximaCor,
  type Cor,
} from '../../dominio/categorias.ts';
import { chaveNome, normalizarNome } from '../../dominio/nomes.ts';
import type { Banco, BancoDrizzle } from '../db/conexao.ts';
import { categorias, compras } from '../db/esquema.ts';
import { agoraIso, ErroDeNegocio, naoEncontrado } from './erros.ts';

export type Categoria = typeof categorias.$inferSelect;

type Leitor = Pick<BancoDrizzle, 'select'>;

const IMEDIATA = { behavior: 'immediate' } as const;

function todas(db: Leitor): Categoria[] {
  return db
    .select()
    .from(categorias)
    .orderBy(asc(categorias.arquivada), asc(categorias.ordem), asc(categorias.nome))
    .all();
}

/** Na ordem escolhida; arquivadas no fim (ou de fora). */
export function listarCategorias(
  banco: Banco,
  opcoes: { incluirArquivadas?: boolean } = {},
): Categoria[] {
  const lista = todas(banco.db);
  return opcoes.incluirArquivadas ? lista : lista.filter((c) => !c.arquivada);
}

export function obterCategoria(banco: Banco, id: string): Categoria | undefined {
  return banco.db.select().from(categorias).where(eq(categorias.id, id)).get();
}

function exigir(db: Leitor, id: string): Categoria {
  const c = db.select().from(categorias).where(eq(categorias.id, id)).get();
  if (!c) throw naoEncontrado('Esta categoria não existe mais');
  return c;
}

function proximaOrdem(db: Leitor): number {
  const r = db
    .select({ m: max(categorias.ordem) })
    .from(categorias)
    .get();
  return (r?.m ?? -1) + 1;
}

/**
 * Na primeira vez (nenhuma categoria no banco), cria as mesmas do app atual.
 * Não faz nada se já existe alguma, mesmo arquivada.
 */
export function garantirCategoriasPadrao(banco: Banco): void {
  banco.db.transaction((tx) => {
    if (tx.select({ id: categorias.id }).from(categorias).limit(1).get()) return;
    CATEGORIAS_PADRAO.forEach((nome, i) => {
      tx.insert(categorias)
        .values({ nome, cor: corPorPosicao(i), ordem: i })
        .run();
    });
  }, IMEDIATA);
}

function comMesmoNome(db: Leitor, nome: string, excetoId?: string): Categoria | undefined {
  const chave = chaveNome(nome);
  return todas(db).find((c) => c.id !== excetoId && chaveNome(c.nome) === chave);
}

export function criarCategoria(
  banco: Banco,
  d: { nome: string; cor: Cor | null },
  agora = new Date(),
): Categoria {
  const nome = normalizarNome(d.nome);
  return banco.db.transaction((tx) => {
    const igual = comMesmoNome(tx, nome);
    if (igual) {
      throw new ErroDeNegocio(
        igual.arquivada
          ? `"${igual.nome}" já existe e está arquivada. Desarquive em vez de criar de novo.`
          : `Já existe a categoria "${igual.nome}".`,
        'nome',
      );
    }
    const quando = agoraIso(agora);
    return tx
      .insert(categorias)
      .values({
        nome,
        cor: d.cor ?? proximaCor(todas(tx).map((c) => c.cor ?? '')),
        ordem: proximaOrdem(tx),
        criadoEm: quando,
        atualizadoEm: quando,
      })
      .returning()
      .get();
  }, IMEDIATA);
}

export function editarCategoria(
  banco: Banco,
  id: string,
  d: { nome: string; cor: Cor | null },
  agora = new Date(),
): Categoria {
  const nome = normalizarNome(d.nome);
  return banco.db.transaction((tx) => {
    const atual = exigir(tx, id);
    const igual = comMesmoNome(tx, nome, id);
    if (igual) throw new ErroDeNegocio(`Já existe a categoria "${igual.nome}".`, 'nome');
    return tx
      .update(categorias)
      .set({ nome, cor: d.cor ?? atual.cor, atualizadoEm: agoraIso(agora) })
      .where(eq(categorias.id, id))
      .returning()
      .get();
  }, IMEDIATA);
}

/** Arquiva ou desarquiva. Precisa sobrar pelo menos uma categoria ativa para lançar gastos. */
export function arquivarCategoria(
  banco: Banco,
  id: string,
  arquivar: boolean,
  agora = new Date(),
): Categoria {
  return banco.db.transaction((tx) => {
    const atual = exigir(tx, id);
    if (atual.arquivada === arquivar) return atual;
    if (arquivar && todas(tx).filter((c) => !c.arquivada).length <= 1) {
      throw new ErroDeNegocio('Mantenha pelo menos uma categoria ativa para lançar gastos.');
    }
    return tx
      .update(categorias)
      .set({
        arquivada: arquivar,
        // Ao desarquivar, volta para o fim da lista.
        ...(arquivar ? {} : { ordem: proximaOrdem(tx) }),
        atualizadoEm: agoraIso(agora),
      })
      .where(eq(categorias.id, id))
      .returning()
      .get();
  }, IMEDIATA);
}

/** Sobe (-1) ou desce (+1) entre as categorias ativas. */
export function moverCategoria(banco: Banco, id: string, direcao: -1 | 1): void {
  banco.db.transaction((tx) => {
    const lista = todas(tx).filter((c) => !c.arquivada);
    const i = lista.findIndex((c) => c.id === id);
    if (i < 0) throw naoEncontrado('Esta categoria não existe mais');
    const j = i + direcao;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j]!, lista[i]!];
    lista.forEach((c, ordem) => {
      if (c.ordem !== ordem) {
        tx.update(categorias).set({ ordem }).where(eq(categorias.id, c.id)).run();
      }
    });
  }, IMEDIATA);
}

/** Quantos gastos (na lixeira ou não) usam cada categoria. */
export function usoPorCategoria(banco: Banco): Map<string, number> {
  const linhas = banco.db
    .select({ id: compras.categoriaId, n: count() })
    .from(compras)
    .groupBy(compras.categoriaId)
    .all();
  return new Map(linhas.map((l) => [l.id, l.n]));
}

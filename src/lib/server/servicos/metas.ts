/**
 * Metas (caixinhas): cadastro, movimentos (guardar e retirar) e cálculos.
 *
 * Regras da casa (ver dominio/metas.ts):
 * - o guardado é a soma dos movimentos fora da lixeira; guardar é positivo, retirar é negativo;
 * - retirar mais do que está guardado é recusado;
 * - movimento NÃO mexe em conta nem no patrimônio;
 * - remover meta manda para a lixeira (saem das listas e do total guardado); restaurar tira;
 * - nome único entre metas fora da lixeira, sem diferenciar maiúsculas (como os cartões).
 *
 * Escritas rodam numa transação IMMEDIATE.
 */
import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { ehCor, type Cor } from '../../dominio/categorias.ts';
import { calcularMeta, type CalculoMeta } from '../../dominio/metas.ts';
import { ehDia, hoje as hojeDe, type Dia } from '../../dominio/datas.ts';
import { ehCentavos, formatarBRL, somar, type Centavos } from '../../dominio/dinheiro.ts';
import { chaveNome, normalizarNome } from '../../dominio/nomes.ts';
import type { Banco, BancoDrizzle } from '../db/conexao.ts';
import { metas, metasMovimentos } from '../db/esquema.ts';
import { agoraIso, ErroDeNegocio, naoEncontrado } from './erros.ts';

export type Meta = typeof metas.$inferSelect;
export type MovimentoMeta = typeof metasMovimentos.$inferSelect;

export interface DadosMeta {
  nome: string;
  alvoCentavos: Centavos;
  prazo: Dia | null;
  cor: Cor | null;
}

export type TipoMovimento = 'guardar' | 'retirar';

export interface DadosMovimento {
  tipo: TipoMovimento;
  /** Sempre positivo: o tipo diz se entra ou sai. */
  valorCentavos: Centavos;
  data: Dia;
  nota: string | null;
}

export interface MetaNaLista extends Meta {
  guardadoCentavos: Centavos;
  calculo: CalculoMeta;
}

export interface MetaDetalhada extends MetaNaLista {
  movimentos: MovimentoMeta[];
}

type Leitor = Pick<BancoDrizzle, 'select'>;

const IMEDIATA = { behavior: 'immediate' } as const;

function validarDados(d: DadosMeta): DadosMeta {
  const nome = normalizarNome(d.nome);
  if (nome === '') throw new ErroDeNegocio('O nome é obrigatório.', 'nome');
  if (nome.length > 60) throw new ErroDeNegocio('O nome pode ter até 60 caracteres.', 'nome');
  if (!ehCentavos(d.alvoCentavos) || d.alvoCentavos <= 0) {
    throw new ErroDeNegocio('O valor da meta precisa ser maior que zero.', 'alvo');
  }
  if (d.prazo !== null && !ehDia(d.prazo)) {
    throw new ErroDeNegocio('Data do prazo inválida.', 'prazo');
  }
  if (d.cor !== null && !ehCor(d.cor)) throw new ErroDeNegocio('Cor inválida.', 'cor');
  return { nome, alvoCentavos: d.alvoCentavos, prazo: d.prazo, cor: d.cor };
}

/** Metas fora da lixeira, na ordem de cadastro. */
function naoRemovidas(db: Leitor): Meta[] {
  return db
    .select()
    .from(metas)
    .where(isNull(metas.removidoEm))
    .orderBy(asc(metas.criadoEm), asc(metas.id))
    .all();
}

function exigirNomeLivre(db: Leitor, nome: string, excetoId?: string): void {
  const chave = chaveNome(nome);
  const igual = naoRemovidas(db).find((m) => m.id !== excetoId && chaveNome(m.nome) === chave);
  if (igual) throw new ErroDeNegocio(`Já existe a meta "${igual.nome}".`, 'nome');
}

/** Meta fora da lixeira; lança "não existe mais" para o resto. */
function exigirNaoRemovida(db: Leitor, id: string): Meta {
  const m = db.select().from(metas).where(eq(metas.id, id)).get();
  if (!m || m.removidoEm) throw naoEncontrado('Esta meta não existe mais');
  return m;
}

/** Soma dos movimentos (fora da lixeira) por meta, para as metas fora da lixeira. */
function guardadosPorMeta(db: Leitor): Map<string, Centavos> {
  const linhas = db
    .select({ metaId: metasMovimentos.metaId, valor: metasMovimentos.valorCentavos })
    .from(metasMovimentos)
    .innerJoin(metas, and(eq(metas.id, metasMovimentos.metaId), isNull(metas.removidoEm)))
    .where(isNull(metasMovimentos.removidoEm))
    .all();
  const porMeta = new Map<string, Centavos[]>();
  for (const l of linhas) {
    const lista = porMeta.get(l.metaId) ?? [];
    lista.push(l.valor);
    porMeta.set(l.metaId, lista);
  }
  return new Map([...porMeta].map(([id, valores]) => [id, somar(valores)]));
}

function guardadoDaMeta(db: Leitor, metaId: string): Centavos {
  const valores = db
    .select({ valor: metasMovimentos.valorCentavos })
    .from(metasMovimentos)
    .where(and(eq(metasMovimentos.metaId, metaId), isNull(metasMovimentos.removidoEm)))
    .all()
    .map((l) => l.valor);
  return somar(valores);
}

function movimentosDaMeta(db: Leitor, metaId: string): MovimentoMeta[] {
  return db
    .select()
    .from(metasMovimentos)
    .where(and(eq(metasMovimentos.metaId, metaId), isNull(metasMovimentos.removidoEm)))
    .orderBy(desc(metasMovimentos.data), desc(metasMovimentos.criadoEm), desc(metasMovimentos.id))
    .all();
}

/** Cadastra uma meta sem nenhum valor guardado. */
export function criarMeta(banco: Banco, d: DadosMeta, agora = new Date()): Meta {
  const v = validarDados(d);
  return banco.db.transaction((tx) => {
    exigirNomeLivre(tx, v.nome);
    const quando = agoraIso(agora);
    return tx
      .insert(metas)
      .values({ ...v, criadoEm: quando, atualizadoEm: quando })
      .returning()
      .get();
  }, IMEDIATA);
}

/** Edita nome, alvo, prazo e cor. O guardado não muda. */
export function editarMeta(banco: Banco, id: string, d: DadosMeta, agora = new Date()): Meta {
  const v = validarDados(d);
  return banco.db.transaction((tx) => {
    exigirNaoRemovida(tx, id);
    exigirNomeLivre(tx, v.nome, id);
    return tx
      .update(metas)
      .set({ ...v, atualizadoEm: agoraIso(agora) })
      .where(eq(metas.id, id))
      .returning()
      .get();
  }, IMEDIATA);
}

/** Manda para a lixeira. Os movimentos ficam guardados; saem das somas e das listas. */
export function removerMeta(banco: Banco, id: string, agora = new Date()): void {
  banco.db.transaction((tx) => {
    exigirNaoRemovida(tx, id);
    tx.update(metas)
      .set({ removidoEm: agoraIso(agora) })
      .where(eq(metas.id, id))
      .run();
  }, IMEDIATA);
}

/** Tira da lixeira. Recusa se já existe outra meta com o mesmo nome. */
export function restaurarMeta(banco: Banco, id: string): Meta {
  return banco.db.transaction((tx) => {
    const m = tx.select().from(metas).where(eq(metas.id, id)).get();
    if (!m) throw naoEncontrado('Esta meta não existe mais');
    if (!m.removidoEm) return m;
    const igual = naoRemovidas(tx).find((o) => chaveNome(o.nome) === chaveNome(m.nome));
    if (igual) {
      throw new ErroDeNegocio(
        `Já existe outra meta chamada "${igual.nome}". Renomeie-a antes de restaurar esta.`,
      );
    }
    return tx
      .update(metas)
      .set({ removidoEm: null })
      .where(and(eq(metas.id, id), isNotNull(metas.removidoEm)))
      .returning()
      .get()!;
  }, IMEDIATA);
}

/** Meta fora da lixeira, ou `undefined`. */
export function obterMeta(banco: Banco, id: string): Meta | undefined {
  return banco.db
    .select()
    .from(metas)
    .where(and(eq(metas.id, id), isNull(metas.removidoEm)))
    .get();
}

export function metasNaLixeira(banco: Banco): Meta[] {
  return banco.db
    .select()
    .from(metas)
    .where(isNotNull(metas.removidoEm))
    .orderBy(desc(metas.removidoEm), desc(metas.id))
    .all();
}

/**
 * Metas fora da lixeira, com o guardado e os cálculos. Concluídas vão para o fim da lista;
 * as demais seguem a ordem de cadastro.
 */
export function listarMetas(banco: Banco, hoje: Dia = hojeDe()): MetaNaLista[] {
  const guardados = guardadosPorMeta(banco.db);
  return naoRemovidas(banco.db)
    .map((m) => {
      const guardadoCentavos = guardados.get(m.id) ?? 0;
      return {
        ...m,
        guardadoCentavos,
        calculo: calcularMeta(
          { alvoCentavos: m.alvoCentavos, prazo: m.prazo },
          guardadoCentavos,
          hoje,
        ),
      };
    })
    .sort((a, b) => Number(a.calculo.concluida) - Number(b.calculo.concluida));
}

/** Total guardado em todas as metas fora da lixeira. */
export function totalGuardadoMetas(banco: Banco): Centavos {
  return somar([...guardadosPorMeta(banco.db).values()]);
}

/** Uma meta com os movimentos (mais recente primeiro) e os cálculos. */
export function obterMetaDetalhada(banco: Banco, id: string, hoje: Dia = hojeDe()): MetaDetalhada {
  const m = exigirNaoRemovida(banco.db, id);
  const guardadoCentavos = guardadoDaMeta(banco.db, id);
  return {
    ...m,
    guardadoCentavos,
    calculo: calcularMeta({ alvoCentavos: m.alvoCentavos, prazo: m.prazo }, guardadoCentavos, hoje),
    movimentos: movimentosDaMeta(banco.db, id),
  };
}

/** Guarda ou retira dinheiro da meta. Não mexe em conta nem no patrimônio. */
export function movimentarMeta(
  banco: Banco,
  metaId: string,
  d: DadosMovimento,
  agora = new Date(),
): MovimentoMeta {
  if (d.tipo !== 'guardar' && d.tipo !== 'retirar') {
    throw new ErroDeNegocio('Escolha guardar ou retirar.', 'tipo');
  }
  if (!ehCentavos(d.valorCentavos) || d.valorCentavos <= 0) {
    throw new ErroDeNegocio('Digite um valor maior que zero.', 'valor');
  }
  if (!ehDia(d.data)) throw new ErroDeNegocio('Data inválida.', 'data');
  const nota = d.nota === null ? null : normalizarNome(d.nota);
  if (nota !== null && nota.length > 120) {
    throw new ErroDeNegocio('A nota pode ter até 120 caracteres.', 'nota');
  }
  return banco.db.transaction((tx) => {
    exigirNaoRemovida(tx, metaId);
    if (d.tipo === 'retirar') {
      const guardado = guardadoDaMeta(tx, metaId);
      if (d.valorCentavos > guardado) {
        throw new ErroDeNegocio(
          `Só há ${formatarBRL(guardado)} guardados. Não dá para retirar ${formatarBRL(d.valorCentavos)}.`,
          'valor',
        );
      }
    }
    const quando = agoraIso(agora);
    return tx
      .insert(metasMovimentos)
      .values({
        metaId,
        valorCentavos: d.tipo === 'guardar' ? d.valorCentavos : -d.valorCentavos,
        data: d.data,
        nota: nota || null,
        criadoEm: quando,
        atualizadoEm: quando,
      })
      .returning()
      .get();
  }, IMEDIATA);
}

/** Tira um movimento da meta (vai para a lixeira). Recusa se o guardado ficaria negativo. */
export function removerMovimentoMeta(banco: Banco, movimentoId: string, agora = new Date()): void {
  banco.db.transaction((tx) => {
    const mov = tx.select().from(metasMovimentos).where(eq(metasMovimentos.id, movimentoId)).get();
    if (!mov || mov.removidoEm) throw naoEncontrado('Este movimento não existe mais');
    exigirNaoRemovida(tx, mov.metaId);
    const restante = guardadoDaMeta(tx, mov.metaId) - mov.valorCentavos;
    if (restante < 0) {
      throw new ErroDeNegocio(
        'Remover este movimento deixaria a meta com saldo negativo. Remova antes as retiradas.',
      );
    }
    tx.update(metasMovimentos)
      .set({ removidoEm: agoraIso(agora), atualizadoEm: agoraIso(agora) })
      .where(eq(metasMovimentos.id, movimentoId))
      .run();
  }, IMEDIATA);
}

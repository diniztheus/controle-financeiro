/**
 * Limite de gastos do mês: o do próprio mês, se houver, senão o padrão (vale para todo mês).
 * A mesma tabela guarda o padrão (mes = 'padrao') e os ajustes por mês.
 */
import { eq } from 'drizzle-orm';
import { ehMes, type Mes } from '../../dominio/datas.ts';
import type { Centavos } from '../../dominio/dinheiro.ts';
import type { Banco } from '../db/conexao.ts';
import { limitesMensais } from '../db/esquema.ts';
import { ErroDeNegocio } from './erros.ts';

export const PADRAO = 'padrao';

/** Limite que vale para o mês: o do próprio mês, se houver, senão o padrão. `null` = sem limite. */
export function limiteDoMes(banco: Banco, mes: Mes): Centavos | null {
  for (const chave of [mes, PADRAO]) {
    const r = banco.db.select().from(limitesMensais).where(eq(limitesMensais.mes, chave)).get();
    if (r) return r.valorCentavos > 0 ? r.valorCentavos : null;
  }
  return null;
}

/** Define o limite padrão. Zero remove. */
export function definirLimitePadrao(banco: Banco, valorCentavos: Centavos): void {
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos < 0) {
    throw new ErroDeNegocio('O limite não pode ser negativo.', 'valor');
  }
  if (valorCentavos === 0) {
    banco.db.delete(limitesMensais).where(eq(limitesMensais.mes, PADRAO)).run();
    return;
  }
  banco.db
    .insert(limitesMensais)
    .values({ mes: PADRAO, valorCentavos })
    .onConflictDoUpdate({ target: limitesMensais.mes, set: { valorCentavos } })
    .run();
}

/** Define o limite de um mês específico. Zero remove só esse ajuste: o mês volta ao padrão. */
export function definirLimiteMes(banco: Banco, mes: Mes, valorCentavos: Centavos): void {
  if (!ehMes(mes)) throw new ErroDeNegocio('Mês inválido (use AAAA-MM).', 'mes');
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos < 0) {
    throw new ErroDeNegocio('O limite não pode ser negativo.', 'valor');
  }
  if (valorCentavos === 0) {
    banco.db.delete(limitesMensais).where(eq(limitesMensais.mes, mes)).run();
    return;
  }
  banco.db
    .insert(limitesMensais)
    .values({ mes, valorCentavos })
    .onConflictDoUpdate({ target: limitesMensais.mes, set: { valorCentavos } })
    .run();
}

/** Limite padrão e os limites por mês (mais recente primeiro). */
export function listarLimites(banco: Banco): {
  padrao: Centavos | null;
  porMes: { mes: Mes; valorCentavos: Centavos }[];
} {
  const linhas = banco.db.select().from(limitesMensais).all();
  const padrao = linhas.find((l) => l.mes === PADRAO)?.valorCentavos ?? 0;
  const porMes = linhas
    .filter((l) => l.mes !== PADRAO && l.valorCentavos > 0)
    .map((l) => ({ mes: l.mes, valorCentavos: l.valorCentavos }))
    .sort((a, b) => b.mes.localeCompare(a.mes));
  return { padrao: padrao > 0 ? padrao : null, porMes };
}

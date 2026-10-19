/**
 * Lembrete de saldo: quais contas estão com o saldo sem atualizar há mais tempo que o limite.
 *
 * Puro (sem banco): quem chama já traz a data da última atualização de cada conta e a data de
 * hoje, ambas "AAAA-MM-DD" no horário local.
 */
import { ehDia, type Dia } from './datas.ts';
import type { TipoConta } from './contas.ts';

export const LEMBRETE_PADRAO_DIAS = 7;
export const LEMBRETE_MAXIMO_DIAS = 90;

export interface ContaComUltimaAtualizacao {
  id: string;
  nome: string;
  tipo: TipoConta;
  ultimaAtualizacao: Dia;
}

export interface ContaDesatualizada extends ContaComUltimaAtualizacao {
  diasSemAtualizar: number;
}

/** Limite válido: inteiro de 0 (desligado) a 90 dias. */
export function ehDiasLembrete(valor: unknown): valor is number {
  return (
    Number.isInteger(valor) && (valor as number) >= 0 && (valor as number) <= LEMBRETE_MAXIMO_DIAS
  );
}

const EPOCA_MS = (d: Dia) =>
  Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

/** Quantos dias de `de` até `ate` (negativo se `ate` vier antes). Sem fuso e sem horário de verão. */
export function diasEntre(de: Dia, ate: Dia): number {
  if (!ehDia(de) || !ehDia(ate)) throw new RangeError(`Datas inválidas: "${de}", "${ate}"`);
  return Math.round((EPOCA_MS(ate) - EPOCA_MS(de)) / 86_400_000);
}

/**
 * Contas cujo saldo está há MAIS de `limiteDias` sem atualização (exatamente o limite ainda não
 * avisa). Limite 0 desliga o lembrete. Da atualização mais antiga para a mais recente.
 */
export function contasDesatualizadas(
  contas: readonly ContaComUltimaAtualizacao[],
  hoje: Dia,
  limiteDias: number,
): ContaDesatualizada[] {
  if (limiteDias <= 0) return [];
  return contas
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      ultimaAtualizacao: c.ultimaAtualizacao,
      diasSemAtualizar: Math.max(0, diasEntre(c.ultimaAtualizacao, hoje)),
    }))
    .filter((c) => c.diasSemAtualizar > limiteDias)
    .sort(
      (a, b) =>
        a.ultimaAtualizacao.localeCompare(b.ultimaAtualizacao) ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    );
}

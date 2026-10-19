/**
 * Lembrete de saldos: avisa quando o saldo de uma conta ficou muito tempo sem atualização.
 *
 * A data da última atualização vem do histórico de saldos (`saldos_historico`), do registro mais
 * recente de cada conta. Contas na lixeira não entram. A configuração (dias; 0 = desligado) fica
 * na tabela `config`.
 */
import { eq, inArray, max } from 'drizzle-orm';
import { hoje, type Dia } from '../../dominio/datas.ts';
import {
  contasDesatualizadas as calcularDesatualizadas,
  ehDiasLembrete,
  LEMBRETE_MAXIMO_DIAS,
  LEMBRETE_PADRAO_DIAS,
  type ContaDesatualizada,
} from '../../dominio/lembretes.ts';
import type { Banco } from '../db/conexao.ts';
import { config, saldosHistorico } from '../db/esquema.ts';
import { listarContas } from './contas.ts';
import { ErroDeNegocio } from './erros.ts';

const CHAVE = 'lembrete_saldo_dias';
const IMEDIATA = { behavior: 'immediate' } as const;

/** Dias sem atualizar o saldo a partir dos quais o aviso aparece (0 = desligado). */
export function lerLembreteSaldoDias(banco: Banco): number {
  const linha = banco.db.select().from(config).where(eq(config.chave, CHAVE)).get();
  const valor: unknown = linha?.valor;
  return ehDiasLembrete(valor) ? valor : LEMBRETE_PADRAO_DIAS;
}

export function salvarLembreteSaldoDias(banco: Banco, dias: number): number {
  if (!ehDiasLembrete(dias)) {
    throw new ErroDeNegocio(`Informe um número de dias de 0 a ${LEMBRETE_MAXIMO_DIAS}.`, 'dias');
  }
  banco.db.transaction((tx) => {
    tx.insert(config)
      .values({ chave: CHAVE, valor: dias })
      .onConflictDoUpdate({ target: config.chave, set: { valor: dias } })
      .run();
  }, IMEDIATA);
  return dias;
}

/** Dia local ("AAAA-MM-DD") de um instante gravado em ISO UTC. */
function diaLocal(iso: string): Dia {
  return hoje(new Date(iso));
}

/**
 * Contas ativas cujo saldo está há mais dias que a configuração sem atualização, da mais antiga
 * para a mais nova. Com a configuração em 0, devolve lista vazia sem consultar nada.
 */
export function contasDesatualizadas(banco: Banco, dataHoje: Dia): ContaDesatualizada[] {
  const limite = lerLembreteSaldoDias(banco);
  if (limite === 0) return [];
  const lista = listarContas(banco);
  if (lista.length === 0) return [];

  const ultimos = banco.db
    .select({ contaId: saldosHistorico.contaId, ultimo: max(saldosHistorico.registradoEm) })
    .from(saldosHistorico)
    .where(
      inArray(
        saldosHistorico.contaId,
        lista.map((c) => c.id),
      ),
    )
    .groupBy(saldosHistorico.contaId)
    .all();
  const porConta = new Map(ultimos.map((r) => [r.contaId, r.ultimo]));

  return calcularDesatualizadas(
    lista.map((c) => ({
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      // Toda conta nasce com um registro de saldo; a data de criação é só uma salvaguarda.
      ultimaAtualizacao: diaLocal(porConta.get(c.id) ?? c.criadoEm),
    })),
    dataHoje,
    limite,
  );
}

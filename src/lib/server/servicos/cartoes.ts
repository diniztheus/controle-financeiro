/**
 * Cartões: nesta onda só leitura (compras de cartão vêm do importador).
 * Cadastro, faturas e limite disponível chegam com a tela de cartões.
 */
import { eq } from 'drizzle-orm';
import type { Banco } from '../db/conexao.ts';
import { cartoes } from '../db/esquema.ts';

export function nomeDoCartao(banco: Banco, id: string): string | null {
  return (
    banco.db.select({ nome: cartoes.nome }).from(cartoes).where(eq(cartoes.id, id)).get()?.nome ??
    null
  );
}

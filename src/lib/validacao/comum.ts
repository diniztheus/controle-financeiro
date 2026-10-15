/**
 * Esquemas Zod compartilhados entre navegador e servidor.
 * As regras vêm do domínio; aqui só ficam as mensagens e a forma dos campos.
 */
import { z } from 'zod';
import { ehDia, ehMes } from '../dominio/datas.ts';
import { MAX_PARCELAS, parseValor } from '../dominio/dinheiro.ts';

// Mensagens padrão do Zod em português (campo ausente, tipo errado…).
z.config(z.locales.pt());

/** Campo de valor digitado em reais ("1.234,56") → centavos inteiros. */
export const valorEmReais = z.string().transform((texto, ctx) => {
  const v = parseValor(texto);
  if (v === null) {
    ctx.addIssue({ code: 'custom', message: 'Valor inválido. Use, por exemplo, 1.234,56' });
    return z.NEVER;
  }
  return v;
});

/** Valor positivo (gastos, compras). */
export const valorPositivo = valorEmReais.refine(
  (v) => v > 0,
  'O valor precisa ser maior que zero',
);

export const dia = z.string().refine(ehDia, 'Data inválida');
export const mes = z.string().refine(ehMes, 'Mês inválido (use AAAA-MM)');

export const diaDoMes = z.coerce
  .number()
  .int('Use um dia inteiro')
  .min(1, 'O dia vai de 1 a 31')
  .max(31, 'O dia vai de 1 a 31');

export const numeroParcelas = z.coerce
  .number()
  .int()
  .min(1, 'Pelo menos 1 parcela')
  .max(MAX_PARCELAS, `No máximo ${MAX_PARCELAS} parcelas`);

export const textoObrigatorio = (rotulo: string, max = 120) =>
  z
    .string()
    .trim()
    .min(1, `${rotulo} é obrigatório`)
    .max(max, `${rotulo}: no máximo ${max} caracteres`);

/**
 * Formato dos dados do app atual (Artifact "Controle Financeiro", v3).
 *
 * O arquivo pode vir de dois jeitos, e os dois são aceitos:
 * - o botão "Exportar dados" do app: `{ app, versao, exportadoEm, colecoes: { contas, gastos, … } }`;
 * - o conteúdo cru do armazenamento do navegador (chave `controle-financeiro:v1`):
 *   `{ contas, gastos, config, cartoes, faturas, bitcoin, btcPrecos }`.
 *
 * Cada documento tem o `id` do app atual. Valores em centavos e sats inteiros. Campos que o site
 * não usa são ignorados; campos com tipo errado viram erro com o id do documento.
 */
import { z } from 'zod';

const inteiro = z.number().int();
const texto = z.string();

const conta = z.object({
  id: texto,
  nome: texto,
  tipo: texto.optional(),
  saldo: inteiro.optional(),
  criadoEm: texto.optional(),
  atualizadoEm: texto.optional(),
});

const gasto = z.object({
  id: texto,
  valor: inteiro,
  descricao: texto.nullish(),
  categoria: texto.nullish(),
  data: texto,
  meio: z.enum(['conta', 'cartao']).optional(),
  contaId: texto.nullish(),
  cartaoId: texto.nullish(),
  parcelas: z.union([inteiro, z.string()]).nullish(),
  criadoEm: texto.optional(),
});

const cartao = z.object({
  id: texto,
  nome: texto,
  limite: inteiro.optional(),
  fechamento: z.union([inteiro, z.string()]).optional(),
  vencimento: z.union([inteiro, z.string()]).optional(),
  criadoEm: texto.optional(),
});

const fatura = z.object({
  id: texto,
  cartaoId: texto.optional(),
  mes: texto.optional(),
  pagaEm: texto.nullish(),
});

const movimento = z.object({
  id: texto,
  sats: inteiro,
  valor: inteiro.nullish(),
  data: texto,
  nota: texto.nullish(),
  criadoEm: texto.optional(),
});

const preco = z.object({ id: texto, valor: inteiro });

const config = z
  .object({ id: texto, lista: z.array(texto).optional(), valor: inteiro.optional() })
  .loose();

export const colecoesApp = z.object({
  contas: z.array(conta).default([]),
  gastos: z.array(gasto).default([]),
  config: z.array(config).default([]),
  cartoes: z.array(cartao).default([]),
  faturas: z.array(fatura).default([]),
  bitcoin: z.array(movimento).default([]),
  btcPrecos: z.array(preco).default([]),
});

export type ColecoesApp = z.output<typeof colecoesApp>;
export type ContaApp = z.output<typeof conta>;
export type GastoApp = z.output<typeof gasto>;
export type CartaoApp = z.output<typeof cartao>;

/** Lê o JSON (já com `JSON.parse`) nos dois formatos aceitos. Erro com caminho legível. */
export function lerExportacao(bruto: unknown): ColecoesApp {
  const obj =
    bruto && typeof bruto === 'object' && 'colecoes' in bruto
      ? (bruto as { colecoes: unknown }).colecoes
      : bruto;
  const r = colecoesApp.safeParse(obj);
  if (r.success) return r.data;
  const linhas = r.error.issues.slice(0, 10).map((i) => {
    const caminho = i.path.join('.');
    return `  ${caminho || '(raiz)'}: ${i.message}`;
  });
  throw new Error(`O arquivo não tem o formato do app atual:\n${linhas.join('\n')}`);
}

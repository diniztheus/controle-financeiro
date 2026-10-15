/**
 * Formato dos dados do app atual (Artifact "Controle Financeiro", v3).
 *
 * O arquivo pode vir de dois jeitos, e os dois são aceitos:
 * - o botão "Exportar dados" do app: `{ app, versao, exportadoEm, colecoes: { contas, gastos, … } }`;
 * - o conteúdo cru do armazenamento do navegador (chave `controle-financeiro:v1`):
 *   `{ contas, gastos, config, cartoes, faturas, bitcoin, btcPrecos }`.
 *
 * Cada documento tem o `id` do app atual. Valores em centavos e sats inteiros. Campos que o site
 * não usa são mantidos na leitura e listados como avisos pelo importador; campos com tipo errado
 * viram erro com o caminho do campo.
 */
import { z } from 'zod';

const inteiro = z.number().int();
const texto = z.string();

const conta = z.looseObject({
  id: texto,
  nome: texto,
  tipo: texto.optional(),
  saldo: inteiro.optional(),
  criadoEm: texto.optional(),
  atualizadoEm: texto.optional(),
});

const gasto = z.looseObject({
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

const cartao = z.looseObject({
  id: texto,
  nome: texto,
  limite: inteiro.optional(),
  fechamento: z.union([inteiro, z.string()]).optional(),
  vencimento: z.union([inteiro, z.string()]).optional(),
  criadoEm: texto.optional(),
});

const fatura = z.looseObject({
  id: texto,
  cartaoId: texto.optional(),
  mes: texto.optional(),
  pagaEm: texto.nullish(),
  paga: z.boolean().optional(),
});

const movimento = z.looseObject({
  id: texto,
  sats: inteiro,
  valor: inteiro.nullish(),
  data: texto,
  nota: texto.nullish(),
  criadoEm: texto.optional(),
});

const preco = z.looseObject({ id: texto, valor: inteiro });

const config = z.looseObject({
  id: texto,
  lista: z.array(texto).optional(),
  valor: inteiro.optional(),
});

export const colecoesApp = z.looseObject({
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

/** Campos que o importador usa, por coleção (o resto vira aviso). */
export const CAMPOS_CONHECIDOS: Record<string, readonly string[]> = {
  contas: ['id', 'nome', 'tipo', 'saldo', 'criadoEm', 'atualizadoEm'],
  gastos: [
    'id',
    'valor',
    'descricao',
    'categoria',
    'data',
    'meio',
    'contaId',
    'cartaoId',
    'parcelas',
    'criadoEm',
  ],
  cartoes: ['id', 'nome', 'limite', 'fechamento', 'vencimento', 'criadoEm'],
  faturas: ['id', 'cartaoId', 'mes', 'pagaEm', 'paga'],
  bitcoin: ['id', 'sats', 'valor', 'data', 'nota', 'criadoEm'],
  btcPrecos: ['id', 'valor'],
  config: ['id', 'lista', 'valor'],
};

/** Campos e coleções do arquivo que o site não usa, para avisar em vez de sumir calado. */
export function camposIgnorados(dados: ColecoesApp): string[] {
  const avisos: string[] = [];
  const obj = dados as Record<string, unknown>;
  for (const chave of Object.keys(obj)) {
    if (!(chave in CAMPOS_CONHECIDOS)) avisos.push(`Coleção "${chave}" do arquivo foi ignorada.`);
  }
  for (const [colecao, conhecidos] of Object.entries(CAMPOS_CONHECIDOS)) {
    const contagem = new Map<string, number>();
    for (const doc of (obj[colecao] as Record<string, unknown>[] | undefined) ?? []) {
      for (const k of Object.keys(doc)) {
        if (!conhecidos.includes(k)) contagem.set(k, (contagem.get(k) ?? 0) + 1);
      }
    }
    for (const [k, n] of contagem) {
      avisos.push(`Campo "${k}" em ${colecao} foi ignorado (${n} documento(s)).`);
    }
  }
  return avisos;
}

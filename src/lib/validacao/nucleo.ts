/**
 * Formulários do núcleo (contas, categorias, gastos, limite).
 * Os campos chegam como texto (FormData); aqui viram valores do domínio.
 */
import { z } from 'zod';
import { parseSats } from '../dominio/bitcoin.ts';
import { CORES } from '../dominio/categorias.ts';
import { TIPOS_CONTA } from '../dominio/contas.ts';
import { dia, textoObrigatorio, valorEmReais, valorPositivo } from './comum.ts';

/** Texto opcional: vazio ou só espaços vira `null`. */
export const textoOpcional = (rotulo: string, max: number) =>
  z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim())
    .pipe(z.string().max(max, `${rotulo}: no máximo ${max} caracteres`))
    .transform((s) => (s === '' ? null : s));

/** Id opcional vindo de um <select> ("" = não informado). */
const idOpcional = z
  .string()
  .optional()
  .transform((s) => (s ?? '').trim() || null);

const idObrigatorio = (rotulo: string) =>
  z
    .string({ message: `Escolha ${rotulo}` })
    .trim()
    .min(1, `Escolha ${rotulo}`);

export const contaForm = z.object({
  nome: textoObrigatorio('O nome', 60),
  tipo: z.enum(TIPOS_CONTA, { message: 'Tipo de conta inválido' }),
  /** Pode ser negativo (cheque especial). */
  saldo: valorEmReais,
});
export type ContaForm = z.output<typeof contaForm>;

export const saldoForm = z.object({ saldo: valorEmReais });

export const categoriaForm = z.object({
  nome: textoObrigatorio('O nome', 40),
  cor: z
    .enum(CORES, { message: 'Cor inválida' })
    .or(z.literal(''))
    .optional()
    .transform((c) => c || null),
});
export type CategoriaForm = z.output<typeof categoriaForm>;

export const gastoForm = z.object({
  valor: valorPositivo,
  descricao: textoOpcional('A descrição', 120),
  categoriaId: idObrigatorio('uma categoria'),
  data: dia,
  contaId: idOpcional,
});
export type GastoForm = z.output<typeof gastoForm>;

/** Limite do mês: vazio ou zero remove o limite. */
export const limiteForm = z.object({
  valor: z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim() || '0')
    .pipe(valorEmReais)
    .refine((v) => v >= 0, 'O limite não pode ser negativo'),
});

/** Lê um FormData em objeto simples (só os campos de texto). */
export function lerForm(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd) if (typeof v === 'string') o[k] = v;
  return o;
}

/** Primeira mensagem de erro por campo, para mostrar ao lado de cada um. */
export function errosPorCampo(e: z.ZodError): Record<string, string> {
  const r: Record<string, string> = {};
  for (const issue of e.issues) {
    const campo = String(issue.path[0] ?? '_');
    r[campo] ??= issue.message;
  }
  return r;
}

/** Quantidade de sats (inteiro positivo, "1.500" ou "1500"); o sinal vem do tipo da operação. */
const satsPositivos = z
  .string({ message: 'Informe a quantidade de sats' })
  .transform((texto, ctx) => {
    const v = parseSats(texto);
    if (v === null || v <= 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Quantidade de sats inválida. Use um número inteiro, como 1.500',
      });
      return z.NEVER;
    }
    return v;
  });

/** Compra ou venda de bitcoin. Saída: `sats` com sinal (+ compra, − venda). */
export const btcForm = z
  .object({
    tipo: z.enum(['compra', 'venda'], { message: 'Escolha compra ou venda' }),
    sats: satsPositivos,
    /** Vazio = não informado (0). */
    valor: z
      .string()
      .optional()
      .transform((s) => (s ?? '').trim() || '0')
      .pipe(valorEmReais)
      .refine((v) => v >= 0, 'O valor não pode ser negativo'),
    data: dia,
    nota: textoOpcional('A nota', 120),
  })
  .transform((d) => ({
    sats: d.tipo === 'venda' ? -d.sats : d.sats,
    valorCentavos: d.valor,
    data: d.data,
    nota: d.nota,
  }));
export type BtcForm = z.output<typeof btcForm>;

/** Preço manual do BTC em um dia. Saída: `preco` em centavos por 1 BTC. */
export const precoForm = z.object({
  data: dia,
  preco: valorPositivo,
});
export type PrecoForm = z.output<typeof precoForm>;

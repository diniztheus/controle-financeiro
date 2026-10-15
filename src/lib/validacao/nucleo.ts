/**
 * Formulários do núcleo (contas, categorias, gastos, limite).
 * Os campos chegam como texto (FormData); aqui viram valores do domínio.
 */
import { z } from 'zod';
import { ehCor } from '../dominio/categorias.ts';
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
    .string()
    .optional()
    .refine((c) => c === undefined || c === '' || ehCor(c), 'Cor inválida')
    .transform((c) => (c ? c : null)),
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
    .transform((s) => (s.trim() === '' ? '0' : s))
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

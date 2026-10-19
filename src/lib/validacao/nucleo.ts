/**
 * Formulários do núcleo (contas, categorias, gastos, limite).
 * Os campos chegam como texto (FormData); aqui viram valores do domínio.
 */
import { z } from 'zod';
import { parseSats } from '../dominio/bitcoin.ts';
import { CORES } from '../dominio/categorias.ts';
import { CATEGORIAS_RECEITA } from '../dominio/receitas.ts';
import { TIPOS_CONTA } from '../dominio/contas.ts';
import { ehDia } from '../dominio/datas.ts';
import { parseValor } from '../dominio/dinheiro.ts';
import { dia, diaDoMes, mes, textoObrigatorio, valorEmReais, valorPositivo } from './comum.ts';
import { MAX_PARCELAS } from '../dominio/dinheiro.ts';
import type { FiltroLancamentos } from '../dominio/relatorios.ts';

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

/**
 * Gasto. Saída: os campos de sempre, mais `meio` ('conta' padrão ou 'cartao'), `cartaoId` e
 * `numParcelas` (1 no gasto à vista). Com cartão, `contaId` sai null.
 */
export const gastoForm = z
  .object({
    valor: valorPositivo,
    descricao: textoOpcional('A descrição', 120),
    categoriaId: idObrigatorio('uma categoria'),
    data: dia,
    contaId: idOpcional,
    meio: z
      .enum(['conta', 'cartao'], { message: 'Escolha conta ou cartão' })
      .or(z.literal(''))
      .optional()
      .transform((m) => m || 'conta'),
    cartao: idOpcional,
    parcelas: z
      .string()
      .optional()
      .transform((s, ctx) => {
        const n = Number((s ?? '').trim() || '1');
        if (!Number.isInteger(n) || n < 1 || n > MAX_PARCELAS) {
          ctx.addIssue({ code: 'custom', message: `Escolha de 1 a ${MAX_PARCELAS} parcelas` });
          return z.NEVER;
        }
        return n;
      }),
  })
  .superRefine((f, ctx) => {
    if (f.meio === 'cartao' && !f.cartao) {
      ctx.addIssue({ code: 'custom', path: ['cartao'], message: 'Escolha o cartão' });
    }
  })
  .transform((f) => {
    const noCartao = f.meio === 'cartao';
    return {
      valor: f.valor,
      descricao: f.descricao,
      categoriaId: f.categoriaId,
      data: f.data,
      contaId: noCartao ? null : f.contaId,
      meio: f.meio,
      cartaoId: noCartao ? f.cartao : null,
      numParcelas: noCartao ? f.parcelas : 1,
    };
  });
export type GastoForm = z.output<typeof gastoForm>;

/** Cartão. Saída: `DadosCartao` (servicos/cartoes.ts). Limite vazio vale 0 (sem limite). */
export const cartaoForm = z
  .object({
    nome: textoObrigatorio('O nome', 60),
    limite: z
      .string()
      .optional()
      .transform((s) => (s ?? '').trim() || '0')
      .pipe(valorEmReais)
      .refine((v) => v >= 0, 'O limite não pode ser negativo'),
    fechamento: diaDoMes,
    vencimento: diaDoMes,
  })
  .transform((d) => ({
    nome: d.nome,
    limiteCentavos: d.limite,
    diaFechamento: d.fechamento,
    diaVencimento: d.vencimento,
  }));
export type CartaoForm = z.output<typeof cartaoForm>;

export const pagarFaturaForm = z.object({
  /** Data do pagamento; vazio = hoje (o serviço decide). */
  pagaEm: z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim())
    .refine((s) => s === '' || ehDia(s), 'Data inválida')
    .transform((s) => s || undefined),
  /** Valor pago em reais; vazio = total da fatura. */
  valor: z
    .string()
    .optional()
    .transform((s, ctx) => {
      const t = (s ?? '').trim();
      if (t === '') return undefined;
      const r = valorEmReais.safeParse(t);
      if (!r.success) {
        ctx.addIssue({ code: 'custom', message: 'Valor inválido. Use, por exemplo, 1.234,56' });
        return z.NEVER;
      }
      if (r.data < 0) {
        ctx.addIssue({ code: 'custom', message: 'O valor não pode ser negativo' });
        return z.NEVER;
      }
      return r.data;
    }),
});
export type PagarFaturaForm = z.output<typeof pagarFaturaForm>;

/** Data opcional ("AAAA-MM-DD"); vazio vira null. */
const diaOpcional = (rotulo: string) =>
  z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim())
    .refine((s) => s === '' || ehDia(s), `${rotulo}: data inválida`)
    .transform((s) => s || null);

/** Receita: a saída já vem no formato de `DadosReceita` (servicos/receitas.ts). */
export const receitaForm = z
  .object({
    valor: valorPositivo,
    data: dia,
    categoria: z.enum(CATEGORIAS_RECEITA, { message: 'Escolha uma categoria' }),
    descricao: textoOpcional('A descrição', 120),
    conta: idOpcional,
    observacao: textoOpcional('A observação', 500),
    /** Só ao lançar: "nao" cria como prevista. Ausente (ou "sim") = já recebida. */
    recebida: z.enum(['sim', 'nao']).optional(),
    /** Só ao lançar: "sim" repete todo mês, no mesmo dia, a partir da data. */
    repetir: z.enum(['sim']).optional(),
    /** Com `repetir`: último dia em que a receita se repete (vazio = sem fim). */
    ate: diaOpcional('A data final'),
  })
  .superRefine((f, ctx) => {
    if (f.repetir && f.ate !== null && f.ate < f.data) {
      ctx.addIssue({
        code: 'custom',
        path: ['ate'],
        message: 'A data final é antes da data da receita',
      });
    }
  })
  .transform((d) => ({
    valorCentavos: d.valor,
    data: d.data,
    categoria: d.categoria,
    descricao: d.descricao,
    contaId: d.conta,
    observacao: d.observacao,
    recebida: d.recebida !== 'nao',
    repetir: d.repetir === 'sim',
    fim: d.repetir === 'sim' ? d.ate : null,
  }));
export type ReceitaForm = z.output<typeof receitaForm>;

/**
 * Receita recorrente (modelo). Saída: `DadosRecorrente` (servicos/recorrentes.ts), com
 * `fim` null quando não há data final.
 */
export const receitaRecorrenteForm = z
  .object({
    valor: valorPositivo,
    categoria: z.enum(CATEGORIAS_RECEITA, { message: 'Escolha uma categoria' }),
    dia: diaDoMes,
    inicio: dia,
    fim: diaOpcional('A data final'),
    descricao: textoOpcional('A descrição', 120),
    conta: idOpcional,
    observacao: textoOpcional('A observação', 500),
  })
  .superRefine((f, ctx) => {
    if (f.fim !== null && f.fim < f.inicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['fim'],
        message: 'A data final é antes da inicial',
      });
    }
  })
  .transform((d) => ({
    valorCentavos: d.valor,
    categoria: d.categoria,
    diaDoMes: d.dia,
    inicio: d.inicio,
    fim: d.fim,
    descricao: d.descricao,
    contaId: d.conta,
    observacao: d.observacao,
  }));
export type ReceitaRecorrenteForm = z.output<typeof receitaRecorrenteForm>;

/**
 * "Recebi": valor e data reais, já preenchidos com os previstos. Vazio = manter o que está.
 * Saída: `{ valorCentavos?, data? }` (servicos/receitas.ts, confirmarRecebimento).
 */
export const confirmarRecebimentoForm = z
  .object({
    valor: z.string().optional(),
    data: z.string().optional(),
  })
  .transform((f, ctx) => {
    const texto = (f.valor ?? '').trim();
    let valorCentavos: number | undefined;
    if (texto !== '') {
      const v = parseValor(texto);
      if (v === null || v <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['valor'],
          message: 'Valor inválido. Use, por exemplo, 1.234,56',
        });
        return z.NEVER;
      }
      valorCentavos = v;
    }
    const dataTexto = (f.data ?? '').trim();
    if (dataTexto !== '' && !ehDia(dataTexto)) {
      ctx.addIssue({ code: 'custom', path: ['data'], message: 'Data inválida' });
      return z.NEVER;
    }
    return {
      valorCentavos,
      data: dataTexto === '' ? undefined : dataTexto,
    };
  });
export type ConfirmarRecebimentoForm = z.output<typeof confirmarRecebimentoForm>;

/** Limite do mês: vazio ou zero remove o limite. */
export const limiteForm = z.object({
  valor: z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim() || '0')
    .pipe(valorEmReais)
    .refine((v) => v >= 0, 'O limite não pode ser negativo'),
});

/**
 * Formulários do PIN. Cada campo é opcional (vazio vira `undefined`) e, quando preenchido, precisa
 * ter de 4 a 12 dígitos. Quem chama confere quais campos a ação exige:
 * - `pin`: o PIN digitado para entrar ou definir;
 * - `atual`: o PIN atual, para trocar ou remover;
 * - `novo`: o PIN novo, para trocar.
 * `lembrar` é o checkbox "Manter conectado por 30 dias".
 */
const pinOpcional = (rotulo: string) =>
  z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim())
    .pipe(
      z
        .string()
        .regex(/^(\d{4,12})?$/, `${rotulo} precisa ter de 4 a 12 números`)
        .transform((s) => (s === '' ? undefined : s)),
    );

export const pinForm = z.object({
  pin: pinOpcional('O PIN'),
  atual: pinOpcional('O PIN atual'),
  novo: pinOpcional('O PIN novo'),
  lembrar: z
    .string()
    .optional()
    .transform((v) => v === 'on' || v === 'true' || v === '1'),
});
export type PinForm = z.output<typeof pinForm>;

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

/** Limite de um mês específico (AAAA-MM). Valor vazio ou zero remove o ajuste do mês. */
export const limiteMesForm = z.object({
  mes,
  valor: limiteForm.shape.valor,
});
export type LimiteMesForm = z.output<typeof limiteMesForm>;

/** Texto opcional de GET: vazio vira ausente (undefined). */
const textoGet = (rotulo: string, max: number) =>
  z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim())
    .pipe(z.string().max(max, `${rotulo}: no máximo ${max} caracteres`))
    .transform((s) => s || undefined);

/** Data de GET ("AAAA-MM-DD"); vazio = ausente. */
const diaGet = (rotulo: string) =>
  textoGet(rotulo, 10).pipe(
    z
      .string()
      .optional()
      .refine((s) => s === undefined || dia.safeParse(s).success, {
        message: `${rotulo}: data inválida`,
      }),
  );

/** Valor em reais de GET ("1.000,00"); vazio = ausente. */
const valorGet = (rotulo: string) =>
  textoGet(rotulo, 20).pipe(
    z
      .string()
      .optional()
      .transform((s, ctx) => {
        if (s === undefined) return undefined;
        const r = valorEmReais.safeParse(s);
        if (!r.success) {
          ctx.addIssue({ code: 'custom', message: `${rotulo}: valor inválido` });
          return z.NEVER;
        }
        if (r.data < 0) {
          ctx.addIssue({ code: 'custom', message: `${rotulo}: não pode ser negativo` });
          return z.NEVER;
        }
        return r.data;
      }),
  );

/**
 * Filtros da busca (GET: q, de, ate, categoria, meio, origem, min, max; todos opcionais).
 * Saída: filtro do domínio, com as chaves ausentes em `undefined`.
 */
export const filtroForm = z
  .object({
    q: textoGet('O texto', 80),
    de: diaGet('A data inicial'),
    ate: diaGet('A data final'),
    categoria: textoGet('A categoria', 60),
    meio: z
      .enum(['conta', 'cartao'], { message: 'Meio inválido' })
      .or(z.literal(''))
      .optional()
      .transform((m) => m || undefined),
    origem: textoGet('A conta ou cartão', 60),
    min: valorGet('O valor mínimo'),
    max: valorGet('O valor máximo'),
  })
  .superRefine((f, ctx) => {
    if (f.de && f.ate && f.de > f.ate) {
      ctx.addIssue({ code: 'custom', path: ['ate'], message: 'A data final é antes da inicial' });
    }
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['max'],
        message: 'O valor máximo é menor que o mínimo',
      });
    }
  })
  .transform((f): FiltroLancamentos => ({
    texto: f.q,
    de: f.de,
    ate: f.ate,
    categoriaId: f.categoria,
    meio: f.meio,
    origem: f.origem,
    minCentavos: f.min,
    maxCentavos: f.max,
  }));
export type FiltroForm = z.output<typeof filtroForm>;

/** Situação de GET na busca de receitas: vazio = todas. */
const situacaoGet = z
  .enum(['recebida', 'prevista', 'todas'], { message: 'Situação inválida' })
  .or(z.literal(''))
  .optional()
  .transform((s) => s || undefined);

/**
 * Filtros da busca de receitas (GET: q, de, ate, categoria, origem, situacao, min, max; todos
 * opcionais). Saída: filtro do domínio (FiltroReceitas), com as chaves ausentes em `undefined`.
 */
export const filtroReceitasForm = z
  .object({
    q: textoGet('O texto', 80),
    de: diaGet('A data inicial'),
    ate: diaGet('A data final'),
    categoria: textoGet('A categoria', 60),
    origem: textoGet('A conta', 60),
    situacao: situacaoGet,
    min: valorGet('O valor mínimo'),
    max: valorGet('O valor máximo'),
  })
  .superRefine((f, ctx) => {
    if (f.de && f.ate && f.de > f.ate) {
      ctx.addIssue({ code: 'custom', path: ['ate'], message: 'A data final é antes da inicial' });
    }
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['max'],
        message: 'O valor máximo é menor que o mínimo',
      });
    }
  })
  .transform((f) => ({
    texto: f.q,
    de: f.de,
    ate: f.ate,
    categoria: f.categoria,
    contaNome: f.origem,
    situacao: f.situacao,
    minCentavos: f.min,
    maxCentavos: f.max,
  }));
export type FiltroReceitasForm = z.output<typeof filtroReceitasForm>;

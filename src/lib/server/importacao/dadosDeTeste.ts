/**
 * Dados de teste de longo prazo (por padrão, 10 anos) para medir o desempenho do site.
 *
 * Determinístico: a mesma data final gera sempre o mesmo histórico (RNG com semente fixa, sem
 * `Math.random`). Grava tudo por INSERT em lote numa única transação: usar os serviços (lançar um
 * gasto por vez, em laço) levaria minutos. Este módulo não decide ONDE gravar: quem chama passa um
 * banco já migrado (o script `scripts/gerar-dados-teste.ts` exige uma pasta de saída própria).
 */
import { monotonicFactory } from 'ulid';
import {
  diasNoMes,
  diaNoMes,
  hoje,
  mesDe,
  mesesEntre,
  primeiroDiaDoMes,
  somarMeses,
  type Dia,
  type Mes,
} from '../../dominio/datas.ts';
import { CATEGORIAS_PADRAO, corPorPosicao } from '../../dominio/categorias.ts';
import { SATS_POR_BTC } from '../../dominio/bitcoin.ts';
import { dividirEmParcelas, type Centavos } from '../../dominio/dinheiro.ts';
import {
  dataFechamento,
  dataVencimento,
  mesDaFatura,
  type CicloCartao,
} from '../../dominio/fatura.ts';
import { CATEGORIAS_RECEITA } from '../../dominio/receitas.ts';
import type { Banco } from '../db/conexao.ts';
import {
  btcMovimentos,
  btcPrecos,
  cartoes,
  categorias,
  compras,
  contas,
  faturas,
  limitesMensais,
  parcelas,
  receitas,
  receitasRecorrentes,
  saldosHistorico,
} from '../db/esquema.ts';
import { ErroDeNegocio } from '../servicos/erros.ts';

export interface OpcoesDadosDeTeste {
  /** Quantos anos de histórico (1 a 20). Padrão 10. */
  anos?: number;
  /** Último dia gerado (inclusive). Padrão: hoje. */
  fim?: Dia;
}

export interface ResumoDadosDeTeste {
  inicio: Dia;
  fim: Dia;
  meses: number;
  contas: number;
  categorias: number;
  cartoes: number;
  faturas: number;
  comprasAVista: number;
  comprasCartao: number;
  parcelas: number;
  receitas: number;
  receitasRecorrentes: number;
  saldos: number;
  movimentosBtc: number;
  precosBtc: number;
  limites: number;
}

/** Semente fixa: mesma entrada, mesmo banco. */
const SEMENTE = 20260101;
const SEMENTE_IDS = 7;

/** Gerador pseudoaleatório (mulberry32): 32 bits, semente fixa, sem Math.random. */
function criarRng(semente: number) {
  let s = semente >>> 0;
  const real = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const inteiro = (min: number, max: number): number => min + Math.floor(real() * (max - min + 1));
  const escolha = <T>(lista: readonly T[]): T => lista[Math.floor(real() * lista.length)]!;
  return { real, inteiro, escolha };
}

const DESCRICOES_AVISTA = [
  'Mercado do bairro',
  'Padaria',
  'Farmácia',
  'Combustível',
  'Restaurante',
  'Cinema',
  'Conta de luz',
  'Internet',
  'Academia',
  'Livraria',
  'Feira',
  'Lanche',
  'Estacionamento',
  'Presente',
  'Assinatura de streaming',
];

const DESCRICOES_CARTAO = [
  'Notebook',
  'Passagem aérea',
  'Hotel',
  'Roupas',
  'Eletrodoméstico',
  'Curso online',
  'Tênis',
  'Móveis',
  'Celular',
  'Consulta médica',
  'Bicicleta',
  'Viagem',
];

const DESCRICOES_RECEITA_EXTRA = [
  'Projeto freelance',
  'Reembolso de viagem',
  'Venda usada',
  'Presente',
];

/** Dias entre duas datas ISO, inclusive. */
function diasEntre(de: Dia, ate: Dia): number {
  return (
    Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000) + 1
  );
}

/** Dia ISO a partir de um carimbo de milissegundos (UTC, sem horário). */
function diaDeMs(ms: number): Dia {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Preenche o banco (já migrado) com `anos` anos de histórico, terminando em `fim`.
 * Recusa banco que já tenha contas, categorias ou gastos: os dados não se misturam.
 */
export function gerarDadosDeTeste(
  banco: Banco,
  opcoes: OpcoesDadosDeTeste = {},
): ResumoDadosDeTeste {
  const anos = opcoes.anos ?? 10;
  if (!Number.isInteger(anos) || anos < 1 || anos > 20) {
    throw new ErroDeNegocio('Os dados de teste cobrem de 1 a 20 anos.', 'anos');
  }
  const fim = opcoes.fim ?? hoje();
  const mesFim = mesDe(fim);
  const meses = mesesEntre(somarMeses(mesFim, -(anos * 12 - 1)), mesFim);
  const inicio = primeiroDiaDoMes(meses[0]!);
  const diaFim = Number(fim.slice(8, 10));

  const jaTemDados =
    banco.db.select({ id: contas.id }).from(contas).limit(1).get() ??
    banco.db.select({ id: categorias.id }).from(categorias).limit(1).get() ??
    banco.db.select({ id: compras.id }).from(compras).limit(1).get();
  if (jaTemDados) {
    throw new ErroDeNegocio(
      'O banco já tem dados. Os dados de teste só são gravados num banco vazio.',
    );
  }

  const rng = criarRng(SEMENTE);
  const rngIds = criarRng(SEMENTE_IDS);
  const novoId = monotonicFactory(() => rngIds.real());

  // Cada linha ganha um carimbo de criação ordenado (data + sequência em ms): os desempates da
  // consulta ("mais recente primeiro") ficam determinísticos.
  let sequencia = 0;
  const carimbo = (dia: Dia): string => {
    sequencia += 1;
    return new Date(Date.parse(`${dia}T12:00:00.000Z`) + sequencia).toISOString();
  };

  // ------------------------------------------------------------ cadastros

  const contasNovas = [
    { nome: 'Conta corrente', tipo: 'corrente' as const, saldo: 480_000 },
    { nome: 'Poupança', tipo: 'poupanca' as const, saldo: 1_200_000 },
    { nome: 'Carteira', tipo: 'dinheiro' as const, saldo: 25_000 },
  ];
  const contaIds = contasNovas.map(() => '');
  const linhasContas = contasNovas.map((c, i) => {
    const id = novoId(Date.parse(`${inicio}T12:00:00Z`) + i);
    contaIds[i] = id;
    return {
      id,
      nome: c.nome,
      tipo: c.tipo,
      saldoCentavos: c.saldo,
      ativa: true,
      ordem: i,
      criadoEm: carimbo(inicio),
      atualizadoEm: carimbo(inicio),
    };
  });

  // Saldo mensal: passeio aleatório, uma linha de histórico por conta e por mês.
  const linhasSaldos: (typeof saldosHistorico.$inferInsert)[] = [];
  const saldoAtual = contasNovas.map((c) => c.saldo);
  for (const mes of meses) {
    const dia = primeiroDiaDoMes(mes);
    contasNovas.forEach((_, i) => {
      saldoAtual[i] = Math.max(0, saldoAtual[i]! + rng.inteiro(-60_000, 75_000));
      linhasSaldos.push({
        id: novoId(Date.parse(`${dia}T12:00:00Z`) + i),
        contaId: contaIds[i]!,
        saldoCentavos: saldoAtual[i]!,
        registradoEm: `${dia}T12:00:00.000Z`,
      });
    });
  }
  linhasContas.forEach((c, i) => {
    c.saldoCentavos = saldoAtual[i]!;
  });

  const linhasCategorias = CATEGORIAS_PADRAO.map((nome, i) => ({
    id: novoId(Date.parse(`${inicio}T12:00:00Z`) + 100 + i),
    nome,
    cor: corPorPosicao(i),
    ordem: i,
    arquivada: false,
    criadoEm: carimbo(inicio),
    atualizadoEm: carimbo(inicio),
  }));
  const idCategoria = (nome: string): string => linhasCategorias.find((c) => c.nome === nome)!.id;
  const nomesCategorias = CATEGORIAS_PADRAO as readonly string[];

  // Três cartões: o terceiro está arquivado (some dos formulários, mas o histórico fica).
  const cartoesNovos = [
    { nome: 'Cartão principal', limite: 1_500_000, fechamento: 3, vencimento: 10, ativo: true },
    { nome: 'Cartão viagem', limite: 800_000, fechamento: 25, vencimento: 5, ativo: true },
    { nome: 'Cartão antigo', limite: 500_000, fechamento: 8, vencimento: 15, ativo: false },
  ];
  const linhasCartoes = cartoesNovos.map((c, i) => ({
    id: novoId(Date.parse(`${inicio}T12:00:00Z`) + 200 + i),
    nome: c.nome,
    limiteCentavos: c.limite,
    diaFechamento: c.fechamento,
    diaVencimento: c.vencimento,
    ativo: c.ativo,
    criadoEm: carimbo(inicio),
    atualizadoEm: carimbo(inicio),
  }));
  const cicloDoCartao = (i: number): CicloCartao => ({
    diaFechamento: cartoesNovos[i]!.fechamento,
    diaVencimento: cartoesNovos[i]!.vencimento,
  });
  // Cartão arquivado só recebe compras nos primeiros 5 anos.
  const mesLimiteArquivado = somarMeses(meses[0]!, 59);

  const recorrentesNovas = [
    {
      descricao: 'Salário',
      categoria: 'Salário',
      valor: 850_000,
      dia: 5,
      conta: 0,
      observacao: 'Pagamento mensal',
    },
    {
      descricao: 'Rendimento da poupança',
      categoria: 'Rendimentos',
      valor: 45_000,
      dia: 10,
      conta: 1,
      observacao: null,
    },
  ];
  const linhasRecorrentes = recorrentesNovas.map((r, i) => ({
    id: novoId(Date.parse(`${inicio}T12:00:00Z`) + 300 + i),
    descricao: r.descricao,
    categoria: r.categoria,
    valorCentavos: r.valor,
    diaDoMes: r.dia,
    inicio: diaNoMes(meses[0]!, r.dia),
    fim: null,
    contaId: contaIds[r.conta]!,
    ativa: true,
    observacao: r.observacao,
    criadoEm: carimbo(inicio),
    atualizadoEm: carimbo(inicio),
  }));

  // ------------------------------------------------------------ gastos, faturas e parcelas

  const linhasCompras: (typeof compras.$inferInsert)[] = [];
  const linhasParcelas: (typeof parcelas.$inferInsert)[] = [];
  const linhasFaturas: (typeof faturas.$inferInsert)[] = [];
  const faturaPorChave = new Map<string, typeof faturas.$inferInsert>();
  const totalDaFatura = new Map<string, number>();

  meses.forEach((mes, indiceMes) => {
    const ultimoMes = indiceMes === meses.length - 1;
    const diasDisponiveis = (m: Mes) => (ultimoMes && m === mesFim ? diaFim : diasNoMes(m));

    // Gastos à vista: 36 a 44 por mês, a maioria pequenos.
    const avista = rng.inteiro(36, 44);
    for (let k = 0; k < avista; k++) {
      const dia = diaNoMes(mes, rng.inteiro(1, diasDisponiveis(mes)));
      const valor = rng.real() < 0.03 ? rng.inteiro(100_000, 400_000) : rng.inteiro(1_500, 35_000);
      const id = novoId(Date.parse(`${dia}T12:00:00Z`) + k);
      const categoria = rng.escolha(nomesCategorias);
      linhasCompras.push({
        id,
        descricao: rng.real() < 0.7 ? rng.escolha(DESCRICOES_AVISTA) : null,
        categoriaId: idCategoria(categoria),
        dataCompra: dia,
        valorTotalCentavos: valor,
        meio: 'conta',
        contaId: rng.real() < 0.6 ? rng.escolha(contaIds) : null,
        cartaoId: null,
        numParcelas: 1,
        observacao: null,
        criadoEm: carimbo(dia),
        atualizadoEm: carimbo(dia),
      });
      linhasParcelas.push({
        id: novoId(Date.parse(`${dia}T12:00:00Z`) + k + 1),
        compraId: id,
        numero: 1,
        valorCentavos: valor,
        mesCompetencia: mes,
        faturaId: null,
      });
    }

    // Compras no cartão: 10 a 14 por mês, de 1 a 12 parcelas.
    const noCartao = rng.inteiro(10, 14);
    for (let k = 0; k < noCartao; k++) {
      const dia = diaNoMes(mes, rng.inteiro(1, diasDisponiveis(mes)));
      const sorteado = rng.inteiro(0, 2);
      // O cartão arquivado (índice 2) não recebe compras depois do limite.
      const cartaoIdx = sorteado === 2 && mes > mesLimiteArquivado ? 0 : sorteado;
      const cartao = linhasCartoes[cartaoIdx]!;
      const n = rng.escolha([1, 1, 2, 3, 3, 4, 5, 6, 8, 10, 12]);
      const valor = rng.inteiro(5_000, 450_000);
      const id = novoId(Date.parse(`${dia}T12:00:00Z`) + 500 + k);
      const categoria = rng.escolha(nomesCategorias);
      linhasCompras.push({
        id,
        descricao: rng.real() < 0.85 ? rng.escolha(DESCRICOES_CARTAO) : null,
        categoriaId: idCategoria(categoria),
        dataCompra: dia,
        valorTotalCentavos: valor,
        meio: 'cartao',
        contaId: null,
        cartaoId: cartao.id,
        numParcelas: n,
        observacao: null,
        criadoEm: carimbo(dia),
        atualizadoEm: carimbo(dia),
      });
      const valores = dividirEmParcelas(valor, n);
      valores.forEach((valorParcela: Centavos, i: number) => {
        // Mesma regra do serviço: a parcela i cai na fatura do mês de vencimento i-ésimo.
        const mesFatura = mesDaFatura(cicloDoCartao(cartaoIdx), dia, i);
        const chave = `${cartao.id}|${mesFatura}`;
        let fatura = faturaPorChave.get(chave);
        if (!fatura) {
          const ciclo = cicloDoCartao(cartaoIdx);
          fatura = {
            id: novoId(Date.parse(`${dia}T12:00:00Z`) + 700 + linhasFaturas.length),
            cartaoId: cartao.id,
            mesVencimento: mesFatura,
            dataFechamento: dataFechamento(ciclo, mesFatura),
            dataVencimento: dataVencimento(ciclo, mesFatura),
            pagaEm: null,
            valorPagoCentavos: null,
            criadoEm: carimbo(dia),
            atualizadoEm: carimbo(dia),
          };
          faturaPorChave.set(chave, fatura);
          linhasFaturas.push(fatura);
        }
        totalDaFatura.set(fatura.id!, (totalDaFatura.get(fatura.id!) ?? 0) + valorParcela);
        linhasParcelas.push({
          id: novoId(Date.parse(`${dia}T12:00:00Z`) + 900 + linhasParcelas.length),
          compraId: id,
          numero: i + 1,
          valorCentavos: valorParcela,
          mesCompetencia: somarMeses(mes, i),
          faturaId: fatura.id,
        });
      });
    }
  });

  // Faturas já vencidas nascem pagas (pelo valor total, no dia do vencimento). As do futuro ficam abertas.
  for (const f of linhasFaturas) {
    if (f.dataVencimento! < fim) {
      f.pagaEm = f.dataVencimento!;
      f.valorPagoCentavos = totalDaFatura.get(f.id!)!;
    }
  }

  // ------------------------------------------------------------ receitas

  const linhasReceitas: (typeof receitas.$inferInsert)[] = [];
  // Receitas geradas pelos modelos recorrentes: uma por mês, até a data final. Nos dois últimos
  // meses, a do rendimento fica PREVISTA (ainda não recebida): é o caso "a receber" da tela inicial.
  const recorrenteGerada = (
    rec: (typeof linhasRecorrentes)[number],
    mes: Mes,
    previsto: boolean,
  ) => {
    const data = diaNoMes(mes, rec.diaDoMes);
    if (data > fim || data < rec.inicio) return;
    linhasReceitas.push({
      id: novoId(Date.parse(`${data}T12:00:00Z`) + linhasReceitas.length),
      descricao: rec.descricao,
      categoria: rec.categoria,
      data,
      valorCentavos: rec.valorCentavos,
      contaId: rec.contaId,
      observacao: rec.observacao,
      confirmadaEm: previsto ? null : carimbo(data),
      recorrenteId: rec.id,
      criadoEm: carimbo(data),
      atualizadoEm: carimbo(data),
    });
  };

  meses.forEach((mes, indiceMes) => {
    const ultimosDois = indiceMes >= meses.length - 2;
    linhasRecorrentes.forEach((rec, i) => recorrenteGerada(rec, mes, ultimosDois && i === 1));

    // Extras à mão: 0 a 2 por mês.
    const extras = rng.inteiro(0, 2);
    for (let k = 0; k < extras; k++) {
      const data = diaNoMes(
        mes,
        rng.inteiro(
          1,
          indiceMes === meses.length - 1 ? Math.min(diaFim, diasNoMes(mes)) : diasNoMes(mes),
        ),
      );
      linhasReceitas.push({
        id: novoId(Date.parse(`${data}T12:00:00Z`) + 1000 + k),
        descricao: rng.escolha(DESCRICOES_RECEITA_EXTRA),
        categoria: rng.escolha(CATEGORIAS_RECEITA.filter((c) => c !== 'Salário')),
        data,
        valorCentavos: rng.inteiro(20_000, 300_000),
        contaId: rng.escolha(contaIds),
        observacao: null,
        confirmadaEm: carimbo(data),
        recorrenteId: null,
        criadoEm: carimbo(data),
        atualizadoEm: carimbo(data),
      });
    }
  });

  // ------------------------------------------------------------ bitcoin

  const diasTotal = diasEntre(inicio, fim);
  const linhasPrecos: (typeof btcPrecos.$inferInsert)[] = [];
  const precoDoDia = new Map<Dia, number>();
  let preco = 150_000 * 100; // R$ 1.500,00 por BTC, em centavos
  for (let k = 0; k < diasTotal; k++) {
    const dia = diaDeMs(Date.parse(`${inicio}T00:00:00Z`) + k * 86_400_000);
    // Tendência de alta com ruído diário (passeio aleatório), sempre positivo.
    preco = Math.max(100_000, Math.round(preco * (1 + (rng.real() - 0.47) * 0.035)));
    precoDoDia.set(dia, preco);
    linhasPrecos.push({ data: dia, precoCentavos: preco, origem: 'api' });
  }

  const linhasMovimentos: (typeof btcMovimentos.$inferInsert)[] = [];
  meses.forEach((mes) => {
    const dia = diaNoMes(mes, rng.inteiro(1, diasNoMes(mes)));
    if (dia > fim) return;
    const sats = rng.inteiro(5_000, 300_000);
    const precoCompra = precoDoDia.get(dia)!;
    linhasMovimentos.push({
      id: novoId(Date.parse(`${dia}T12:00:00Z`) + 1200 + linhasMovimentos.length),
      sats,
      valorCentavos: Math.round((sats * precoCompra) / SATS_POR_BTC),
      data: dia,
      nota: rng.real() < 0.3 ? 'Compra do mês' : null,
      criadoEm: carimbo(dia),
      atualizadoEm: carimbo(dia),
      removidoEm: null,
    });
  });

  // ------------------------------------------------------------ limites

  const linhasLimites: (typeof limitesMensais.$inferInsert)[] = [
    { mes: 'padrao', valorCentavos: 350_000 },
  ];
  for (const mes of meses) {
    if (rng.real() < 0.25) {
      linhasLimites.push({ mes, valorCentavos: rng.inteiro(300_000, 600_000) });
    }
  }

  // ------------------------------------------------------------ gravação

  // Lotes de até 400 linhas por INSERT (abaixo do limite de variáveis do SQLite).
  const TAMANHO_LOTE = 400;
  const lotes = <T>(linhas: T[]): T[][] => {
    const grupos: T[][] = [];
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
      grupos.push(linhas.slice(i, i + TAMANHO_LOTE));
    }
    return grupos;
  };

  // Ordem respeita as chaves estrangeiras: contas, categorias e cartões antes de compras etc.
  banco.db.transaction(
    (tx) => {
      for (const l of lotes(linhasContas)) tx.insert(contas).values(l).run();
      for (const l of lotes(linhasCategorias)) tx.insert(categorias).values(l).run();
      for (const l of lotes(linhasCartoes)) tx.insert(cartoes).values(l).run();
      for (const l of lotes(linhasFaturas)) tx.insert(faturas).values(l).run();
      for (const l of lotes(linhasRecorrentes)) tx.insert(receitasRecorrentes).values(l).run();
      for (const l of lotes(linhasCompras)) tx.insert(compras).values(l).run();
      for (const l of lotes(linhasParcelas)) tx.insert(parcelas).values(l).run();
      for (const l of lotes(linhasReceitas)) tx.insert(receitas).values(l).run();
      for (const l of lotes(linhasSaldos)) tx.insert(saldosHistorico).values(l).run();
      for (const l of lotes(linhasMovimentos)) tx.insert(btcMovimentos).values(l).run();
      for (const l of lotes(linhasPrecos)) tx.insert(btcPrecos).values(l).run();
      for (const l of lotes(linhasLimites)) tx.insert(limitesMensais).values(l).run();
    },
    { behavior: 'immediate' },
  );

  return {
    inicio,
    fim,
    meses: meses.length,
    contas: linhasContas.length,
    categorias: linhasCategorias.length,
    cartoes: linhasCartoes.length,
    faturas: linhasFaturas.length,
    comprasAVista: linhasCompras.filter((c) => c.meio === 'conta').length,
    comprasCartao: linhasCompras.filter((c) => c.meio === 'cartao').length,
    parcelas: linhasParcelas.length,
    receitas: linhasReceitas.length,
    receitasRecorrentes: linhasRecorrentes.length,
    saldos: linhasSaldos.length,
    movimentosBtc: linhasMovimentos.length,
    precosBtc: linhasPrecos.length,
    limites: linhasLimites.length,
  };
}

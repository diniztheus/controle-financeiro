/**
 * pnpm desempenho --saida <pasta>
 *
 * Gera (ou reaproveita) um banco de 10 anos na pasta de saída e cronometra as operações que as
 * telas usam: mediana de 5 execuções de cada uma. Também mostra o plano de consulta
 * (EXPLAIN QUERY PLAN) das consultas-chave e o tamanho do banco e do backup.
 * Nunca mexe no banco real: a pasta de saída não pode estar dentro da pasta de dados do usuário.
 */
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { lerConfig, pastaDadosPadrao, resolverCaminho } from '../src/lib/server/config.ts';
import { fazerBackup } from '../src/lib/server/db/backup.ts';
import { iniciarBanco } from '../src/lib/server/db/index.ts';
import { gerarDadosDeTeste } from '../src/lib/server/importacao/dadosDeTeste.ts';
import { verificarIntegridade } from '../src/lib/server/servicos/integridade.ts';
import { lancamentosDoMes } from '../src/lib/server/servicos/gastos.ts';
import { montarPainel } from '../src/lib/server/servicos/painel.ts';
import { aPagarCartoes, listarCartoes, obterFatura } from '../src/lib/server/servicos/cartoes.ts';
import {
  buscarReceitas,
  exportar,
  evolucaoPatrimonioMensal,
  fluxoDeCaixa,
  buscarLancamentos,
  relatorioCategorias,
} from '../src/lib/server/servicos/relatorios.ts';
import { gerarReceitasRecorrentes } from '../src/lib/server/servicos/recorrentes.ts';
import { painelBitcoin } from '../src/lib/server/servicos/bitcoin.ts';
import { hoje, mesAtual, somarMeses } from '../src/lib/dominio/datas.ts';

const VEZES = 5;
/** Acima disso a operação já pesa na tela: marcada no relatório. */
const ALERTA_MS = 150;

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  if (i < 0) return undefined;
  const valor = process.argv[i + 1];
  if (!valor || valor.startsWith('--')) {
    console.error(`Falta o valor de ${nome}.`);
    process.exit(1);
  }
  return valor;
}

function estaDentro(caminho: string, pasta: string): boolean {
  const c = resolve(caminho);
  const p = resolve(pasta);
  return c === p || c.startsWith(p + sep);
}

const saida = argumento('--saida');
if (!saida) {
  console.error('Use: pnpm desempenho --saida <pasta>');
  console.error('A pasta é de teste (ex.: /tmp/cf-desempenho). Nunca a pasta de dados real.');
  process.exit(1);
}
const pastaSaida = resolverCaminho(saida);
const dadosReais = lerConfig().dadosDir;
for (const real of [dadosReais, pastaDadosPadrao()]) {
  if (estaDentro(pastaSaida, real)) {
    console.error(`Recusado: ${pastaSaida} fica dentro da pasta de dados real (${real}).`);
    process.exit(1);
  }
}

const cfg = lerConfig({
  dadosDir: pastaSaida,
  bancoArquivo: join(pastaSaida, 'financas.db'),
  backupsDir: join(pastaSaida, 'backups'),
});
const banco = iniciarBanco(cfg);

interface Medida {
  nome: string;
  mediana: number;
  minimo: number;
  maximo: number;
  obs: string;
}

/** Roda a operação VEZES vezes e devolve a mediana, o menor e o maior tempo (ms). */
function medir(nome: string, operacao: () => unknown, obs = ''): Medida {
  const tempos: number[] = [];
  for (let i = 0; i < VEZES; i++) {
    const t0 = performance.now();
    operacao();
    tempos.push(performance.now() - t0);
  }
  tempos.sort((a, b) => a - b);
  return {
    nome,
    mediana: tempos[Math.floor(VEZES / 2)]!,
    minimo: tempos[0]!,
    maximo: tempos[VEZES - 1]!,
    obs,
  };
}

const agora = new Date();
const dia = hoje(agora);
const mes = mesAtual(agora);
const de120 = somarMeses(mes, -119);

try {
  const { n } = banco.sqlite.prepare('SELECT COUNT(*) AS n FROM contas').get() as { n: number };
  if (n === 0) {
    const t0 = performance.now();
    const r = gerarDadosDeTeste(banco, { anos: 10, fim: dia });
    console.log(
      `Banco de teste gerado: ${r.meses} meses, ${r.comprasAVista + r.comprasCartao} compras, ${r.parcelas} parcelas, ${r.receitas} receitas (${Math.round(performance.now() - t0)} ms).`,
    );
  } else {
    console.log('Banco de teste já existe nesta pasta: reaproveitado.');
  }

  const cartaoPrincipal = listarCartoes(banco, { incluirArquivados: true }).find(
    (c) => c.nome === 'Cartão principal',
  );
  if (!cartaoPrincipal) throw new Error('Cartão principal não encontrado no banco de teste.');

  const medidas: Medida[] = [
    medir('montarPainel (mês atual)', () => montarPainel(banco, mes, dia)),
    medir('lancamentosDoMes (mês atual)', () => lancamentosDoMes(banco, mes)),
    medir('relatorioCategorias (60 meses)', () => relatorioCategorias(banco, 60, agora)),
    medir('evolucaoPatrimonioMensal (120 meses)', () =>
      evolucaoPatrimonioMensal(banco, 120, agora),
    ),
    medir('fluxoDeCaixa (60 meses)', () => fluxoDeCaixa(banco, 60, agora)),
    medir('buscarLancamentos (texto, 120 meses)', () =>
      buscarLancamentos(banco, { texto: 'padaria', deMes: de120, ateMes: mes }, agora),
    ),
    medir('buscarReceitas (120 meses)', () =>
      buscarReceitas(banco, { deMes: de120, ateMes: mes }, agora),
    ),
    medir('listarCartoes (com arquivados)', () =>
      listarCartoes(banco, { incluirArquivados: true }),
    ),
    medir('obterFatura (mês atual)', () => obterFatura(banco, cartaoPrincipal.id, mes, dia)),
    medir('aPagarCartoes', () => aPagarCartoes(banco)),
    medir('gerarReceitasRecorrentes (nada a gerar)', () =>
      gerarReceitasRecorrentes(banco, dia, agora),
    ),
    medir('exportar CSV (120 meses)', () =>
      exportar(banco, { de: de120, ate: mes, formato: 'csv' }),
    ),
    medir('painelBitcoin', () => painelBitcoin(banco)),
    medir('verificarIntegridade', () => verificarIntegridade(banco)),
  ];

  const pastaBackupMedicao = join(pastaSaida, 'medicao-backup');
  mkdirSync(pastaBackupMedicao, { recursive: true });
  let arquivoBackup = '';
  medidas.push(
    medir('fazerBackup (VACUUM INTO)', () => {
      arquivoBackup = fazerBackup(banco.sqlite, pastaBackupMedicao);
    }),
  );
  const bytesBackup = arquivoBackup ? statSync(arquivoBackup).size : 0;
  rmSync(pastaBackupMedicao, { recursive: true, force: true });

  const bytesBanco = statSync(cfg.bancoArquivo).size;

  console.log('');
  console.log(
    `Operação`.padEnd(42) + 'mediana'.padStart(10) + 'mín'.padStart(10) + 'máx'.padStart(10),
  );
  console.log('-'.repeat(72));
  for (const m of medidas) {
    const marca = m.mediana > ALERTA_MS ? '  <- acima de ' + ALERTA_MS + ' ms' : '';
    console.log(
      m.nome.padEnd(42) +
        `${m.mediana.toFixed(1)} ms`.padStart(10) +
        `${m.minimo.toFixed(1)}`.padStart(10) +
        `${m.maximo.toFixed(1)}`.padStart(10) +
        marca,
    );
  }
  console.log('');
  console.log(
    `Banco: ${(bytesBanco / 1024).toFixed(0)} KB, backup: ${(bytesBackup / 1024).toFixed(0)} KB`,
  );

  // Planos das consultas-chave: uso de índice ou varredura completa da tabela.
  const planos: [string, string, unknown[]][] = [
    [
      'parcelas do mês (lançamentos)',
      'SELECT p.id FROM parcelas p INNER JOIN compras c ON c.id = p.compra_id WHERE p.mes_competencia = ? AND c.removido_em IS NULL',
      [mes],
    ],
    [
      'receitas do mês',
      'SELECT id FROM receitas WHERE removido_em IS NULL AND data >= ? AND data <= ?',
      [`${mes}-01`, `${mes}-31`],
    ],
    ['parcelas por fatura', 'SELECT id FROM parcelas WHERE fatura_id = ?', ['x']],
    [
      'fatura por cartão e mês',
      'SELECT id FROM faturas WHERE cartao_id = ? AND mes_vencimento = ?',
      ['x', mes],
    ],
    [
      'parcelas em aberto de um cartão',
      'SELECT p.valor_centavos FROM parcelas p INNER JOIN compras c ON c.id = p.compra_id INNER JOIN faturas f ON f.id = p.fatura_id WHERE c.cartao_id = ? AND f.paga_em IS NULL',
      ['x'],
    ],
    [
      'compras por data',
      'SELECT id FROM compras WHERE data_compra >= ? AND data_compra <= ?',
      [`${mes}-01`, `${mes}-31`],
    ],
  ];
  console.log('');
  console.log('Planos (EXPLAIN QUERY PLAN):');
  for (const [nome, sql, params] of planos) {
    const linhas = banco.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as {
      detail: string;
    }[];
    console.log(`- ${nome}:`);
    for (const l of linhas) console.log(`    ${l.detail}`);
  }
} finally {
  banco.sqlite.close();
}

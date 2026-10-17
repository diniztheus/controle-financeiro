/**
 * pnpm dados-teste --saida <pasta> [--anos 10] [--fim AAAA-MM-DD]
 *
 * Gera um banco de teste com anos de histórico (ver src/lib/server/importacao/dadosDeTeste.ts).
 * A pasta de saída é obrigatória e nunca pode ser a pasta de dados do usuário: o banco real
 * (~/ControleFinanceiro/dados, ou DADOS_DIR do .env) é recusado. Se a pasta já tem um banco com
 * dados, ele é reaproveitado sem mudanças.
 */
import { statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { lerConfig, pastaDadosPadrao, resolverCaminho } from '../src/lib/server/config.ts';
import { iniciarBanco } from '../src/lib/server/db/index.ts';
import { gerarDadosDeTeste } from '../src/lib/server/importacao/dadosDeTeste.ts';

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

/** Diz se `caminho` é `pasta` ou está dentro dela. */
function estaDentro(caminho: string, pasta: string): boolean {
  const c = resolve(caminho);
  const p = resolve(pasta);
  return c === p || c.startsWith(p + sep);
}

const saida = argumento('--saida');
if (!saida) {
  console.error('Use: pnpm dados-teste --saida <pasta>');
  console.error(
    'A pasta é um lugar de teste (ex.: /tmp/cf-desempenho). Nunca a pasta de dados real.',
  );
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

const anos = argumento('--anos');
const fim = argumento('--fim');

const cfg = lerConfig({
  dadosDir: pastaSaida,
  bancoArquivo: join(pastaSaida, 'financas.db'),
  backupsDir: join(pastaSaida, 'backups'),
});

const inicio = performance.now();
const banco = iniciarBanco(cfg);
try {
  const { n } = banco.sqlite.prepare('SELECT COUNT(*) AS n FROM contas').get() as { n: number };
  if (n > 0) {
    console.log(`Banco já com dados em ${cfg.bancoArquivo}: reaproveitado sem mudanças.`);
  } else {
    const r = gerarDadosDeTeste(banco, {
      anos: anos === undefined ? undefined : Number(anos),
      fim,
    });
    console.log(`Dados de teste gerados de ${r.inicio} a ${r.fim} (${r.meses} meses):`);
    console.log(
      `  contas: ${r.contas}, cartões: ${r.cartoes} (com arquivado), categorias: ${r.categorias}`,
    );
    console.log(`  compras à vista: ${r.comprasAVista}, compras no cartão: ${r.comprasCartao}`);
    console.log(`  parcelas: ${r.parcelas}, faturas: ${r.faturas}, saldos: ${r.saldos}`);
    console.log(`  receitas: ${r.receitas}, recorrentes: ${r.receitasRecorrentes}`);
    console.log(`  bitcoin: ${r.movimentosBtc} movimentos, ${r.precosBtc} preços diários`);
    console.log(`  limites: ${r.limites}`);
  }
} finally {
  banco.sqlite.close();
}

const kb = Math.round(statSync(cfg.bancoArquivo).size / 1024);
console.log(
  `Banco: ${cfg.bancoArquivo} (${kb} KB) em ${Math.round(performance.now() - inicio)} ms`,
);
console.log('Este banco é de teste. O seu continua intacto em ' + dadosReais + '.');

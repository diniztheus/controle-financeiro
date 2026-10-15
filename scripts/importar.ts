/**
 * pnpm importar <arquivo.json> [--simular] [--aceitar-diferencas]
 *
 * Traz os dados do app atual (Artifact) para o banco local, numa transação única.
 * - Faz um backup do banco antes (dados/backups/).
 * - Só roda num banco sem contas, gastos, cartões e bitcoin: nunca duplica.
 * - `--simular` mostra o relatório sem gravar nada.
 * - Se os totais não baterem com as regras do app, nada é gravado (a menos que
 *   `--aceitar-diferencas` seja passado).
 * Pode rodar com o site aberto, mas recarregue a página depois.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatarBRL } from '../src/lib/dominio/dinheiro.ts';
import { carregarEnv, lerConfig } from '../src/lib/server/config.ts';
import { fazerBackup } from '../src/lib/server/db/backup.ts';
import { iniciarBanco } from '../src/lib/server/db/index.ts';
import { lerExportacao } from '../src/lib/server/importacao/formato.ts';
import {
  bancoSemDados,
  ErroImportacao,
  importarDoApp,
} from '../src/lib/server/importacao/importar.ts';

carregarEnv(resolve(dirname(fileURLToPath(import.meta.url)), '..'));

const args = process.argv.slice(2);
const simular = args.includes('--simular');
const aceitarDiferencas = args.includes('--aceitar-diferencas');
const arquivo = args.find((a) => !a.startsWith('--'));
if (!arquivo) {
  console.error('Uso: pnpm importar <arquivo.json> [--simular] [--aceitar-diferencas]');
  process.exit(2);
}
const caminho = resolve(process.env.INIT_CWD ?? process.cwd(), arquivo);
if (!existsSync(caminho)) {
  console.error(`Arquivo não encontrado: ${caminho}`);
  process.exit(2);
}

let dados;
try {
  dados = lerExportacao(JSON.parse(readFileSync(caminho, 'utf8')));
} catch (e) {
  console.error(
    e instanceof SyntaxError
      ? `O arquivo não é um JSON válido: ${e.message}`
      : String((e as Error).message),
  );
  process.exit(1);
}

const banco = iniciarBanco(lerConfig());
try {
  // Confere antes do backup: um banco com dados é recusado sem gerar cópia à toa.
  if (!bancoSemDados(banco)) importarDoApp(banco, dados);
  if (!simular) {
    const b = fazerBackup(banco.sqlite, banco.config.backupsDir);
    console.log(`Backup antes de importar: ${b}`);
  }
  const r = importarDoApp(banco, dados, { simular, aceitarDiferencas });
  const i = r.importados;
  const linha = (rotulo: string, n: number | string) =>
    console.log(`  ${rotulo.padEnd(28, ' ')}${n}`);
  console.log('');
  console.log(
    simular ? 'SIMULAÇÃO (nada foi gravado)' : `Importado em ${banco.config.bancoArquivo}`,
  );
  console.log('');
  linha('Contas', i.contas);
  linha('Categorias novas', i.categorias);
  linha('  arquivadas (só em gastos)', i.categoriasArquivadas);
  linha('  padrão do site arquivadas', i.categoriasDoSiteArquivadas);
  linha('Cartões', i.cartoes);
  if (i.cartoesRemovidos) linha('  removidos no app (lixeira)', i.cartoesRemovidos);
  linha('Gastos', i.gastos);
  linha('  no cartão', i.gastosNoCartao);
  linha('Parcelas', i.parcelas);
  linha('Faturas', i.faturas);
  linha('  pagas', i.faturasPagas);
  linha('Movimentos de bitcoin', i.movimentosBitcoin);
  linha('Preços do bitcoin', i.precosBitcoin);
  linha('Limite do mês', i.limite === null ? 'sem limite' : formatarBRL(i.limite));
  console.log('');
  const c = r.conferencia;
  console.log('Conferência com as regras do app atual:');
  linha(
    'Saldo das contas',
    `${formatarBRL(c.saldoContas.noBanco)} (app: ${formatarBRL(c.saldoContas.noApp)})`,
  );
  linha('Meses com gastos conferidos', c.meses);
  linha('Faturas conferidas', c.faturas);
  linha(
    'Sats',
    `${c.sats.noBanco.toLocaleString('pt-BR')} (app: ${c.sats.noApp.toLocaleString('pt-BR')})`,
  );
  if (c.diferencas.length) {
    console.log('');
    console.log(`ATENÇÃO: ${c.diferencas.length} diferença(s):`);
    for (const d of c.diferencas) {
      console.log(`  ${d.item}: app ${formatarBRL(d.noApp)} × banco ${formatarBRL(d.noBanco)}`);
    }
  } else {
    console.log('  Tudo bate.');
  }
  if (r.avisos.length) {
    console.log('');
    console.log('Avisos:');
    for (const a of r.avisos) console.log(`  - ${a}`);
  }
  process.exitCode = c.diferencas.length ? 3 : 0;
} catch (e) {
  console.error(e instanceof ErroImportacao ? e.message : e);
  process.exitCode = 1;
} finally {
  banco.sqlite.close();
}

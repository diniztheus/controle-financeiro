/**
 * pnpm restaurar                 → lista os backups (nome, data, tamanho, tipo)
 * pnpm restaurar <nome.db>       → restaura esse backup, depois de confirmar digitando "restaurar"
 *
 * Pare o site antes (Ctrl+C no terminal onde ele roda). O banco atual é guardado antes como
 * "Antes de restaurar", então nada se perde de vez.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { carregarEnv, lerConfig } from '../src/lib/server/config.ts';
import { listarBackups, nomeBackupValido, tipoDoBackup } from '../src/lib/server/db/backup.ts';
import { restaurarDoDisco } from '../src/lib/server/servicos/backups.ts';
import { ErroDeNegocio } from '../src/lib/server/servicos/erros.ts';

carregarEnv();
const cfg = lerConfig();
const nome = process.argv[2];

const ROTULO_TIPO = {
  automatico: 'Automático',
  manual: 'Manual',
  'antes-de-restaurar': 'Antes de restaurar',
} as const;

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function listar(): void {
  const backups = listarBackups(cfg.backupsDir);
  console.log(`Backups em ${cfg.backupsDir}`);
  if (backups.length === 0) {
    console.log('  Nenhum backup encontrado.');
  } else {
    for (const b of backups) {
      const data = b.criadoEm.toLocaleString('pt-BR');
      const tipo = ROTULO_TIPO[tipoDoBackup(b.nome)];
      console.log(`  ${b.nome}  ${data}  ${tamanho(b.bytes)}  ${tipo}`);
    }
  }
  console.log('');
  console.log('Para restaurar um deles, pare o site e rode:');
  console.log('  pnpm restaurar <nome do arquivo>');
}

async function restaurar(arquivo: string): Promise<number> {
  if (!nomeBackupValido(arquivo)) {
    console.error(
      'Nome de backup inválido. Use só o nome do arquivo, como aparece em pnpm restaurar.',
    );
    return 1;
  }
  console.log(`Vai substituir o banco atual pelo backup ${arquivo}.`);
  console.log('Antes, o banco atual é guardado como "Antes de restaurar".');
  console.log('Confirme que o site está parado (Ctrl+C no terminal onde ele roda).');
  const rl = createInterface({ input: stdin, output: stdout });
  let resposta: string;
  try {
    // Entrada fechada (ex.: `</dev/null`): `question` nunca responderia; trata como cancelamento.
    resposta = await new Promise<string>((resolver) => {
      rl.once('close', () => resolver(''));
      void rl.question('Digite "restaurar" para continuar: ').then(resolver);
    });
  } finally {
    rl.close();
  }
  if (resposta.trim() !== 'restaurar') {
    console.log('Cancelado. Nada foi alterado.');
    return 1;
  }
  try {
    const r = restaurarDoDisco(cfg, arquivo);
    console.log(`Banco restaurado a partir de ${arquivo}.`);
    if (r.antesDeRestaurar) console.log(`Cópia do banco anterior: ${r.antesDeRestaurar}`);
    console.log('Ao iniciar o site de novo, as migrations pendentes são aplicadas sozinhas.');
    return 0;
  } catch (e) {
    if (e instanceof ErroDeNegocio) {
      console.error(`Não foi possível restaurar: ${e.message}`);
    } else {
      console.error('Não foi possível restaurar. Veja o erro abaixo.');
      console.error(e);
    }
    return 1;
  }
}

if (!nome) {
  listar();
  process.exitCode = 0;
} else {
  process.exitCode = await restaurar(nome);
}

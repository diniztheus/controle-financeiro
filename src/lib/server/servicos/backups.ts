/**
 * Backups: automático diário com rotação, lista, exclusão e restauração.
 *
 * Restaurar troca o arquivo do banco. Antes, guarda uma cópia do banco atual como
 * "antes de restaurar", e se algo falhar no meio desfaz com essa cópia. Quem chama precisa
 * garantir que nenhum processo está usando o banco (o site fecha o seu; o script pede para parar o site).
 */
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Config } from '../config.ts';
import {
  fazerBackup,
  listarBackups,
  nomeBackup,
  nomeBackupValido,
  rotacionarAutomaticos,
  tipoDoBackup,
  verificarArquivoBackup,
  type TipoBackup,
} from '../db/backup.ts';
import { abrirBanco, type Banco, type BancoDrizzle } from '../db/conexao.ts';
import { config } from '../db/esquema.ts';
import { fecharBanco, obterBanco, type BancoIniciado } from '../db/index.ts';
import { ErroDeNegocio, naoEncontrado } from './erros.ts';
import { verificarIntegridade } from './integridade.ts';

const CHAVE = 'backup_auto';
const IMEDIATA = { behavior: 'immediate' } as const;
const MANTER_PADRAO = 30;
const MANTER_MAXIMO = 365;

export interface ConfigBackup {
  ativo: boolean;
  /** Quantos backups automáticos guardar (os mais novos). */
  manter: number;
  /** ISO do último automático criado com sucesso. */
  ultimoAutomatico: string | null;
  /** Mensagem da última falha do automático; `null` quando a última tentativa deu certo. */
  ultimaFalha: string | null;
}

export interface ResultadoAutomatico {
  feito: boolean;
  arquivo?: string;
  removidos: string[];
}

export interface BackupDetalhado {
  nome: string;
  bytes: number;
  criadoEm: Date;
  tipo: TipoBackup;
}

/** Data local `AAAA-MM-DD`. */
function dataLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Leitor = Pick<BancoDrizzle, 'select'>;
type Escritor = Pick<BancoDrizzle, 'insert'>;

function lerDoBanco(db: Leitor): ConfigBackup {
  const linha = db.select().from(config).where(eq(config.chave, CHAVE)).get();
  const v = (linha?.valor ?? {}) as Record<string, unknown>;
  const manter = v.manter;
  return {
    ativo: typeof v.ativo === 'boolean' ? v.ativo : true,
    manter:
      typeof manter === 'number' &&
      Number.isInteger(manter) &&
      manter >= 1 &&
      manter <= MANTER_MAXIMO
        ? manter
        : MANTER_PADRAO,
    ultimoAutomatico: typeof v.ultimoAutomatico === 'string' ? v.ultimoAutomatico : null,
    ultimaFalha: typeof v.ultimaFalha === 'string' ? v.ultimaFalha : null,
  };
}

function gravar(db: Escritor, c: ConfigBackup): void {
  db.insert(config)
    .values({ chave: CHAVE, valor: c })
    .onConflictDoUpdate({ target: config.chave, set: { valor: c } })
    .run();
}

export function lerConfigBackup(banco: Banco): ConfigBackup {
  return lerDoBanco(banco.db);
}

/** Liga/desliga o automático e define quantos guardar. Preserva os campos de andamento. */
export function salvarConfigBackup(
  banco: Banco,
  entrada: { ativo: boolean; manter: number },
): ConfigBackup {
  if (typeof entrada.ativo !== 'boolean') {
    throw new ErroDeNegocio('Informe se o backup automático fica ligado.', 'ativo');
  }
  if (!Number.isInteger(entrada.manter) || entrada.manter < 1 || entrada.manter > MANTER_MAXIMO) {
    throw new ErroDeNegocio(`Informe quantos backups manter, de 1 a ${MANTER_MAXIMO}.`, 'manter');
  }
  return banco.db.transaction((tx) => {
    const atual = lerDoBanco(tx);
    const nova = { ...atual, ativo: entrada.ativo, manter: entrada.manter };
    gravar(tx, nova);
    return nova;
  }, IMEDIATA);
}

/**
 * Cria o backup automático do dia, se ainda não há um com a data de hoje, e aplica a rotação.
 * Nunca lança: uma falha vira `ultimaFalha` na configuração (e o site segue normal).
 */
export function backupAutomaticoSeNecessario(
  banco: BancoIniciado,
  agora: Date = new Date(),
): ResultadoAutomatico {
  const semBackup: ResultadoAutomatico = { feito: false, removidos: [] };
  try {
    const cfg = lerConfigBackup(banco);
    if (!cfg.ativo) return semBackup;
    const pasta = banco.config.backupsDir;
    const prefixoHoje = `financas-auto-${dataLocal(agora)}-`;
    if (listarBackups(pasta).some((b) => b.nome.startsWith(prefixoHoje))) return semBackup;

    const arquivo = fazerBackup(banco.sqlite, pasta, agora, 'auto');
    const removidos = rotacionarAutomaticos(pasta, cfg.manter);
    banco.db.transaction((tx) => {
      gravar(tx, { ...lerDoBanco(tx), ultimoAutomatico: agora.toISOString(), ultimaFalha: null });
    }, IMEDIATA);
    return { feito: true, arquivo: basename(arquivo), removidos };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    try {
      banco.db.transaction((tx) => {
        gravar(tx, { ...lerDoBanco(tx), ultimaFalha: mensagem });
      }, IMEDIATA);
    } catch {
      // Se nem a configuração grava, não há o que fazer além de seguir.
    }
    return semBackup;
  }
}

/** Backups da pasta, do mais novo para o mais antigo, com o tipo de cada um. */
export function listarBackupsDetalhados(banco: BancoIniciado): BackupDetalhado[] {
  const chaveData = (nome: string) => /(\d{4}-\d{2}-\d{2}-\d{6})/.exec(nome)?.[1] ?? '';
  return listarBackups(banco.config.backupsDir)
    .filter((b) => nomeBackupValido(b.nome))
    .map((b) => ({
      nome: b.nome,
      bytes: b.bytes,
      criadoEm: b.criadoEm,
      tipo: tipoDoBackup(b.nome),
    }))
    .sort(
      (a, b) => chaveData(b.nome).localeCompare(chaveData(a.nome)) || b.nome.localeCompare(a.nome),
    );
}

/** Apaga um backup da pasta de backups. O nome é validado antes de montar o caminho. */
export function excluirBackup(banco: BancoIniciado, nome: string): void {
  if (!nomeBackupValido(nome)) throw new ErroDeNegocio('Este backup não é válido.');
  const pasta = banco.config.backupsDir;
  const arquivo = join(pasta, nome);
  if (dirname(arquivo) !== pasta || !existsSync(arquivo) || !statSync(arquivo).isFile()) {
    throw naoEncontrado('Este backup não existe mais');
  }
  unlinkSync(arquivo);
}

/** Quando o automático roda de novo: hoje (ainda não rodou hoje), amanhã (já rodou) ou desligado. */
export function proximoBackupAutomatico(
  cfg: ConfigBackup,
  agora: Date = new Date(),
): 'hoje' | 'amanhã' | 'desligado' {
  if (!cfg.ativo) return 'desligado';
  if (cfg.ultimoAutomatico && dataLocal(new Date(cfg.ultimoAutomatico)) === dataLocal(agora)) {
    return 'amanhã';
  }
  return 'hoje';
}

/** Cópia do banco atual como "antes de restaurar". `null` se ainda não há banco. */
function copiaDeSeguranca(cfg: Config, agora: Date): string | null {
  if (!existsSync(cfg.bancoArquivo)) return null;
  mkdirSync(cfg.backupsDir, { recursive: true });
  try {
    const atual = abrirBanco(cfg.bancoArquivo);
    try {
      return fazerBackup(atual.sqlite, cfg.backupsDir, agora, 'antes-de-restaurar');
    } finally {
      atual.sqlite.close();
    }
  } catch {
    // O banco atual não abre: guarda os arquivos como estão, para não perder nada.
    const base = nomeBackup(agora, 'antes-de-restaurar').replace(/\.db$/, '') + '-corrompido';
    let destino = join(cfg.backupsDir, `${base}.db`);
    for (let i = 2; existsSync(destino); i++) destino = join(cfg.backupsDir, `${base}-${i}.db`);
    for (const sufixo of ['', '-wal', '-shm']) {
      if (existsSync(cfg.bancoArquivo + sufixo)) {
        copyFileSync(cfg.bancoArquivo + sufixo, destino + sufixo);
      }
    }
    return destino;
  }
}

/**
 * Põe `origem` no lugar do banco: copia para um temporário na mesma pasta, apaga -wal e -shm,
 * e renomeia por cima. Se algo falhar, recoloca `desfazerCom` (a cópia de segurança).
 */
export function trocarBanco(cfg: Config, origem: string, desfazerCom: string | null): void {
  const alvo = cfg.bancoArquivo;
  const tmp = join(dirname(alvo), `.restauracao-${randomUUID()}.tmp`);
  try {
    copyFileSync(origem, tmp);
    rmSync(`${alvo}-wal`, { force: true });
    rmSync(`${alvo}-shm`, { force: true });
    renameSync(tmp, alvo);
  } catch (e) {
    rmSync(tmp, { force: true });
    if (desfazerCom) {
      try {
        const tmp2 = join(dirname(alvo), `.desfazer-${randomUUID()}.tmp`);
        copyFileSync(desfazerCom, tmp2);
        renameSync(tmp2, alvo);
        if (existsSync(`${desfazerCom}-wal`)) copyFileSync(`${desfazerCom}-wal`, `${alvo}-wal`);
      } catch {
        throw new ErroDeNegocio(
          `A restauração falhou e o banco não pôde ser recuperado automaticamente. A cópia de segurança está em ${desfazerCom}.`,
        );
      }
    }
    throw e;
  }
}

/**
 * Restaura um backup no arquivo do banco. Sem singleton: serve ao script e ao site.
 * Quem chama deve ter fechado o banco antes. Devolve o nome da cópia de segurança do banco anterior.
 */
export function restaurarDoDisco(
  cfg: Config,
  nome: string,
  agora: Date = new Date(),
): { antesDeRestaurar: string } {
  if (!nomeBackupValido(nome)) throw new ErroDeNegocio('Este backup não é válido.');
  const origem = join(cfg.backupsDir, nome);
  if (!existsSync(origem) || !statSync(origem).isFile()) {
    throw naoEncontrado('Este backup não existe mais');
  }
  const verificacao = verificarArquivoBackup(origem, cfg.migrationsDir);
  if (!verificacao.ok) {
    throw new ErroDeNegocio(
      `Este backup não pode ser restaurado: ${verificacao.erros.join('; ')}.`,
    );
  }
  const copia = copiaDeSeguranca(cfg, agora);
  trocarBanco(cfg, origem, copia);
  return { antesDeRestaurar: copia ? basename(copia) : '' };
}

/**
 * Restaura um backup no site: fecha o banco em uso, troca o arquivo, reabre (aplicando migrations
 * pendentes) e verifica a integridade. Se a reabertura falhar, volta ao banco anterior.
 */
export function restaurarBackup(nome: string): { antesDeRestaurar: string } {
  const cfg = obterBanco().config;
  fecharBanco();
  let resultado: { antesDeRestaurar: string };
  try {
    resultado = restaurarDoDisco(cfg, nome);
  } catch (e) {
    obterBanco();
    throw e;
  }
  try {
    verificarIntegridade(obterBanco());
  } catch (e) {
    if (!resultado.antesDeRestaurar) throw e;
    fecharBanco();
    trocarBanco(cfg, join(cfg.backupsDir, resultado.antesDeRestaurar), null);
    obterBanco();
    throw new ErroDeNegocio(
      'O backup não abriu depois da restauração. O banco anterior foi mantido.',
    );
  }
  return resultado;
}

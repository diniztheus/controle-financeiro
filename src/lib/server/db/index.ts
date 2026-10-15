/**
 * Banco do processo do servidor: aberto uma vez, com migrations aplicadas na abertura.
 */
import { existsSync } from 'node:fs';
import { garantirPastas, lerConfig, type Config } from '../config.ts';
import { abrirBanco, type Banco } from './conexao.ts';
import { migrar, type ResultadoMigracao } from './migrar.ts';

export interface BancoIniciado extends Banco {
  config: Config;
  /** O arquivo foi criado agora (não existia antes de iniciar). */
  criadoAgora: boolean;
  migracao: ResultadoMigracao;
  iniciadoEm: Date;
}

let atual: BancoIniciado | null = null;

/** Abre (criando pasta e arquivo se preciso) e aplica migrations pendentes. */
export function iniciarBanco(cfg: Config = lerConfig()): BancoIniciado {
  garantirPastas(cfg);
  const criadoAgora = !existsSync(cfg.bancoArquivo);
  const banco = abrirBanco(cfg.bancoArquivo);
  try {
    const migracao = migrar(banco, cfg.migrationsDir, cfg.backupsDir);
    return { ...banco, config: cfg, criadoAgora, migracao, iniciadoEm: new Date() };
  } catch (e) {
    banco.sqlite.close();
    throw e;
  }
}

/** Banco único do servidor. A primeira chamada inicia; as seguintes reaproveitam. */
export function obterBanco(): BancoIniciado {
  if (!atual) {
    atual = iniciarBanco();
    const b = atual;
    const r = b.migracao;
    console.log(`[banco] ${b.config.bancoArquivo}${b.criadoAgora ? ' (criado agora)' : ''}`);
    if (r.backup) console.log(`[banco] backup antes da migration: ${r.backup}`);
    if (r.aplicadas.length) console.log(`[banco] migrations aplicadas: ${r.aplicadas.join(', ')}`);
    process.once('exit', () => fecharBanco());
  }
  return atual;
}

export function fecharBanco(): void {
  if (atual?.sqlite.open) atual.sqlite.close();
  atual = null;
}

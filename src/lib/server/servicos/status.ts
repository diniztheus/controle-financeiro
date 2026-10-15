/**
 * Caso de uso "estado do sistema": junta o que a página inicial mostra.
 */
import { listarBackups, fazerBackup } from '../db/backup.ts';
import type { BancoIniciado } from '../db/index.ts';
import { migrationsAplicadas, migrationsDoProjeto } from '../db/migrar.ts';
import {
  contarLinhas,
  lerPragmas,
  ping,
  tamanhoArquivo,
  type InfoTabela,
} from '../repos/sistema.ts';
import { TABELAS } from '../db/esquema.ts';

export interface StatusSistema {
  ok: boolean;
  conectado: boolean;
  bancoArquivo: string;
  dadosDir: string;
  backupsDir: string;
  bytes: number;
  criadoAgora: boolean;
  iniciadoEm: string;
  verificadoEm: string;
  pragmas: ReturnType<typeof lerPragmas>;
  tabelas: InfoTabela[];
  tabelasEsperadas: number;
  tabelasPresentes: number;
  migrations: { tag: string; aplicadaEm: number | null }[];
  migrationsAplicadas: number;
  migrationsPendentes: number;
  versaoEsquema: string | null;
  backups: { nome: string; bytes: number }[];
  ultimaMigracao: { aplicadas: string[]; backup: string | null };
}

export function lerStatus(banco: BancoIniciado, agora: Date = new Date()): StatusSistema {
  const conectado = ping(banco);
  const pragmas = lerPragmas(banco);
  const tabelas = contarLinhas(banco);
  const projeto = migrationsDoProjeto(banco.config.migrationsDir);
  const aplicadas = migrationsAplicadas(banco, banco.config.migrationsDir);
  const quandos = new Set(aplicadas.map((a) => a.quando));
  const migrations = projeto.map((m) => ({
    tag: m.tag,
    aplicadaEm: quandos.has(m.quando) ? m.quando : null,
  }));
  const pendentes = migrations.filter((m) => m.aplicadaEm === null).length;
  const presentes = tabelas.filter((t) => t.linhas >= 0).length;
  const ultima = [...migrations].reverse().find((m) => m.aplicadaEm !== null);
  return {
    ok:
      conectado &&
      pendentes === 0 &&
      presentes === TABELAS.length &&
      pragmas.foreignKeys &&
      pragmas.integridadeRapida === 'ok',
    conectado,
    bancoArquivo: banco.config.bancoArquivo,
    dadosDir: banco.config.dadosDir,
    backupsDir: banco.config.backupsDir,
    bytes: tamanhoArquivo(banco.config.bancoArquivo),
    criadoAgora: banco.criadoAgora,
    iniciadoEm: banco.iniciadoEm.toISOString(),
    verificadoEm: agora.toISOString(),
    pragmas,
    tabelas,
    tabelasEsperadas: TABELAS.length,
    tabelasPresentes: presentes,
    migrations,
    migrationsAplicadas: aplicadas.length,
    migrationsPendentes: pendentes,
    versaoEsquema: ultima?.tag ?? null,
    backups: listarBackups(banco.config.backupsDir).map((b) => ({ nome: b.nome, bytes: b.bytes })),
    ultimaMigracao: banco.migracao,
  };
}

/** Backup sob demanda a partir do site. Devolve o nome do arquivo criado. */
export function backupAgora(banco: BancoIniciado): string {
  const caminho = fazerBackup(banco.sqlite, banco.config.backupsDir);
  return caminho.split(/[\\/]/).pop() ?? caminho;
}

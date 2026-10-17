/** Formatação da tela de backups (datas no horário local, tamanhos legíveis, selos). */
import type { TipoBackup } from '$lib/server/db/backup';

const p2 = (n: number) => String(n).padStart(2, '0');

/** "2026-10-15T14:03:00.000Z" → "15/10/2026 11:03" (horário local). */
export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'data desconhecida';
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** "870 KB", "12,4 MB". */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('pt-BR')} KB`;
  }
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

export const ROTULO_TIPO_BACKUP: Record<TipoBackup, string> = {
  automatico: 'Automático',
  manual: 'Manual',
  'antes-de-restaurar': 'Antes de restaurar',
};

/** Nome de arquivo sem a pasta (o serviço pode devolver o caminho completo). */
export function nomeDoArquivo(caminho: string): string {
  return caminho.split(/[\\/]/).pop() ?? caminho;
}

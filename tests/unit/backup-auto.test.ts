import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ErroDeNegocio } from '../../src/lib/server/servicos/erros';
import {
  fazerBackup,
  nomeBackup,
  nomeBackupValido,
  rotacionarAutomaticos,
  tipoDoBackup,
  verificarArquivoBackup,
} from '../../src/lib/server/db/backup';
import { contas } from '../../src/lib/server/db/esquema';
import { iniciarBanco, type BancoIniciado } from '../../src/lib/server/db/index';
import { migrationsDoProjeto } from '../../src/lib/server/db/migrar';
import {
  backupAutomaticoSeNecessario,
  excluirBackup,
  listarBackupsDetalhados,
  lerConfigBackup,
  proximoBackupAutomatico,
  salvarConfigBackup,
} from '../../src/lib/server/servicos/backups';
import { ultimaVerificacao, verificarIntegridade } from '../../src/lib/server/servicos/integridade';
import { PASTA_MIGRATIONS, pastaTemporaria } from './ajuda-banco';

const limpezas: (() => void)[] = [];
const TAGS = migrationsDoProjeto(PASTA_MIGRATIONS).map((m) => m.tag);
afterEach(() => {
  while (limpezas.length) limpezas.pop()!();
});

function banco(): BancoIniciado {
  const t = pastaTemporaria();
  limpezas.push(t.limpar);
  const b = iniciarBanco(t.config);
  limpezas.push(() => b.sqlite.close());
  return b;
}

describe('nomes e tipos de backup', () => {
  it('prefixo entra no nome; sem prefixo fica igual ao de antes', () => {
    const d = new Date(2026, 9, 17, 8, 5, 3);
    expect(nomeBackup(d)).toBe('financas-2026-10-17-080503.db');
    expect(nomeBackup(d, 'auto')).toBe('financas-auto-2026-10-17-080503.db');
    expect(nomeBackup(d, 'antes-de-restaurar')).toBe(
      'financas-antes-de-restaurar-2026-10-17-080503.db',
    );
    expect(() => nomeBackup(d, '../x')).toThrow();
  });

  it('tipo pelo prefixo', () => {
    expect(tipoDoBackup('financas-auto-2026-10-17-080503.db')).toBe('automatico');
    expect(tipoDoBackup('financas-antes-de-restaurar-2026-10-17-080503.db')).toBe(
      'antes-de-restaurar',
    );
    expect(tipoDoBackup('financas-2026-10-17-080503.db')).toBe('manual');
  });

  it('recusa caminhos e nomes fora do padrão', () => {
    expect(nomeBackupValido('financas-2026-10-17-080503.db')).toBe(true);
    for (const ruim of [
      '../x.db',
      'a/b.db',
      '/etc/financas.db',
      'financas-../x.db',
      'financas-a..b.db',
      'financas-x.db.exe',
      'outro.db',
      '',
    ]) {
      expect(nomeBackupValido(ruim), ruim).toBe(false);
    }
  });
});

describe('verificarArquivoBackup', () => {
  it('aceita um backup íntegro e conta as linhas principais', () => {
    const b = banco();
    b.db.insert(contas).values({ nome: 'Corrente', saldoCentavos: 10 }).run();
    const arq = fazerBackup(b.sqlite, b.config.backupsDir);
    const r = verificarArquivoBackup(arq, PASTA_MIGRATIONS);
    expect(r.ok).toBe(true);
    expect(r.erros).toEqual([]);
    expect(r.tabelas).toBe(15);
    expect(r.linhas.contas).toBe(1);
    expect(r.linhas.compras).toBe(0);
    expect(r.versaoEsquema).toBe(TAGS[TAGS.length - 1]);
  });

  it('recusa arquivo que não é banco, sem lançar', () => {
    const b = banco();
    const lixo = join(b.config.backupsDir, 'financas-2026-10-17-000000.db');
    mkdirSync(b.config.backupsDir, { recursive: true });
    writeFileSync(lixo, 'isto não é um banco de dados '.repeat(200));
    const r = verificarArquivoBackup(lixo, PASTA_MIGRATIONS);
    expect(r.ok).toBe(false);
    expect(r.erros.length).toBeGreaterThan(0);
  });

  it('arquivo inexistente vira erro', () => {
    const r = verificarArquivoBackup('/nao/existe/financas.db', PASTA_MIGRATIONS);
    expect(r.ok).toBe(false);
  });
});

describe('rotação dos automáticos', () => {
  it('apaga só os automáticos mais antigos além de "manter"', () => {
    const b = banco();
    const pasta = b.config.backupsDir;
    for (const dia of [1, 2, 3, 4, 5]) {
      fazerBackup(b.sqlite, pasta, new Date(2026, 9, dia, 3), 'auto');
    }
    fazerBackup(b.sqlite, pasta, new Date(2026, 9, 1, 3)); // manual
    fazerBackup(b.sqlite, pasta, new Date(2026, 8, 1, 3), 'antes-de-restaurar');

    const apagados = rotacionarAutomaticos(pasta, 3);
    expect(apagados).toEqual([
      'financas-auto-2026-10-02-030000.db',
      'financas-auto-2026-10-01-030000.db',
    ]);
    const restantes = listarBackupsDetalhados(b).map((x) => x.nome);
    expect(restantes).toHaveLength(5);
    expect(restantes.filter((n) => tipoDoBackup(n) === 'automatico')).toHaveLength(3);
    expect(restantes.filter((n) => tipoDoBackup(n) === 'manual')).toHaveLength(1);
    expect(restantes.filter((n) => tipoDoBackup(n) === 'antes-de-restaurar')).toHaveLength(1);
  });

  it('nunca apaga manuais nem de antes de restaurar, mesmo com manter = 1', () => {
    const b = banco();
    const pasta = b.config.backupsDir;
    fazerBackup(b.sqlite, pasta, new Date(2026, 0, 1, 3));
    fazerBackup(b.sqlite, pasta, new Date(2026, 0, 2, 3), 'antes-de-restaurar');
    expect(rotacionarAutomaticos(pasta, 1)).toEqual([]);
    expect(listarBackupsDetalhados(b)).toHaveLength(2);
  });
});

describe('configuração e backup automático', () => {
  it('padrões: ligado, manter 30', () => {
    const b = banco();
    expect(lerConfigBackup(b)).toEqual({
      ativo: true,
      manter: 30,
      ultimoAutomatico: null,
      ultimaFalha: null,
    });
  });

  it('valida ativo e manter com campo indicado', () => {
    const b = banco();
    for (const manter of [0, 366, 2.5, Number.NaN]) {
      expect(() => salvarConfigBackup(b, { ativo: true, manter })).toThrow(ErroDeNegocio);
    }
    try {
      salvarConfigBackup(b, { ativo: true, manter: 0 });
    } catch (e) {
      expect((e as ErroDeNegocio).campo).toBe('manter');
    }
    expect(() => salvarConfigBackup(b, { ativo: 'sim' as unknown as boolean, manter: 3 })).toThrow(
      ErroDeNegocio,
    );
    expect(lerConfigBackup(b).manter).toBe(30);
  });

  it('é idempotente no mesmo dia e cria de novo no dia seguinte', () => {
    const b = banco();
    const manha = new Date(2026, 9, 17, 8, 0, 0);
    const r1 = backupAutomaticoSeNecessario(b, manha);
    expect(r1.feito).toBe(true);
    expect(r1.arquivo).toBe('financas-auto-2026-10-17-080000.db');
    const r2 = backupAutomaticoSeNecessario(b, new Date(2026, 9, 17, 20, 0, 0));
    expect(r2).toEqual({ feito: false, removidos: [] });
    const r3 = backupAutomaticoSeNecessario(b, new Date(2026, 9, 18, 8, 0, 0));
    expect(r3.feito).toBe(true);
    expect(listarBackupsDetalhados(b).filter((x) => x.tipo === 'automatico')).toHaveLength(2);
    expect(lerConfigBackup(b).ultimoAutomatico).toBe(new Date(2026, 9, 18, 8, 0, 0).toISOString());
  });

  it('desligado não faz nada', () => {
    const b = banco();
    salvarConfigBackup(b, { ativo: false, manter: 30 });
    expect(backupAutomaticoSeNecessario(b)).toEqual({ feito: false, removidos: [] });
    expect(listarBackupsDetalhados(b)).toHaveLength(0);
  });

  it('falha vira ultimaFalha sem lançar, e some na próxima vez que dá certo', () => {
    const b = banco();
    // A pasta de backups vira um arquivo comum: não dá para criar o backup nela.
    const pastaQuebrada = join(b.config.backupsDir, '..', 'pasta-que-vira-arquivo');
    writeFileSync(pastaQuebrada, 'não sou uma pasta');
    const quebrado: BancoIniciado = { ...b, config: { ...b.config, backupsDir: pastaQuebrada } };
    const r = backupAutomaticoSeNecessario(quebrado, new Date(2026, 9, 17, 8));
    expect(r).toEqual({ feito: false, removidos: [] });
    expect(lerConfigBackup(b).ultimaFalha).toEqual(expect.any(String));

    rmSync(pastaQuebrada);
    const ok = backupAutomaticoSeNecessario(b, new Date(2026, 9, 17, 9));
    expect(ok.feito).toBe(true);
    expect(lerConfigBackup(b).ultimaFalha).toBeNull();
  });

  it('próximo automático: desligado, hoje ou amanhã', () => {
    const agora = new Date(2026, 9, 17, 15, 0, 0);
    const base = { ativo: true, manter: 30, ultimoAutomatico: null, ultimaFalha: null };
    expect(proximoBackupAutomatico({ ...base, ativo: false }, agora)).toBe('desligado');
    expect(proximoBackupAutomatico(base, agora)).toBe('hoje');
    const ontem = new Date(2026, 9, 16, 9).toISOString();
    expect(proximoBackupAutomatico({ ...base, ultimoAutomatico: ontem }, agora)).toBe('hoje');
    const hoje = new Date(2026, 9, 17, 9).toISOString();
    expect(proximoBackupAutomatico({ ...base, ultimoAutomatico: hoje }, agora)).toBe('amanhã');
  });
});

describe('excluir e listar', () => {
  it('excluir só aceita nome válido dentro da pasta', () => {
    const b = banco();
    for (const ruim of ['../x.db', 'a/b.db', '/etc/passwd', 'financas-../../x.db']) {
      expect(() => excluirBackup(b, ruim), ruim).toThrow(ErroDeNegocio);
    }
    expect(() => excluirBackup(b, 'financas-2026-01-01-000000.db')).toThrow(ErroDeNegocio);
  });

  it('exclui um backup existente e lista do mais novo para o mais antigo', () => {
    const b = banco();
    fazerBackup(b.sqlite, b.config.backupsDir, new Date(2026, 0, 1, 3));
    fazerBackup(b.sqlite, b.config.backupsDir, new Date(2026, 0, 3, 3), 'auto');
    fazerBackup(b.sqlite, b.config.backupsDir, new Date(2026, 0, 2, 3), 'antes-de-restaurar');
    const nomes = listarBackupsDetalhados(b).map((x) => x.nome);
    expect(nomes).toEqual([
      'financas-auto-2026-01-03-030000.db',
      'financas-antes-de-restaurar-2026-01-02-030000.db',
      'financas-2026-01-01-030000.db',
    ]);
    excluirBackup(b, 'financas-2026-01-01-030000.db');
    expect(listarBackupsDetalhados(b)).toHaveLength(2);
  });
});

describe('integridade', () => {
  it('banco íntegro: ok e guardado como última verificação', () => {
    const b = banco();
    const r = verificarIntegridade(b);
    expect(r.ok).toBe(true);
    expect(r.mensagens).toEqual([]);
    expect(ultimaVerificacao()).toEqual(r);
  });
});

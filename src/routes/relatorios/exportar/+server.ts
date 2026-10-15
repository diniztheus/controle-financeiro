/**
 * Exportação dos lançamentos de um período (meses inteiros) em CSV ou JSON.
 * GET /relatorios/exportar?de=AAAA-MM&ate=AAAA-MM&formato=csv|json → arquivo para baixar.
 */
import { ehMes } from '$lib/dominio/datas';
import { obterBanco } from '$lib/server/db';
import { ErroDeNegocio } from '$lib/server/servicos/erros';
import { exportar } from '$lib/server/servicos/relatorios';
import type { RequestHandler } from './$types';

/** Resposta de erro em texto simples, legível no navegador. */
function falha(mensagem: string): Response {
  return new Response(`${mensagem}\n`, {
    status: 400,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  });
}

export const GET: RequestHandler = ({ url }) => {
  const de = url.searchParams.get('de') ?? '';
  const ate = url.searchParams.get('ate') ?? '';
  const formato = url.searchParams.get('formato') ?? 'csv';

  if (!ehMes(de) || !ehMes(ate)) {
    return falha('Período inválido. Use de=AAAA-MM e ate=AAAA-MM, como de=2026-01&ate=2026-10.');
  }
  if (formato !== 'csv' && formato !== 'json') {
    return falha('Formato inválido. Use formato=csv ou formato=json.');
  }

  try {
    const arquivo = exportar(obterBanco(), { de, ate, formato });
    return new Response(arquivo.conteudo, {
      headers: {
        'Content-Type': arquivo.tipo,
        'Content-Disposition': `attachment; filename="${arquivo.nome}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof ErroDeNegocio) return falha(e.message);
    throw e;
  }
};

import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';
import { obterBanco } from '$lib/server/db';
import { garantirCategoriasPadrao } from '$lib/server/servicos/categorias';
import { backupAutomaticoSeNecessario } from '$lib/server/servicos/backups';
import { atualizarPrecoSeLigado } from '$lib/server/servicos/bitcoin';
import { verificarIntegridade } from '$lib/server/servicos/integridade';
import { gerarReceitasRecorrentes } from '$lib/server/servicos/recorrentes';
import {
  acessoRedeLigado,
  caminhoLivre,
  decidirAcesso,
  hostLocal,
  verificarPedido,
} from '$lib/server/seguranca';
import { pinAtivo } from '$lib/server/servicos/pin';
import { cookieValido, NOME_COOKIE } from '$lib/server/sessaoPin';

const INTERVALO_BACKUP_MS = 60 * 60 * 1000;
const INTERVALO_BTC_MS = 60 * 60 * 1000;

/**
 * Preço do bitcoin sozinho (se a opção estiver ligada e houver movimentos). `BTC_PRECO_AUTOMATICO=0`
 * desliga de vez, sem nenhuma chamada à internet (os testes usam isso). Não espera: falhas vão ao console.
 */
async function atualizarBitcoin(): Promise<void> {
  if (process.env.BTC_PRECO_AUTOMATICO === '0') return;
  try {
    await atualizarPrecoSeLigado(obterBanco());
  } catch (e) {
    console.error('[bitcoin]', e);
  }
}

/**
 * Ao subir o servidor: cria a pasta de dados, abre o banco e aplica migrations pendentes.
 * Depois verifica a integridade, faz o backup automático do dia se faltar e repete essa
 * checagem de hora em hora. O preço do bitcoin também é atualizado ao subir e de hora em hora.
 * O relógio não segura o processo (`unref`).
 */
export const init: ServerInit = () => {
  // Na primeira vez, as categorias do app atual já ficam prontas para lançar.
  garantirCategoriasPadrao(obterBanco());
  try {
    const banco = obterBanco();
    verificarIntegridade(banco);
    backupAutomaticoSeNecessario(banco);
  } catch (e) {
    console.error('[backup]', e);
  }
  setInterval(() => {
    try {
      backupAutomaticoSeNecessario(obterBanco());
    } catch (e) {
      console.error('[backup]', e);
    }
  }, INTERVALO_BACKUP_MS).unref();
  void atualizarBitcoin();
  setInterval(() => {
    void atualizarBitcoin();
  }, INTERVALO_BTC_MS).unref();
};

/**
 * Erro inesperado numa página: registra o detalhe só no console do servidor, com um id curto,
 * e devolve à tela uma mensagem genérica (o id permite localizar o registro).
 */
export const handleError: HandleServerError = ({ error, status, event }) => {
  const id = crypto.randomUUID().slice(0, 8);
  // Página inexistente não é falha do site: não polui o log do servidor.
  if (status !== 404) {
    console.error(`[erro ${id}] ${status} ${event.request.method} ${event.url.pathname}`, error);
  }
  return { message: 'Erro interno', id };
};

/**
 * Só atende esta máquina e só aceita formulários desta mesma origem (ver seguranca.ts).
 * Antes de qualquer tela carregar, lança as receitas recorrentes que já venceram: aqui (e não
 * no layout) elas valem em toda navegação e sempre antes de a página ler as receitas.
 * É barato: sem nada pendente, só lê. Falha aqui nunca derruba a página.
 */
export const handle: Handle = ({ event, resolve }) => {
  const h = event.request.headers;
  const acessoRede = acessoRedeLigado();
  const recusa = verificarPedido({
    metodo: event.request.method,
    host: h.get('host'),
    origin: h.get('origin'),
    secFetchSite: h.get('sec-fetch-site'),
    acessoRede,
  });
  if (recusa) {
    return new Response(recusa.motivo, {
      status: recusa.status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  // PIN (opcional): sem acesso, nada abaixo roda, nem a geração de recorrentes.
  const caminho = event.url.pathname + event.url.search;
  try {
    const banco = obterBanco();
    const decisao = decidirAcesso({
      pinAtivo: pinAtivo(banco),
      caminho,
      metodo: event.request.method,
      cookieValido: cookieValido(banco, event.cookies.get(NOME_COOKIE)),
      hostEhLoopback: hostLocal(h.get('host')),
      acessoRede,
      porta: event.url.port,
    });
    if (decisao.acao === 'redirecionar') {
      return new Response(null, { status: 303, headers: { location: decisao.para } });
    }
    if (decisao.acao === 'recusar') {
      return new Response(decisao.motivo, {
        status: decisao.status,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  } catch (e) {
    // Sem conseguir ler o PIN não há como saber se pode entrar: só os caminhos livres passam.
    console.error('[acesso]', e);
    if (!caminhoLivre(caminho)) {
      return new Response('O banco de dados não está disponível.', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  }
  try {
    gerarReceitasRecorrentes(obterBanco());
  } catch (e) {
    console.error('[recorrentes]', e);
  }
  return resolve(event);
};

import type { Handle, ServerInit } from '@sveltejs/kit';
import { obterBanco } from '$lib/server/db';
import { garantirCategoriasPadrao } from '$lib/server/servicos/categorias';
import { verificarPedido } from '$lib/server/seguranca';

/** Ao subir o servidor: cria a pasta de dados, abre o banco e aplica migrations pendentes. */
export const init: ServerInit = () => {
  // Na primeira vez, as categorias do app atual já ficam prontas para lançar.
  garantirCategoriasPadrao(obterBanco());
};

/** Só atende esta máquina e só aceita formulários desta mesma origem (ver seguranca.ts). */
export const handle: Handle = ({ event, resolve }) => {
  const h = event.request.headers;
  const recusa = verificarPedido({
    metodo: event.request.method,
    host: h.get('host'),
    origin: h.get('origin'),
    secFetchSite: h.get('sec-fetch-site'),
  });
  if (recusa) {
    return new Response(recusa.motivo, {
      status: recusa.status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return resolve(event);
};

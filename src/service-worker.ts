/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/**
 * Service worker mínimo, só para o navegador oferecer "Instalar" o app.
 * Os dados são locais e mudam o tempo todo, então NÃO há cache de páginas nem modo offline:
 * o `fetch` não intercepta nada e cada pedido segue direto para a rede.
 */
const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => {
  void sw.skipWaiting();
});

// Limpa caches de versões antigas (não criamos nenhum, mas um worker antigo pode ter criado).
sw.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nome of await caches.keys()) await caches.delete(nome);
      await sw.clients.claim();
    })(),
  );
});

// Sem respondWith: o navegador busca tudo na rede normalmente.
sw.addEventListener('fetch', () => {});

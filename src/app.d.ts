// Tipos globais do SvelteKit: https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    interface Error {
      /** Id curto do registro no console do servidor (ver handleError em hooks.server.ts). */
      id?: string;
    }
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};

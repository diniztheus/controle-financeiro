import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build', precompress: false }),
    // A checagem de origem fica em src/lib/server/seguranca.ts (hook `handle`): ela aceita
    // 127.0.0.1 e localhost em qualquer porta sem precisar de ORIGIN fixo, e é mais rígida
    // (barra também Host estranho e qualquer método que altera dados).
    csrf: { trustedOrigins: ['*'] },
  },
};

export default config;

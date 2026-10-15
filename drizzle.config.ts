import { defineConfig } from 'drizzle-kit';

// Usado só para gerar migrations (`pnpm db:generate`); não precisa de banco.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/server/db/esquema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});

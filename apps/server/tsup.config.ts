import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // shared is TS source inside the monorepo: bundle it into the server build
  noExternal: ['@keyring/shared'],
  // Keep 'node:' specifiers: node:sqlite only exists with the prefix.
  removeNodeProtocol: false,
});

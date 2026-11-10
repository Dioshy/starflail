import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './', // relative paths: the same dist works on itch/CrazyGames/Poki subpaths and static hosts
  server: { port: 5173 },
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
});

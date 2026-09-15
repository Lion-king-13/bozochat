import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { loadDotenv } from './src/config/dotenv';

loadDotenv();
// Les tests e2e vident les tables : ils tournent sur une base dédiée.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// SWC est nécessaire pour les métadonnées de décorateurs utilisées par NestJS.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 15000,
  },
});

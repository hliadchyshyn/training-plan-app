import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    env: {
      JWT_SECRET: 'test-jwt-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/utils/auth-tokens.ts',
        'src/utils/constants.ts',
        'src/utils/db.ts',
        'src/utils/invite-codes.ts',
        'src/utils/planToWatch.ts',
        'src/utils/stravaMatch.ts',
        'src/utils/watchExport.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
    },
  },
})

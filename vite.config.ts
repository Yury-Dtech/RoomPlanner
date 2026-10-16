import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/RoomPlanner/',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

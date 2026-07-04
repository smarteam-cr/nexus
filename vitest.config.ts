/**
 * vitest.config.ts — dos proyectos:
 *   unit:        lib/**·*.test.ts — funciones puras, SIN DB ni red. Rápidos,
 *                corren en cualquier máquina y en CI sin servicios.
 *   integration: **·*.int.test.ts — contra la DB de TEST (Postgres Docker
 *                local / service container en CI; NUNCA prod). Cargan .env.test
 *                vía test/setup.integration.ts, serial (fileParallelism off)
 *                porque comparten la DB (truncate+seed por test).
 *
 * El alias @/ se resuelve desde tsconfig.json vía resolve.tsconfigPaths
 * (soporte nativo de Vite — cero duplicación de paths).
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "unit",
          environment: "node",
          include: ["lib/**/*.test.ts"],
          exclude: ["**/*.int.test.ts", "**/node_modules/**"],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "integration",
          environment: "node",
          include: ["lib/**/*.int.test.ts", "app/**/*.int.test.ts", "test/**/*.int.test.ts"],
          setupFiles: ["./test/setup.integration.ts"],
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["lib/**"],
      exclude: ["lib/**/*.test.ts", "lib/**/*.int.test.ts", "**/*.d.ts"],
    },
  },
});

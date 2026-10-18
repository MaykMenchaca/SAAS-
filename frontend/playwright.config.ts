import { defineConfig, devices } from "@playwright/test";

// E2E_PORT: otro puerto si el 3000 ya lo ocupa otro servidor (se reutilizaría con código ajeno).
// E2E_CHANNEL: navegador instalado en el equipo ("chrome", "msedge") en lugar del Chromium de Playwright.
const PORT = Number(process.env.E2E_PORT ?? 3000);
const CHANNEL = process.env.E2E_CHANNEL || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: CHANNEL },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});

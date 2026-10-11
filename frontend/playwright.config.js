import { defineConfig, devices } from "@playwright/test";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(frontendDir, "..", "backend");
const python = process.env.PYTHON || resolve(
  backendDir,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5180",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
  }],
  webServer: [
    {
      command: `"${python}" -m uvicorn main:app --host 127.0.0.1 --port 8003`,
      cwd: backendDir,
      url: "http://127.0.0.1:8003/health",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ALLOWED_ORIGINS: "http://127.0.0.1:5180",
        DATABASE_URL: "",
        GEMINI_API_KEY: "",
        LINK_CHECK_ENABLED: "false",
        RESUME_ANALYSIS_ENABLED: "false",
        RENDER_SERVICE_ID: "",
        SUPABASE_URL: "",
        TRUSTED_PROXY_CIDRS: "",
        TRUSTED_PROXY_MODE: "none",
        YOUTUBE_API_KEY: "",
      },
    },
    {
      command: "npm run dev -- --mode e2e --host 127.0.0.1 --port 5180 --strictPort",
      cwd: frontendDir,
      url: "http://127.0.0.1:5180",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_API_URL: "http://127.0.0.1:8003",
        VITE_SUPABASE_URL: "http://127.0.0.1:9999",
        VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-public-test-key",
      },
    },
  ],
});

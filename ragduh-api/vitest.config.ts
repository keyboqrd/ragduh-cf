import { defineConfig } from "vitest/config";
import * as fs from "fs";
import * as path from "path";

// Load .env file manually (vitest doesn't auto-load)
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  const envLines = envContent.split("\n");
  for (const line of envLines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").replace(/^["']|["']$/g, "");
      if (key && value) {
        process.env[key.trim()] = value;
      }
    }
  }
}

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/__tests__/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    // Increase timeout for E2E tests (network calls, job processing)
    testTimeout: 120000, // 2 minutes
    hookTimeout: 30000,  // 30 seconds
  },
  resolve: {
    alias: {
      "@": "./src",
    },
  },
});

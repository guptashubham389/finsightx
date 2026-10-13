import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests", testMatch: "**/browser.spec.ts", workers: 1,
  use: { browserName: "chromium", launchOptions: { executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" } },
});

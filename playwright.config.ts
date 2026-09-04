import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  // Phaser/WebGL pages share a GPU process. Serial workers keep animation
  // timing representative instead of starving six simultaneous game loops.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: 'mobile-chromium',
      use: {
        // Exercise the Chromium project with an actual Android/Chrome UA and
        // touch profile; WebKit below separately covers the iPhone profile.
        ...devices['Pixel 5'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 }
      }
    },
    {
      name: 'mobile-webkit',
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
        viewport: { width: 390, height: 844 }
      }
    }
  ]
});

import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__submitted = [];
    window.PebbleConfigBridge = {
      submit(payload) {
        window.__submitted.push(payload);
      },
    };
  });
});

test("persists login details and send mode", async ({ page }) => {
  await page.goto("/");

  await page.fill("#phone-number", "+15551234567");
  await page.fill("#login-code", "12345");
  await page.fill("#password", "hunter2");
  await page.check("#send-mode-auto");
  await page.check("#preview-chat-message");
  await page.click("#save-login");

  await expect(page.locator("#status-banner")).toHaveText("Login details saved locally.");

  const submitted = await page.evaluate(() => window.__submitted);
  expect(submitted).toContainEqual({
    action: "auth:save",
    state: {
      phoneNumber: "+15551234567",
      loginCode: "12345",
      password: "hunter2",
      sendMode: "auto",
      previewChatMessage: true,
    },
  });
});

test("requires confirmation before clear cache and logout", async ({ page }) => {
  await page.goto("/");

  await page.click("#clear-cache");
  await expect(page.locator("#confirm-clear-cache")).toBeVisible();
  await page.click("#confirm-clear-cache");

  await page.click("#logout");
  await expect(page.locator("#confirm-logout")).toBeVisible();
  await page.click("#confirm-logout");

  const submitted = await page.evaluate(() => window.__submitted);
  expect(submitted).toContainEqual({ action: "cache:clear" });
  expect(submitted).toContainEqual({ action: "auth:logout" });
});

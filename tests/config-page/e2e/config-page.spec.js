import { test, expect } from "@playwright/test";

async function installBridge(page) {
  await page.addInitScript(() => {
    window.__submitted = [];
    window.PebbleConfigBridge = {
      submit(payload) {
        window.__submitted.push(payload);
      },
    };
  });
}

test.beforeEach(async ({ page }) => {
  await installBridge(page);
});

test("loads embedded state and submits config changes in one payload", async ({ page }) => {
  const initialState = encodeURIComponent(JSON.stringify({
    phoneNumber: "+15550001111",
    sendMode: "auto",
    previewChatMessage: true,
    hasSession: true,
    accountLabel: "Test User",
  }));

  await page.goto(`/?state=${initialState}`);

  await expect(page.locator("#session-state")).toHaveText("Session active: Test User");
  await expect(page.locator("#phone-number")).toHaveValue("+15550001111");
  await expect(page.locator("#preview-chat-message")).toBeChecked();
  await expect(page.locator("#send-mode-auto")).toBeChecked();

  await page.fill("#phone-number", "+15551234567");
  await page.fill("#login-code", "12345");
  await page.fill("#password", "hunter2");
  await page.check("#send-mode-preview");
  await page.uncheck("#preview-chat-message");
  await page.click("#save-login");

  await expect(page.locator("#status-banner")).toHaveText("Closing to save settings and sign in.");

  const submitted = await page.evaluate(() => window.__submitted);
  expect(submitted).toContainEqual({
    action: "config:save",
    state: {
      phoneNumber: "+15551234567",
      loginCode: "12345",
      password: "hunter2",
      sendMode: "preview",
      previewChatMessage: false,
    },
  });

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("tg_pebble:config_state")));
  expect(stored).toMatchObject({
    phoneNumber: "+15551234567",
    sendMode: "preview",
    previewChatMessage: false,
    hasSession: true,
    accountLabel: "Test User",
  });
  expect(stored.loginCode).toBeUndefined();
  expect(stored.password).toBeUndefined();
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

test("scrubs sensitive auth fields from bootstrap state and renders auth errors", async ({ page }) => {
  const initialState = encodeURIComponent(JSON.stringify({
    phoneNumber: "+15550002222",
    loginCode: "99999",
    password: "hunter2",
    sendMode: "auto",
    previewChatMessage: true,
    authError: "Code expired.",
  }));

  await page.goto(`/?state=${initialState}`);

  await expect(page.locator("#phone-number")).toHaveValue("+15550002222");
  await expect(page.locator("#login-code")).toHaveValue("");
  await expect(page.locator("#password")).toHaveValue("");
  await expect(page.locator("#send-mode-auto")).toBeChecked();
  await expect(page.locator("#preview-chat-message")).toBeChecked();
  await expect(page.locator("#status-banner")).toHaveText("Last sign-in failed: Code expired.");

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("tg_pebble:config_state")));
  expect(stored).toMatchObject({
    phoneNumber: "+15550002222",
    sendMode: "auto",
    previewChatMessage: true,
    authError: "Code expired.",
  });
  expect(stored.loginCode).toBeUndefined();
  expect(stored.password).toBeUndefined();
});

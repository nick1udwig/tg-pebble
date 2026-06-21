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
    codeRequested: true,
    codeDelivery: "app",
  }));

  await page.goto(`/?state=${initialState}`);

  await expect(page.locator("#session-state")).toHaveText("Session active: Test User");
  await expect(page.locator("#phone-number")).toHaveValue("+15550001111");
  await expect(page.locator("#preview-chat-message")).toBeChecked();
  await expect(page.locator("#send-mode-auto")).toBeChecked();

  await page.fill("#phone-number", "+15551234567");
  await page.click("#request-code");
  await page.fill("#login-code", "12345");
  await page.check("#send-mode-preview");
  await page.uncheck("#preview-chat-message");
  await page.click("#save-login");

  await expect(page.locator("#status-banner")).toHaveText("Closing to sign in.");

  const submitted = await page.evaluate(() => window.__submitted);
  expect(submitted).toContainEqual({
    action: "auth:request-code",
    state: {
      phoneNumber: "+15551234567",
      loginCode: "",
      password: "",
      sendMode: "auto",
      previewChatMessage: true,
    },
  });
  expect(submitted).toContainEqual({
    action: "config:save",
      state: {
        phoneNumber: "+15551234567",
        loginCode: "12345",
        password: "",
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
    codeRequested: true,
    codeDelivery: "app",
  });
  expect(stored.loginCode).toBeUndefined();
  expect(stored.password).toBeUndefined();
});

test("renders the 2FA step and submits a WebCrypto SRP proof", async ({ page }) => {
  await page.route("**/srp.js", async (route) => {
    await route.fulfill({
      contentType: "text/javascript",
      body: `
        export async function computeTelegramPasswordProof(challenge, password) {
          if (challenge.srpId !== "42" || password !== "hunter2") {
            throw new Error("bad proof input");
          }
          return { srpId: "42", A: "A64", M1: "M164" };
        }
      `,
    });
  });

  const initialState = encodeURIComponent(JSON.stringify({
    phoneNumber: "+15551234567",
    sendMode: "preview",
    previewChatMessage: false,
    hasSession: false,
    codeRequested: true,
    codeDelivery: "app",
    passwordRequired: true,
    passwordHint: "hint",
    passwordChallenge: {
      srpId: "42",
      g: 2,
      p: "p64",
      salt1: "s164",
      salt2: "s264",
      srpB: "b64",
    },
  }));

  await page.goto(`/?state=${initialState}`);

  await expect(page.locator("#session-state")).toHaveText("Telegram code accepted; 2FA password required.");
  await expect(page.locator("#login-code")).toBeHidden();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.locator("#save-login")).toHaveText("Finish Sign In");

  await page.fill("#password", "hunter2");
  await page.click("#save-login");

  await expect(page.locator("#status-banner")).toHaveText("Closing to finish sign in.");

  const submitted = await page.evaluate(() => window.__submitted);
  expect(submitted).toContainEqual({
    action: "auth:submit-password",
    state: {
      phoneNumber: "+15551234567",
      loginCode: "",
      password: "",
      passwordProof: {
        srpId: "42",
        A: "A64",
        M1: "M164",
      },
      sendMode: "preview",
      previewChatMessage: false,
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

test("submits request-code even when local storage writes fail", async ({ page }) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;

    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "tg_pebble:config_state") {
        throw new Error("localStorage unavailable");
      }

      return originalSetItem.call(this, key, value);
    };
  });

  await page.goto("/");

  await page.fill("#phone-number", "+15551234567");
  await page.click("#request-code");

  await expect(page.locator("#status-banner")).toHaveText("Closing to request a Telegram login code.");

  const submitted = await page.evaluate(() => window.__submitted);
  expect(submitted).toContainEqual({
    action: "auth:request-code",
    state: {
      phoneNumber: "+15551234567",
      loginCode: "",
      password: "",
      sendMode: "preview",
      previewChatMessage: false,
    },
  });
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

import { computeTelegramPasswordProof } from "./srp.js";

const STORAGE_KEY = "tg_pebble:config_state";

const DEFAULT_STATE = Object.freeze({
  phoneNumber: "",
  loginCode: "",
  password: "",
  sendMode: "preview",
  previewChatMessage: false,
  hasSession: false,
  accountLabel: "",
  authError: "",
  codeRequested: false,
  codeDelivery: "",
  passwordRequired: false,
  passwordHint: "",
  passwordChallenge: null,
});

function sanitizePasswordChallenge(challenge) {
  if (!challenge || typeof challenge !== "object") {
    return null;
  }

  return {
    srpId: String(challenge.srpId ?? ""),
    g: Number(challenge.g ?? 0),
    p: String(challenge.p ?? ""),
    salt1: String(challenge.salt1 ?? ""),
    salt2: String(challenge.salt2 ?? ""),
    srpB: String(challenge.srpB ?? ""),
  };
}

function sanitizePersistedState(state) {
  const source = state ?? {};

  return {
    phoneNumber: String(source.phoneNumber ?? "").trim(),
    sendMode: source.sendMode === "auto" ? "auto" : "preview",
    previewChatMessage: source.previewChatMessage === true,
    hasSession: source.hasSession === true,
    accountLabel: String(source.accountLabel ?? "").trim(),
    authError: String(source.authError ?? "").trim(),
    codeRequested: source.codeRequested === true,
    codeDelivery: source.codeDelivery === "app" ? "app" : (source.codeDelivery === "sms" ? "sms" : ""),
    passwordRequired: source.passwordRequired === true,
    passwordHint: String(source.passwordHint ?? ""),
    passwordChallenge: sanitizePasswordChallenge(source.passwordChallenge),
  };
}

function readEmbeddedState() {
  try {
    const params = new URLSearchParams(globalThis.location?.search ?? "");
    const raw = params.get("state");
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch (_error) {
      return JSON.parse(decodeURIComponent(raw));
    }
  } catch (_error) {
    return {};
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = sanitizePersistedState(raw ? JSON.parse(raw) : {});
    const embedded = sanitizePersistedState(readEmbeddedState());

    return {
      ...DEFAULT_STATE,
      ...stored,
      ...embedded,
      loginCode: "",
      password: "",
    };
  } catch (_error) {
    return { ...DEFAULT_STATE, ...readEmbeddedState(), loginCode: "", password: "" };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizePersistedState(state)));
  } catch (_error) {}
}

function getBridge() {
  if (globalThis.PebbleConfigBridge && typeof globalThis.PebbleConfigBridge.submit === "function") {
    return globalThis.PebbleConfigBridge;
  }

  return {
    submit(payload) {
      const closeUrl = "pebblejs://close#" + encodeURIComponent(JSON.stringify(payload));

      try {
        globalThis.location.href = closeUrl;
      } catch (_error) {}

      try {
        globalThis.location = closeUrl;
      } catch (_error) {}

      try {
        if (globalThis.document) {
          globalThis.document.location = closeUrl;
        }
      } catch (_error) {}
    },
  };
}

function setStatus(message, kind = "info") {
  const banner = document.querySelector("#status-banner");
  banner.textContent = message;
  banner.dataset.kind = kind;
}

function setSessionState(state) {
  const label = document.querySelector("#session-state");
  const hasSession = state.hasSession === true;
  const accountLabel = String(state.accountLabel ?? "").trim();

  if (hasSession && accountLabel) {
    label.textContent = `Session active: ${accountLabel}`;
    label.dataset.kind = "success";
    return;
  }

  if (hasSession) {
    label.textContent = "Telegram session active.";
    label.dataset.kind = "success";
    return;
  }

  if (state.codeRequested === true) {
    if (state.passwordRequired === true) {
      label.textContent = "Telegram code accepted; 2FA password required.";
      label.dataset.kind = "success";
      return;
    }

    label.textContent = state.codeDelivery === "sms"
      ? "Login code requested by SMS."
      : "Login code requested in Telegram.";
    label.dataset.kind = "success";
    return;
  }

  label.textContent = "No Telegram session stored.";
  label.dataset.kind = "info";
}

function readFormState() {
  return {
    phoneNumber: document.querySelector("#phone-number").value.trim(),
    loginCode: document.querySelector("#login-code").value.trim(),
    password: document.querySelector("#password").value,
    sendMode: document.querySelector('input[name="send-mode"]:checked').value,
    previewChatMessage: document.querySelector("#preview-chat-message").checked,
  };
}

function writeFormState(state) {
  const passwordRequired = state.passwordRequired === true;

  document.querySelector("#phone-number").value = state.phoneNumber;
  document.querySelector("#login-code").value = state.loginCode;
  document.querySelector("#password").value = state.password;
  document.querySelector(`#send-mode-${state.sendMode}`)?.setAttribute("checked", "checked");
  document.querySelector(`#send-mode-${state.sendMode}`)?.click();
  document.querySelector("#preview-chat-message").checked = state.previewChatMessage === true;
  document.querySelector("#login-code-label").classList.toggle("hidden", passwordRequired);
  document.querySelector("#login-code").classList.toggle("hidden", passwordRequired);
  document.querySelector("#password-label").classList.toggle("hidden", !passwordRequired);
  document.querySelector("#password").classList.toggle("hidden", !passwordRequired);
  document.querySelector("#password").placeholder = state.passwordHint
    ? `Telegram two-step password; hint: ${state.passwordHint}`
    : "Telegram two-step password";
  document.querySelector("#save-login").textContent = passwordRequired ? "Finish Sign In" : "Save / Sign In";
  setSessionState(state);
}

function setInitialStatus(state) {
  if (state.authError) {
    setStatus(`Last sign-in failed: ${state.authError}`, "error");
    return;
  }

  setStatus(
    state.hasSession
      ? "Current PKJS session loaded."
      : (
        state.passwordRequired
          ? "Enter your Telegram 2FA password to finish sign in."
          : state.codeRequested
          ? "Enter the login code from Telegram, then sign in."
          : "Save changes to update settings or request a login code."
      ),
    state.hasSession ? "success" : "info",
  );
}

function reveal(buttonId) {
  document.querySelector(buttonId).classList.remove("hidden");
}

function hide(buttonId) {
  document.querySelector(buttonId).classList.add("hidden");
}

function bootstrap() {
  let currentState = loadState();
  saveState(currentState);
  writeFormState(currentState);
  setInitialStatus(currentState);

  document.querySelectorAll('input[name="send-mode"]').forEach((node) => {
    node.addEventListener("change", () => {
      currentState = { ...currentState, ...readFormState() };
      saveState(currentState);
      setStatus(`Send mode saved locally: ${currentState.sendMode}`, "success");
    });
  });

  document.querySelector("#preview-chat-message").addEventListener("change", () => {
    currentState = { ...currentState, ...readFormState() };
    saveState(currentState);
    setStatus(`Chat previews ${currentState.previewChatMessage ? "enabled" : "disabled"} locally.`, "success");
  });

  document.querySelector("#request-code").addEventListener("click", () => {
    const nextState = readFormState();

    if (!nextState.phoneNumber) {
      setStatus("Enter a phone number before requesting a code.", "error");
      return;
    }

    currentState = {
      ...currentState,
      ...nextState,
      authError: "",
    };
    saveState(currentState);
    setStatus("Closing to request a Telegram login code.", "success");
    getBridge().submit({ action: "auth:request-code", state: nextState });
  });

  document.querySelector("#save-login").addEventListener("click", async () => {
    const nextState = readFormState();

    if (currentState.passwordRequired === true) {
      if (!nextState.phoneNumber) {
        setStatus("Phone number is required to finish sign in.", "error");
        return;
      }
      if (!nextState.password) {
        setStatus("Enter your Telegram 2FA password.", "error");
        return;
      }
      if (!currentState.passwordChallenge) {
        setStatus("Telegram 2FA challenge is missing. Request a new login code.", "error");
        return;
      }

      try {
        setStatus("Preparing Telegram 2FA proof.", "info");
        const passwordProof = await computeTelegramPasswordProof(currentState.passwordChallenge, nextState.password);
        currentState = { ...currentState, ...nextState, password: "", authError: "" };
        saveState(currentState);
        getBridge().submit({
          action: "auth:submit-password",
          state: {
            ...nextState,
            loginCode: "",
            password: "",
            passwordProof,
          },
        });
        setStatus("Closing to finish sign in.", "success");
      } catch (error) {
        setStatus(error?.message || "Telegram 2FA proof failed.", "error");
      }
      return;
    }

    currentState = { ...currentState, ...nextState, authError: "" };
    saveState(currentState);
    getBridge().submit({ action: "config:save", state: nextState });
    setStatus(
      nextState.phoneNumber && nextState.loginCode
        ? "Closing to sign in."
        : "Closing to save settings.",
      "success",
    );
  });

  document.querySelector("#clear-cache").addEventListener("click", () => {
    reveal("#confirm-clear-cache");
    setStatus("Confirm cache clear to remove chats and messages only.", "info");
  });

  document.querySelector("#confirm-clear-cache").addEventListener("click", () => {
    getBridge().submit({ action: "cache:clear" });
    hide("#confirm-clear-cache");
    setStatus("Cache clear requested.", "success");
  });

  document.querySelector("#logout").addEventListener("click", () => {
    reveal("#confirm-logout");
    setStatus("Confirm logout to revoke the Telegram session.", "info");
  });

  document.querySelector("#confirm-logout").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    getBridge().submit({ action: "auth:logout" });
    hide("#confirm-logout");
    setStatus("Logout requested.", "success");
  });
}

bootstrap();

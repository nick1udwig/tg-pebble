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
});

function sanitizePersistedState(state) {
  const source = state ?? {};

  return {
    phoneNumber: String(source.phoneNumber ?? "").trim(),
    sendMode: source.sendMode === "auto" ? "auto" : "preview",
    previewChatMessage: source.previewChatMessage === true,
    hasSession: source.hasSession === true,
    accountLabel: String(source.accountLabel ?? "").trim(),
    authError: String(source.authError ?? "").trim(),
  };
}

function readEmbeddedState() {
  try {
    const params = new URLSearchParams(globalThis.location?.search ?? "");
    const raw = params.get("state");
    return raw ? JSON.parse(decodeURIComponent(raw)) : {};
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizePersistedState(state)));
}

function getBridge() {
  if (globalThis.PebbleConfigBridge && typeof globalThis.PebbleConfigBridge.submit === "function") {
    return globalThis.PebbleConfigBridge;
  }

  return {
    submit(payload) {
      try {
        globalThis.location.href = "pebblejs://close#" + encodeURIComponent(JSON.stringify(payload));
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
  document.querySelector("#phone-number").value = state.phoneNumber;
  document.querySelector("#login-code").value = state.loginCode;
  document.querySelector("#password").value = state.password;
  document.querySelector(`#send-mode-${state.sendMode}`)?.setAttribute("checked", "checked");
  document.querySelector(`#send-mode-${state.sendMode}`)?.click();
  document.querySelector("#preview-chat-message").checked = state.previewChatMessage === true;
  setSessionState(state);
}

function setInitialStatus(state) {
  if (state.authError) {
    setStatus(`Last sign-in failed: ${state.authError}`, "error");
    return;
  }

  setStatus(
    state.hasSession ? "Current PKJS session loaded." : "Save changes to update settings or sign in.",
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

  document.querySelector("#save-login").addEventListener("click", () => {
    const nextState = readFormState();
    currentState = { ...currentState, ...nextState, authError: "" };
    saveState(currentState);
    getBridge().submit({ action: "config:save", state: nextState });
    setStatus(
      nextState.phoneNumber && nextState.loginCode
        ? "Closing to save settings and sign in."
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

const STORAGE_KEY = "tg_pebble:config_state";

const DEFAULT_STATE = Object.freeze({
  phoneNumber: "",
  loginCode: "",
  password: "",
  sendMode: "preview",
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch (_error) {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getBridge() {
  return globalThis.PebbleConfigBridge ?? {
    submit(_payload) {},
  };
}

function setStatus(message, kind = "info") {
  const banner = document.querySelector("#status-banner");
  banner.textContent = message;
  banner.dataset.kind = kind;
}

function readFormState() {
  return {
    phoneNumber: document.querySelector("#phone-number").value.trim(),
    loginCode: document.querySelector("#login-code").value.trim(),
    password: document.querySelector("#password").value,
    sendMode: document.querySelector('input[name="send-mode"]:checked').value,
  };
}

function writeFormState(state) {
  document.querySelector("#phone-number").value = state.phoneNumber;
  document.querySelector("#login-code").value = state.loginCode;
  document.querySelector("#password").value = state.password;
  document.querySelector(`#send-mode-${state.sendMode}`)?.setAttribute("checked", "checked");
  document.querySelector(`#send-mode-${state.sendMode}`)?.click();
}

function reveal(buttonId) {
  document.querySelector(buttonId).classList.remove("hidden");
}

function hide(buttonId) {
  document.querySelector(buttonId).classList.add("hidden");
}

function validateLogin(state) {
  return state.phoneNumber.length > 0 && state.loginCode.length > 0;
}

function bootstrap() {
  const state = loadState();
  writeFormState(state);

  document.querySelectorAll('input[name="send-mode"]').forEach((node) => {
    node.addEventListener("change", () => {
      const nextState = readFormState();
      saveState(nextState);
      getBridge().submit({ action: "settings:update", state: nextState });
      setStatus(`Send mode saved: ${nextState.sendMode}`, "success");
    });
  });

  document.querySelector("#save-login").addEventListener("click", () => {
    const nextState = readFormState();

    if (!validateLogin(nextState)) {
      setStatus("Phone number and login code are required.", "error");
      return;
    }

    saveState(nextState);
    getBridge().submit({ action: "auth:save", state: nextState });
    setStatus("Login details saved locally.", "success");
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


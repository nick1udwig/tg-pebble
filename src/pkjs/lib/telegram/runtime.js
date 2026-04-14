if (typeof globalThis.self === "undefined") {
  globalThis.self = globalThis;
}

if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

if (typeof globalThis.window.addEventListener !== "function") {
  globalThis.window.addEventListener = function() {};
}

if (typeof globalThis.window.removeEventListener !== "function") {
  globalThis.window.removeEventListener = function() {};
}

if (typeof globalThis.window.dispatchEvent !== "function") {
  globalThis.window.dispatchEvent = function() {
    return false;
  };
}

if (typeof globalThis.navigator === "undefined") {
  globalThis.navigator = {
    onLine: true,
    userAgent: "TG Pebble PKJS"
  };
}

if (typeof globalThis.window.navigator === "undefined") {
  globalThis.window.navigator = globalThis.navigator;
}

if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = {};
}

if (typeof globalThis.crypto.getRandomValues !== "function") {
  globalThis.crypto.getRandomValues = function(values) {
    var index;

    for (index = 0; index < values.length; index += 1) {
      values[index] = Math.floor(Math.random() * 256);
    }

    return values;
  };
}

if (typeof globalThis.window.crypto === "undefined") {
  globalThis.window.crypto = globalThis.crypto;
}

if (typeof globalThis.Response === "undefined") {
  globalThis.Response = function(body) {
    this._body = body;
  };

  globalThis.Response.prototype.arrayBuffer = function() {
    var body = this._body;
    var view;
    var bytes;
    var index;

    if (body == null) {
      return Promise.resolve(new ArrayBuffer(0));
    }

    if (String(body) === "[object ArrayBuffer]") {
      return Promise.resolve(body);
    }

    if (typeof ArrayBuffer !== "undefined" && typeof ArrayBuffer.isView === "function" && ArrayBuffer.isView(body)) {
      view = new Uint8Array(body.buffer, body.byteOffset || 0, body.byteLength || body.length || 0);
      return Promise.resolve(view.slice().buffer);
    }

    if (typeof body.length === "number") {
      bytes = new Uint8Array(body.length);
      for (index = 0; index < body.length; index += 1) {
        bytes[index] = body[index] & 255;
      }
      return Promise.resolve(bytes.buffer);
    }

    return Promise.resolve(new ArrayBuffer(0));
  };
}

if (typeof globalThis.window.Response === "undefined") {
  globalThis.window.Response = globalThis.Response;
}

if (typeof globalThis.WebSocket === "function" && globalThis.WebSocket.__tgPebbleWrapped !== true) {
  (function() {
    var NativeWebSocket = globalThis.WebSocket;

    function createSyntheticEvent(type) {
      return { type: type };
    }

    function WebSocketWrapper(url, protocols) {
      var socket = protocols ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
      var listeners = {
        open: [],
        message: [],
        error: [],
        close: []
      };
      var pending = [];
      var openObserved = false;
      var wrapper = {};

      function hasListeners(kind) {
        return typeof wrapper["on" + kind] === "function" || listeners[kind].length > 0;
      }

      function emit(kind, event) {
        var handler = wrapper["on" + kind];
        var index;

        if (typeof handler === "function") {
          handler.call(wrapper, event);
        }

        for (index = 0; index < listeners[kind].length; index += 1) {
          listeners[kind][index].call(wrapper, event);
        }
      }

      function flushPending(kind) {
        var nextPending = [];
        var index;
        var entry;

        for (index = 0; index < pending.length; index += 1) {
          entry = pending[index];
          if ((!kind || entry.kind === kind) && hasListeners(entry.kind)) {
            emit(entry.kind, entry.event);
          } else {
            nextPending.push(entry);
          }
        }

        pending = nextPending;
      }

      function dispatch(kind, event) {
        if (kind === "open") {
          openObserved = true;
        }

        if (!hasListeners(kind)) {
          pending.push({ kind: kind, event: event });
          return;
        }

        emit(kind, event);
      }

      function replayOpenIfNeeded() {
        if (!openObserved && socket.readyState === NativeWebSocket.OPEN) {
          dispatch("open", createSyntheticEvent("open"));
        }
      }

      socket.onopen = function(event) {
        dispatch("open", event || createSyntheticEvent("open"));
      };
      socket.onmessage = function(event) {
        dispatch("message", event || createSyntheticEvent("message"));
      };
      socket.onerror = function(event) {
        dispatch("error", event || createSyntheticEvent("error"));
      };
      socket.onclose = function(event) {
        dispatch("close", event || createSyntheticEvent("close"));
      };

      wrapper.send = function(data) {
        return socket.send(data);
      };
      wrapper.close = function(code, reason) {
        return socket.close(code, reason);
      };
      wrapper.addEventListener = function(kind, listener) {
        if (!listeners[kind] || typeof listener !== "function") {
          return;
        }

        listeners[kind].push(listener);
        if (kind === "open") {
          replayOpenIfNeeded();
        }
        flushPending(kind);
      };
      wrapper.removeEventListener = function(kind, listener) {
        var index;

        if (!listeners[kind] || typeof listener !== "function") {
          return;
        }

        for (index = listeners[kind].length - 1; index >= 0; index -= 1) {
          if (listeners[kind][index] === listener) {
            listeners[kind].splice(index, 1);
          }
        }
      };

      Object.defineProperty(wrapper, "readyState", {
        enumerable: true,
        get: function() {
          return socket.readyState;
        }
      });
      Object.defineProperty(wrapper, "bufferedAmount", {
        enumerable: true,
        get: function() {
          return socket.bufferedAmount;
        }
      });
      Object.defineProperty(wrapper, "extensions", {
        enumerable: true,
        get: function() {
          return socket.extensions;
        }
      });
      Object.defineProperty(wrapper, "protocol", {
        enumerable: true,
        get: function() {
          return socket.protocol;
        }
      });
      Object.defineProperty(wrapper, "binaryType", {
        enumerable: true,
        get: function() {
          return socket.binaryType;
        },
        set: function(value) {
          socket.binaryType = value;
        }
      });
      ["open", "message", "error", "close"].forEach(function(kind) {
        Object.defineProperty(wrapper, "on" + kind, {
          enumerable: true,
          get: function() {
            return wrapper["__on" + kind] || null;
          },
          set: function(listener) {
            wrapper["__on" + kind] = listener;
            if (kind === "open") {
              replayOpenIfNeeded();
            }
            flushPending(kind);
          }
        });
      });

      replayOpenIfNeeded();
      return wrapper;
    }

    ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(function(name) {
      if (NativeWebSocket[name] !== undefined) {
        WebSocketWrapper[name] = NativeWebSocket[name];
      }
    });
    WebSocketWrapper.__tgPebbleWrapped = true;

    globalThis.WebSocket = WebSocketWrapper;
    globalThis.window.WebSocket = WebSocketWrapper;
  })();
}

var runtime = require("./runtime_bundle");

module.exports = {
  Api: runtime.Api,
  TelegramClient: runtime.TelegramClient,
  StringSession: runtime.StringSession
};

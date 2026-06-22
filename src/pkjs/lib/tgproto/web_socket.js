"use strict";

function toUint8Array(data) {
  if (data instanceof Uint8Array) {
    return data;
  }

  if (data && data.buffer && data.byteLength !== undefined) {
    return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength);
  }

  return new Uint8Array(data || []);
}

function NativeWebSocketStream(url, protocols) {
  this.url = url;
  this.protocols = protocols;
  this.socket = null;
  this.closed = true;
  this.queue = [];
  this.waiters = [];
}

NativeWebSocketStream.prototype.connect = function() {
  var self = this;

  if (typeof WebSocket !== "function") {
    return Promise.reject(new Error("WebSocket is unavailable."));
  }

  return new Promise(function(resolve, reject) {
    var socket;
    var settled = false;

    try {
      socket = self.protocols ? new WebSocket(self.url, self.protocols) : new WebSocket(self.url);
      socket.binaryType = "arraybuffer";
    } catch (error) {
      reject(error);
      return;
    }

    self.socket = socket;
    self.closed = false;

    socket.onopen = function() {
      if (!settled) {
        settled = true;
        resolve(self);
      }
    };
    socket.onerror = function(error) {
      if (!settled) {
        settled = true;
        reject(error);
        return;
      }
      self._fail(error || new Error("WebSocket error."));
    };
    socket.onclose = function() {
      self.closed = true;
      self._fail(new Error("WebSocket was closed."));
    };
    socket.onmessage = function(event) {
      self._push(toUint8Array(event.data));
    };
  });
};

NativeWebSocketStream.prototype._push = function(bytes) {
  var waiter;

  if (!bytes || bytes.length === 0) {
    return;
  }

  this.queue.push(bytes);
  while (this.waiters.length > 0) {
    waiter = this.waiters.shift();
    waiter();
  }
};

NativeWebSocketStream.prototype._fail = function(error) {
  var waiter;

  this.error = error || new Error("WebSocket stream failed.");
  while (this.waiters.length > 0) {
    waiter = this.waiters.shift();
    waiter();
  }
};

NativeWebSocketStream.prototype.read = function(size) {
  var self = this;

  function attempt() {
    var first;
    var out;

    if (self.queue.length > 0) {
      first = self.queue[0];
      if (first.length <= size) {
        self.queue.shift();
        return Promise.resolve(first);
      }
      out = first.slice(0, size);
      self.queue[0] = first.slice(size);
      return Promise.resolve(out);
    }

    if (self.error) {
      return Promise.reject(self.error);
    }

    return new Promise(function(resolve, reject) {
      self.waiters.push(function() {
        attempt().then(resolve, reject);
      });
    });
  }

  return attempt();
};

NativeWebSocketStream.prototype.readExactly = function(size) {
  var self = this;
  var parts = [];
  var total = 0;

  function next() {
    if (total >= size) {
      return require("./bytes").concatBytes(parts);
    }

    return self.read(size - total).then(function(part) {
      parts.push(part);
      total += part.length;
      return next();
    });
  }

  return Promise.resolve().then(next);
};

NativeWebSocketStream.prototype.write = function(bytes) {
  if (this.closed || !this.socket) {
    throw new Error("WebSocket is closed.");
  }

  this.socket.send(bytes);
};

NativeWebSocketStream.prototype.close = function() {
  this.closed = true;
  if (this.socket) {
    this.socket.close();
  }
};

function buildTelegramWebSocketUrl(endpoint, testServers) {
  var host = endpoint.host;
  var port = Number(endpoint.port || 443);
  var scheme = port === 443 ? "wss" : "ws";

  return scheme + "://" + host + ":" + port + "/apiws" + (testServers === true ? "_test" : "");
}

module.exports = {
  NativeWebSocketStream: NativeWebSocketStream,
  buildTelegramWebSocketUrl: buildTelegramWebSocketUrl
};

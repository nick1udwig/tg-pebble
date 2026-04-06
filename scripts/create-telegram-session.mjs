#!/usr/bin/env node

import readline from "node:readline";

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

async function main() {
  const apiId = Number.parseInt(String(process.env.TG_API_ID || ""), 10);
  const apiHash = String(process.env.TG_API_HASH || "");
  const useWSS = process.env.TG_TEST_USE_WSS === "1" || process.env.TG_TEST_USE_WSS === "true";
  const testServers = process.env.TG_TEST_SERVERS === "1" || process.env.TG_TEST_SERVERS === "true";

  if (!Number.isFinite(apiId) || !apiHash) {
    throw new Error("TG_API_ID and TG_API_HASH must be set before creating a Telegram session.");
  }

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 3,
    requestRetries: 3,
    reconnectRetries: 0,
    useWSS,
    testServers,
  });

  try {
    await client.start({
      phoneNumber: async () => ask("Phone: "),
      password: async () => ask("2FA password (press Enter if none): "),
      phoneCode: async () => ask("Code: "),
      onError: async (error) => {
        throw error;
      },
    });

    console.log("");
    console.log("TG_SESSION_STRING=" + client.session.save());
  } finally {
    await client.disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});

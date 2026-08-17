#!/usr/bin/env node

import { parseWebArguments, startDashboard } from "../src/dashboard.js";

const [command, ...args] = process.argv.slice(2);

if (command === "web") {
  try {
    await startDashboard(process.cwd(), parseWebArguments(args));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} else {
  console.error("Usage: cs web [--port <port>] [--no-open]");
  process.exitCode = 1;
}

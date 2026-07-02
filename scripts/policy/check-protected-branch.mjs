#!/usr/bin/env node
/**
 * Shared policy: block commits / direct pushes to protected branches.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const PROTECTED = ["main", "master", "develop"];
const ZERO_SHA = "0".repeat(40);

const args = process.argv.slice(2);
const isPrePush = args.includes("--pre-push");
const warnOnly = args.includes("--warn-only");

function getCurrentBranch() {
  try {
    return execSync("git branch --show-current", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function fail(message) {
  if (warnOnly) {
    console.warn(`[policy] ${message}`);
    process.exit(0);
  }
  console.error(message);
  process.exit(1);
}

function checkCommit() {
  const branch = getCurrentBranch();
  if (!branch) return;
  if (PROTECTED.includes(branch)) {
    fail(`Blocked: direct commits on protected branch "${branch}". Use feat/<name> branch.`);
  }
}

function checkPush() {
  const input = fs.readFileSync(0, "utf8");
  const lines = input.trim() ? input.trim().split("\n") : [];
  for (const line of lines) {
    const parts = line.split(" ");
    if (parts.length < 4) continue;
    const [, localSha, remoteRef] = parts;
    if (!remoteRef.startsWith("refs/heads/")) continue;
    const branchName = remoteRef.replace("refs/heads/", "");
    if (!PROTECTED.includes(branchName)) continue;
    if (localSha === ZERO_SHA) continue;
    fail(`Blocked: direct push to protected branch "${branchName}". Use PR.`);
  }
}

try {
  if (isPrePush) checkPush();
  else checkCommit();
} catch (err) {
  console.error(err);
  process.exit(1);
}

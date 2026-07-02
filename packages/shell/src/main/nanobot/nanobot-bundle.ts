import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveResourcesPath } from "../core/platform-paths.js";

export type NanobotBundleLayout = "packaged" | "dev-checkout";

export type NanobotBundleRef = {
  root: string;
  layout: NanobotBundleLayout;
  pythonExe: string;
  nanobotModulePath: string | null;
};

const DEV_ROOT_ENV = "BYCLAW_NANOBOT_DEV_ROOT";
const DEV_PYTHON_ENV = "BYCLAW_NANOBOT_DEV_PYTHON";

function pythonExecutableInDir(dir: string): string | null {
  const names = process.platform === "win32" ? ["python.exe", "python"] : ["python", "python.exe"];
  for (const name of names) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function shellResourceCandidates(relativePath: string): string[] {
  const resourcesPath = resolveResourcesPath();
  const bundledMainDir = path.dirname(fileURLToPath(import.meta.url));
  const cwd = process.cwd();
  return [
    resourcesPath ? path.join(resourcesPath, relativePath) : null,
    path.join(bundledMainDir, "../../resources", relativePath),
    path.join(cwd, "resources", relativePath),
    path.join(cwd, "packages", "shell", "resources", relativePath),
  ].filter((p): p is string => Boolean(p));
}

function devCheckoutCandidates(): string[] {
  const candidates: string[] = [];
  const envRoot = process.env[DEV_ROOT_ENV]?.trim();
  if (envRoot) {
    candidates.push(path.resolve(envRoot));
  }
  const bundledMainDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(bundledMainDir, "../../../..");
  candidates.push(path.resolve(repoRoot, "../nanobot"));
  candidates.push(path.resolve(repoRoot, "nanobot"));
  return [...new Set(candidates)];
}

function resolvePackagedBundle(root: string): NanobotBundleRef | null {
  const pythonExe = pythonExecutableInDir(root);
  if (!pythonExe) return null;
  // Check for nanobot module
  const nanobotModulePath = path.join(root, "Lib", "site-packages", "nanobot");
  const hasNanobot = fs.existsSync(nanobotModulePath) || fs.existsSync(path.join(root, "nanobot"));
  return {
    root,
    layout: "packaged",
    pythonExe,
    nanobotModulePath: hasNanobot ? nanobotModulePath : null,
  };
}

function resolveDevCheckoutBundle(root: string): NanobotBundleRef | null {
  const pythonExe = pythonExecutableInDir(root);
  if (!pythonExe) return null;
  return {
    root,
    layout: "dev-checkout",
    pythonExe,
    nanobotModulePath: path.join(root, "nanobot"),
  };
}

function devPythonOverride(): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  const override = process.env[DEV_PYTHON_ENV]?.trim();
  if (override && fs.existsSync(override)) return override;
  return null;
}

/** Resolve nanobot bundle (from user-provided zip or dev checkout). */
export function resolveNanobotBundle(): NanobotBundleRef | null {
  // Check dev Python override first
  const devPython = devPythonOverride();
  if (devPython) {
    return {
      root: path.dirname(devPython),
      layout: "dev-checkout",
      pythonExe: devPython,
      nanobotModulePath: null,
    };
  }

  // Check packaged locations
  const packagedRoots = [
    ...shellResourceCandidates("nanobot-bundle"),
    ...shellResourceCandidates("python"),
  ];

  for (const root of packagedRoots) {
    const bundle = resolvePackagedBundle(root);
    if (bundle) return bundle;
  }

  // Check nanobot-bundle dir (user's zip extracted here)
  for (const root of shellResourceCandidates("nanobot-bundle")) {
    const bundle = resolvePackagedBundle(root);
    if (bundle) return bundle;
  }

  if (process.env.NODE_ENV === "development") {
    for (const root of devCheckoutCandidates()) {
      const bundle = resolveDevCheckoutBundle(root);
      if (bundle) return bundle;
    }
  }

  return null;
}

export function resolveNanobotPythonExecutable(bundleRef?: NanobotBundleRef | null): string | null {
  if (bundleRef?.pythonExe && fs.existsSync(bundleRef.pythonExe)) {
    return bundleRef.pythonExe;
  }

  // Search in resources
  for (const dir of shellResourceCandidates("python")) {
    const exe = pythonExecutableInDir(dir);
    if (exe) return exe;
  }
  for (const dir of shellResourceCandidates("nanobot-bundle")) {
    const exe = pythonExecutableInDir(dir);
    if (exe) return exe;
  }

  return null;
}

export function describeNanobotBundle(bundle: NanobotBundleRef | null): string {
  if (!bundle) return "missing";
  return `${bundle.layout}@${bundle.root}`;
}

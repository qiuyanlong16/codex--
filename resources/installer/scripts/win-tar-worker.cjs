/**
 * Parallel tar shard worker — extracts a single tar file in a worker thread.
 * Used by unpack-python-venv-parallel.cjs when tar.exe is not available.
 */
const { workerData, parentPort } = require("node:worker_threads");
const path = require("node:path");
const fs = require("node:fs");

if (!parentPort) {
  throw new Error("win-tar-worker.cjs must be run as a Worker");
}

const { tarFile, cwd } = workerData;

function loadTar() {
  // Try installer-scripts node_modules first, then fall back to bundled location
  const scriptDir = path.dirname(__filename);
  const candidates = [
    path.join(scriptDir, "node_modules", "tar"),
    path.join(scriptDir, "..", "node_modules", "tar"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "index.js")) || fs.existsSync(path.join(c, "package.json"))) {
      return require(c);
    }
  }
  throw new Error("tar module not found in " + candidates.join(", "));
}

try {
  const tar = loadTar();
  const startTime = Date.now();
  tar.extract({ file: tarFile, cwd, sync: true });
  parentPort.postMessage({ success: true, duration: Date.now() - startTime, tarFile });
} catch (err) {
  parentPort.postMessage({
    success: false,
    error: err.message || String(err),
    tarFile,
  });
}

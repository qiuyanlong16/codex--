/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * electron-builder afterPack hook.
 *
 * 职责：
 *   1. 裁剪 Chromium locale 文件 —— 只保留中英文，删除其余 ~52 个语言包。
 *      每个架构可节省 ~44 MB（未压缩），安装包体积约减少 30-40 MB/架构。
 *
 * electron-builder 会对每个 arch（x64、arm64）各调用一次此钩子。
 */

const fs = require("node:fs");
const path = require("node:path");

/** 保留的 locale 文件（Chromium .pak 格式） */
const KEEP_LOCALES = new Set(["en-US.pak", "zh-CN.pak", "zh-TW.pak"]);

module.exports = async function postBuildHook(context) {
  const platform = context?.electronPlatformName ?? "unknown";
  const appOutDir = context?.appOutDir ?? "unknown";
  const arch = context?.arch ?? "unknown";

  console.log(`[post-build] platform=${platform} arch=${arch} outDir=${appOutDir}`);

  // ── 1. 裁剪 locale 文件 ──────────────────────────────────────────────────
  const localesDir = path.join(appOutDir, "locales");
  if (!fs.existsSync(localesDir)) {
    console.log(`[post-build] locales dir not found, skipping trim: ${localesDir}`);
    return;
  }

  const files = fs.readdirSync(localesDir);
  let removed = 0;
  let kept = 0;
  let savedBytes = 0;

  for (const file of files) {
    if (!file.endsWith(".pak")) continue;
    const filePath = path.join(localesDir, file);
    if (KEEP_LOCALES.has(file)) {
      kept++;
    } else {
      const size = fs.statSync(filePath).size;
      fs.unlinkSync(filePath);
      savedBytes += size;
      removed++;
    }
  }

  const savedMB = (savedBytes / 1024 / 1024).toFixed(2);
  console.log(`[post-build] locale trim done: kept=${kept} removed=${removed} saved=${savedMB} MB`);
};

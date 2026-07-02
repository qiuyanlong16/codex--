<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

const MIN_SPLASH_MS = 1500;

const progress = ref(8);
const hintPhase = ref<"warmup" | "waiting" | "starting">("warmup");
const errorCode = ref("");
const showDevContinue = ref(false);
const engineLine = ref("");
const startupComplete = ref(false);
const brandLetters = ["B", "y", "N", "a", "n", "o", "b", "o", "t"] as const;

const splashStartedAt = Date.now();
let enterTimer: ReturnType<typeof setTimeout> | undefined;
let unsubReady: (() => void) | undefined;
let unsubFailed: (() => void) | undefined;
let progressTimer: ReturnType<typeof setInterval> | undefined;
let hintTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let engineTimer: ReturnType<typeof setInterval> | undefined;

const hintText = computed(() => {
  if (errorCode.value) return "启动失败";
  if (startupComplete.value) return "正在加载...";
  switch (hintPhase.value) {
    case "warmup":
      return "正在初始化...";
    case "starting":
      return "正在启动 nanobot...";
    case "waiting":
      return "等待 nanobot 就绪...";
    default:
      return "正在初始化...";
  }
});

function scheduleEnterWebUI() {
  const elapsed = Date.now() - splashStartedAt;
  const delay = Math.max(0, MIN_SPLASH_MS - elapsed);
  if (enterTimer) clearTimeout(enterTimer);
  enterTimer = setTimeout(() => {
    progress.value = 100;
    if (progressTimer) clearInterval(progressTimer);
    // The main process will handle loadURL to the nanobot WebUI
  }, delay);
}

function markStartupComplete() {
  if (startupComplete.value) return;
  startupComplete.value = true;
  hintPhase.value = "waiting";
  progress.value = Math.max(progress.value, 78);
  scheduleEnterWebUI();
}

function showStartupError(code: string) {
  errorCode.value = code;
  hintPhase.value = "waiting";
  if (progressTimer) clearInterval(progressTimer);
  progress.value = Math.max(progress.value, 85);
  showDevContinue.value =
    import.meta.env.DEV &&
    (code === "nanobot_bundle_missing" ||
      code === "nanobot_not_ready" ||
      code === "python_missing" ||
      code === "nanobot_missing" ||
      code === "nanobot_gateway_readyz_timeout" ||
      code === "startup_failed");
}

async function refreshEngineStatus() {
  try {
    const info = await window.electronAPI.app.getInfo();
    engineLine.value = `nanobot: ${info.version ?? "unknown"}`;
  } catch {
    engineLine.value = "等待 nanobot...";
  }
}

function continueToUiOnly() {
  markStartupComplete();
}

onMounted(() => {
  progressTimer = setInterval(() => {
    if (progress.value < 72 && !errorCode.value && !startupComplete.value) {
      progress.value += 1;
    }
  }, 280);

  hintTimer = setTimeout(() => {
    if (!errorCode.value && !startupComplete.value) hintPhase.value = "waiting";
  }, 5000);

  unsubFailed = window.electronAPI.startup.onFailed((payload) => {
    showStartupError(payload.code);
  });
  unsubReady = window.electronAPI.startup.onReady(() => {
    void refreshEngineStatus();
    markStartupComplete();
  });

  void refreshEngineStatus();
  engineTimer = setInterval(() => {
    void refreshEngineStatus();
  }, 600);

  pollTimer = setInterval(() => {
    void window.electronAPI.startup.getState().then((snap) => {
      if (snap.phase === "ready") markStartupComplete();
      else if (snap.phase === "failed" && snap.failedEvent) {
        showStartupError(snap.failedEvent.code);
      }
    });
  }, 400);
});

onUnmounted(() => {
  unsubReady?.();
  unsubFailed?.();
  if (progressTimer) clearInterval(progressTimer);
  if (hintTimer) clearTimeout(hintTimer);
  if (pollTimer) clearInterval(pollTimer);
  if (engineTimer) clearInterval(engineTimer);
  if (enterTimer) clearTimeout(enterTimer);
});
</script>

<template>
  <div class="splash">
    <div class="splash-center">
      <div class="logo-card" aria-hidden="true">
        <div class="logo-placeholder">NB</div>
      </div>
      <h1 class="headline">
        <span class="brand-word" aria-label="ByNanobot">
          <span
            v-for="(letter, idx) in brandLetters"
            :key="`${letter}-${idx}`"
            class="brand-letter"
            :class="{ 'brand-letter--first': idx === 0 }"
            :style="{ '--i': idx }"
          >
            {{ letter }}
          </span>
        </span>
      </h1>
      <div
        class="progress-track"
        role="progressbar"
        :aria-valuenow="progress"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="progress-fill" :style="{ width: `${progress}%` }" />
      </div>
      <p class="hint">{{ hintText }}</p>
      <p v-if="engineLine && !errorCode" class="engine-status">{{ engineLine }}</p>
      <p v-if="errorCode" class="error">启动失败: {{ errorCode }}</p>
      <button v-if="showDevContinue" type="button" class="continue-btn" @click="continueToUiOnly">
        继续 (开发模式)
      </button>
    </div>
  </div>
</template>

<style scoped>
.splash {
  box-sizing: border-box;
  position: relative;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(58% 44% at 12% 0%, rgba(232, 221, 214, 0.28), transparent 72%),
    radial-gradient(48% 32% at 82% 8%, rgba(236, 228, 220, 0.24), transparent 74%),
    linear-gradient(180deg, #f4f3f1 0%, #f5f4f3 100%);
}

.splash-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.95rem;
  width: min(520px, 100%);
  margin: 0 auto;
  padding: 1rem 2rem 2rem;
}

.logo-card {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 84px;
  height: 84px;
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(236, 232, 227, 0.9);
  box-shadow: 0 16px 34px rgba(167, 143, 128, 0.2);
}

.logo-placeholder {
  font-size: 1.6rem;
  font-weight: 700;
  color: #d37369;
}

.headline {
  margin: 0;
  font-size: 2.2rem;
  font-weight: 700;
  text-align: center;
  color: #12151d;
}

.brand-word {
  display: inline-flex;
  margin: 0 0.12em;
}

.brand-letter {
  display: inline-block;
  animation: brand-glow 2.4s ease-in-out infinite;
  animation-delay: calc(var(--i) * 0.11s);
}

.progress-track {
  width: min(360px, 88vw);
  height: 6px;
  border-radius: 999px;
  background: rgba(231, 223, 217, 0.8);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #edc0bb 0%, #d37369 100%);
  transition: width 0.35s ease;
}

.hint {
  margin: 0;
  font-size: 0.9rem;
  color: #8f8a84;
  text-align: center;
}

.engine-status {
  margin: 0;
  font-size: 0.82rem;
  color: #6f6a64;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.error {
  margin: 0;
  color: #c0392b;
  font-size: 0.9rem;
  text-align: center;
  max-width: 360px;
}

.continue-btn {
  margin-top: 0.25rem;
  border: 1px solid #e8e4dc;
  border-radius: 999px;
  padding: 0.45rem 1rem;
  background: #fff;
  cursor: pointer;
  font-size: 0.88rem;
}

@keyframes brand-glow {
  0%,
  100% {
    opacity: 0.85;
  }
  50% {
    opacity: 1;
    color: #d37369;
  }
}
</style>

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import "./styles.css";

document.documentElement.dataset.platform =
  typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent) ? "win32" : "other";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router).mount("#app");

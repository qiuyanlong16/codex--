import { createRouter, createWebHashHistory } from "vue-router";
import SplashView from "./views/SplashView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: "/:pathMatch(.*)*", component: SplashView }],
});

<script setup lang="ts">
import { RouterView } from "vue-router";
</script>

<template>
  <div class="app-root">
    <RouterView />
  </div>
</template>

<style scoped>
.app-root {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>

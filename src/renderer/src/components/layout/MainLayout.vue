<script setup lang="ts">
</script>

<template>
  <div class="main-layout">
    <aside class="layout-sidebar">
      <Sidebar />
    </aside>
    <div class="layout-body">
      <TopBar />
      <main class="layout-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script lang="ts">
import Sidebar from './Sidebar.vue'
import TopBar from './TopBar.vue'

export default {
  components: { Sidebar, TopBar }
}
</script>

<style scoped>
.main-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
}

.layout-sidebar {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--n-border-color, #e0e0e6);
  background: var(--n-color, #fff);
}

.layout-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.layout-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}
</style>

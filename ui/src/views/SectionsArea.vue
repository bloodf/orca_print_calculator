<script setup lang="ts">
// Left column, bottom: the five cost sections, collapsed by default (T4.4 bodies).
import ExtrasSection from "../components/costs/ExtrasSection.vue";
import LaborSection from "../components/costs/LaborSection.vue";
import MachineSection from "../components/costs/MachineSection.vue";
import SalesSection from "../components/costs/SalesSection.vue";
import ShippingSection from "../components/costs/ShippingSection.vue";
</script>

<template>
  <div class="sections-area">
    <MachineSection /><LaborSection /><ExtrasSection /><ShippingSection /><SalesSection />
  </div>
</template>

<style scoped>
.sections-area { display: grid; grid-template-columns: minmax(0, 1fr); grid-row-gap: 8px; }
</style>

<script setup lang="ts">
// Extras and stock: the extras catalog with counts on hand, and a read-only filament summary from Spoolman.
import { computed } from "vue";
import ExtrasCatalog from "../components/settings/ExtrasCatalog.vue";
import { gotoSettings } from "../components/costs/shared";
import { grams } from "../format";
import { intlLocale, t } from "../i18n";
import { store } from "../state/store";

const connected = computed(() => store.spoolman.state === "ok");
const filaments = computed(() => {
  const { filaments: fs, spools } = store.spoolman.data;
  return fs.map((f) => {
    const mine = spools.filter((s) => s.filamentId === f.id && !s.archived);
    const known = mine.map((s) => s.remainingWeight).filter((w): w is number => typeof w === "number" && Number.isFinite(w));
    return {
      id: f.id, name: f.name, type: [f.vendor, f.material].filter(Boolean).join(" · "), spools: mine.length,
      remaining: known.length ? grams(known.reduce((a, b) => a + b, 0), intlLocale()) : "—",
    };
  });
});
</script>

<template>
  <main class="stock">
    <h1 class="view-title" tabindex="-1" data-view-title>{{ t("nav.stock") }}</h1>
    <section class="grp" aria-labelledby="stock-extras-h">
      <h2 id="stock-extras-h" class="lg">{{ t("stock.extras") }}</h2>
      <p class="sm muted help">{{ t("stock.extrasHelp") }}</p>
      <ExtrasCatalog />
    </section>
    <section class="grp" aria-labelledby="stock-filament-h">
      <h2 id="stock-filament-h" class="lg">{{ t("stock.filament") }}</h2>
      <div v-if="!connected" class="off">
        <p class="muted">{{ t("stock.noSpoolman") }}</p>
        <button type="button" class="btn" @click="gotoSettings('settings-spoolman')">{{ t("stock.connect") }}</button>
      </div>
      <p v-else-if="!filaments.length" class="muted">{{ t("stock.noFilaments") }}</p>
      <div v-else class="wrap">
        <table aria-labelledby="stock-filament-h" data-testid="filament-table">
          <thead>
            <tr>
              <th scope="col">{{ t("stock.col.name") }}</th><th scope="col">{{ t("stock.col.type") }}</th>
              <th scope="col" class="r">{{ t("stock.col.spools") }}</th><th scope="col" class="r">{{ t("stock.col.remaining") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in filaments" :key="f.id">
              <td>{{ f.name }}</td><td class="muted">{{ f.type }}</td><td class="num r">{{ f.spools }}</td><td class="num r">{{ f.remaining }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<style scoped>
.stock { padding: 16px; max-width: 900px; }
.grp { padding: 24px 0; border-top: 1px solid var(--opc-border); }
.grp:first-of-type { border-top: 0; padding-top: 12px; }
.grp > h2 { margin-bottom: 4px; }
.grp > .help { margin-bottom: 12px; }
.grp > h2 + :not(.help) { margin-top: 12px; }
.off > * + * { margin-top: 8px; }
.wrap { overflow-x: auto; border: 1px solid var(--opc-border); border-radius: var(--opc-r-surface); }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 500; color: var(--opc-muted); padding: 6px 8px; border-bottom: 1px solid var(--opc-border); }
td { height: 36px; padding: 0 8px; border-bottom: 1px solid var(--opc-border); }
tbody tr:last-child td { border-bottom: 0; }
th.r, td.r { text-align: right; }
</style>

<script setup lang="ts">
// Extras and stock: the extras catalog with counts on hand, and a read-only filament summary from Spoolman.
import Button from "primevue/button";
import { computed } from "vue";
import { materialTone, OuiBanner, OuiEmpty, OuiIcon, OuiPanel, OuiSwatch } from "../../shared/src/components";
import * as I from "../../shared/src/icons";
import { lead } from "../components/base/lead";
import ExtrasCatalog from "../components/settings/ExtrasCatalog.vue";
import { gotoSettings } from "../components/costs/shared";
import { grams, safeColor } from "../format";
import { intlLocale, t } from "../i18n";
import { fetchSpoolman, store } from "../state/store";

const connected = computed(() => store.spoolman.state === "ok");
// A configured Spoolman that does not answer is not "not connected": say so, and offer the retry instead of the first-time setup.
const offline = computed(() => store.spoolman.state === "offline" && !!store.settings.spoolman.url);
const connecting = computed(() => store.spoolman.state === "connecting");
const filaments = computed(() => {
  const { filaments: fs, spools } = store.spoolman.data;
  return fs.map((f) => {
    const mine = spools.filter((s) => s.filamentId === f.id && !s.archived);
    const known = mine.map((s) => s.remainingWeight).filter((w): w is number => typeof w === "number" && Number.isFinite(w));
    return {
      id: f.id, name: f.name, vendor: f.vendor ?? "", material: f.material ?? "", color: safeColor(f.colorHex), spools: mine.length,
      remaining: known.length ? grams(known.reduce((a, b) => a + b, 0), intlLocale()) : "—",
    };
  });
});
const off = computed(() => lead(t("stock.offline", { url: store.settings.spoolman.url })));
</script>

<template>
  <main class="oui-page stock" tabindex="-1">
    <h2 class="oui-sr" tabindex="-1" data-view-title>{{ t("nav.stock") }}</h2>
    <div class="stock-grid">
      <OuiPanel :icon="I.parcel" tone="violet" aria-labelledby="stock-extras-h">
        <template #title><span id="stock-extras-h">{{ t("stock.extras") }}</span></template>
        <p class="oui-meta help">{{ t("stock.extrasHelp") }}</p>
        <ExtrasCatalog />
      </OuiPanel>
      <OuiPanel :icon="I.spool" tone="magenta" flush aria-labelledby="stock-filament-h">
        <template #title><span id="stock-filament-h">{{ t("stock.filament") }}</span></template>
        <template v-if="connected && filaments.length" #meta>{{ filaments.length }}</template>
        <div v-if="offline" class="off" data-stock-offline>
          <OuiBanner tone="warn" :title="off[0]" dismissible :dismiss-key="`spoolman-down:${store.settings.spoolman.url}`" :close-label="t('common.close')">
            {{ off[1] }}
            <template #actions>
              <Button severity="secondary" size="small" type="button" @click="fetchSpoolman(false)"><OuiIcon :icon="I.refresh" :size="14" /><span>{{ t("spoolman.retry") }}</span></Button>
              <Button text severity="secondary" size="small" type="button" @click="gotoSettings('settings-spoolman')">{{ t("nav.settings") }}</Button>
            </template>
          </OuiBanner>
        </div>
        <div v-else-if="connecting" role="status"><OuiEmpty compact state="loading" :title="t('spoolman.connecting')" /></div>
        <OuiEmpty v-else-if="!connected" compact :icon="I.spoolman" tone="magenta" :title="t('stock.noSpoolman')">
          <template #actions><Button severity="secondary" size="small" type="button" @click="gotoSettings('settings-spoolman')">{{ t("stock.connect") }}</Button></template>
        </OuiEmpty>
        <OuiEmpty v-else-if="!filaments.length" compact :icon="I.spool" tone="magenta" :title="t('stock.noFilaments')" />
        <div v-else class="opc-table-wrap list">
          <table class="opc-table" aria-labelledby="stock-filament-h" data-testid="filament-table">
            <thead>
              <tr>
                <th scope="col">{{ t("stock.col.name") }}</th><th scope="col">{{ t("stock.col.type") }}</th>
                <th scope="col" class="r">{{ t("stock.col.spools") }}</th><th scope="col" class="r">{{ t("stock.col.remaining") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in filaments" :key="f.id">
                <td><span class="fil"><OuiSwatch :color="f.color" :size="14" /><span class="oui-strong">{{ f.name }}</span></span></td>
                <td><span class="fil"><span v-if="f.material" class="oui-chip" :data-tone="materialTone(f.material)">{{ f.material }}</span><span class="oui-muted">{{ f.vendor }}</span></span></td>
                <td class="num r">{{ f.spools }}</td><td class="num r oui-strong">{{ f.remaining }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </OuiPanel>
    </div>
  </main>
</template>

<style scoped>
.stock:focus { outline: none; }
.stock-grid { display: grid; gap: var(--oui-s3); grid-template-columns: minmax(0, 1fr); align-items: start; }
@container oui-page (min-width: 1160px) { .stock-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
.help { margin-bottom: var(--oui-s3); max-width: 70ch; }
.off { padding: var(--oui-s3); }
.fil { display: inline-flex; align-items: center; gap: var(--oui-s2); }
</style>

<script setup lang="ts">
// Decorative SVG art bundled with the plugin (empty states, plate thumbnail), rendered as Vue nodes: no innerHTML, and the
// English role/aria-label the asset files carry is replaced by aria-hidden.
import { computed, h, type VNode } from "vue";

const props = defineProps<{ svg: string }>();
function toNode(el: Element): VNode {
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
  return h(el.tagName.toLowerCase(), attrs, Array.from(el.children).map(toNode));
}
const node = computed<VNode>(() => {
  const root = new DOMParser().parseFromString(props.svg, "image/svg+xml").documentElement;
  root.removeAttribute("role");
  root.removeAttribute("aria-label");
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("focusable", "false");
  return toNode(root);
});
const render = (): VNode => node.value;
</script>

<template><component :is="render" /></template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

definePageMeta({
  middleware: [
    (route) => {
      if (!route.query.page) {
        return navigateTo({ ...route, query: { ...route.query, page: '1' } });
      }
    }
  ]
});

const pdfPath = '/pdf-tests/pdf-01.pdf';
const overlaysPath = '/pdf-tests/empty-overlay.json';
const pageNumbers = [1, 2, 3, 4];
const viewerMountKey = ref(0);
const remountCount = ref(0);

const totalFetchCount = ref(0);
const pdfFetchCount = ref(0);
const overlayFetchCount = ref(0);
const baselineTotalFetchCount = ref(0);
const baselinePdfFetchCount = ref(0);
const baselineOverlayFetchCount = ref(0);

const dedupeStatus = computed(() => {
  if (pdfFetchCount.value === 0) return 'Waiting for PDF request...';
  if (pdfFetchCount.value === 1) return 'PASS: single PDF fetch shared across viewers';
  return `FAIL: expected 1 PDF fetch, got ${pdfFetchCount.value}`;
});

const remountViewers = () => {
  remountCount.value += 1;
  baselineTotalFetchCount.value = totalFetchCount.value;
  baselinePdfFetchCount.value = pdfFetchCount.value;
  baselineOverlayFetchCount.value = overlayFetchCount.value;
  viewerMountKey.value += 1;
};

const totalFetchesSinceRemount = computed(() => totalFetchCount.value - baselineTotalFetchCount.value);
const pdfFetchesSinceRemount = computed(() => pdfFetchCount.value - baselinePdfFetchCount.value);
const overlayFetchesSinceRemount = computed(() => overlayFetchCount.value - baselineOverlayFetchCount.value);

const normalizeRequestUrl = (input: RequestInfo | URL) => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

let restoreFetch: (() => void) | null = null;

if (import.meta.client) {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    totalFetchCount.value += 1;
    const url = normalizeRequestUrl(input);

    if (url.includes(pdfPath)) {
      pdfFetchCount.value += 1;
    }
    if (url.includes(overlaysPath)) {
      overlayFetchCount.value += 1;
    }

    return originalFetch(input, init);
  };

  restoreFetch = () => {
    window.fetch = originalFetch;
  };
}

onBeforeUnmount(() => {
  restoreFetch?.();
});
</script>

<template>
  <TestPanel
    heading="PDF 26 Fetch Dedupe Grid"
    description="Verifies global PDF byte dedupe by rendering multiple viewers on one shared PDF."
  >
    <div class="mb-4 rounded border p-3 text-sm">
      <div><strong>Status:</strong> {{ dedupeStatus }}</div>
      <div>Remount generation: {{ remountCount }}</div>
      <div>Total fetches: {{ totalFetchCount }}</div>
      <div>PDF fetches ({{ pdfPath }}): {{ pdfFetchCount }}</div>
      <div>Overlay fetches ({{ overlaysPath }}): {{ overlayFetchCount }}</div>
      <div class="mt-2">
        Since last remount: total +{{ totalFetchesSinceRemount }}, PDF +{{ pdfFetchesSinceRemount }}, overlays +{{ overlayFetchesSinceRemount }}
      </div>
      <button
        type="button"
        class="mt-3 rounded border px-3 py-1 text-xs hover:bg-muted"
        @click="remountViewers"
      >
        Remount Grid (Force Fresh Viewers)
      </button>
    </div>

    <div :key="viewerMountKey" class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div
        v-for="pageNumber in pageNumbers"
        :key="pageNumber"
        class="rounded border p-2"
      >
        <div class="mb-2 text-sm font-medium">Viewer for page {{ pageNumber }}</div>
        <PDFViewer
          :page="pageNumber"
          :file="pdfPath"
          :overlays="overlaysPath"
        />
      </div>
    </div>
  </TestPanel>
</template>

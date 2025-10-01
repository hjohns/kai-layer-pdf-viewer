<script setup lang="ts">
import type { OverlayAnnotation } from '@/types/annotations';

const { addLog } = useLog();
const pdfViewerRef = ref();
const route = useRoute();
const isNavigating = ref(true); // Start with spinner visible

// Get page number from query parameter, default to 8
const targetPage = computed(() => {
  const pageParam = route.query.page;
  const pageNumber = pageParam ? parseInt(pageParam as string, 10) : 8;
  return isNaN(pageNumber) ? 8 : pageNumber;
});

// Handle overlay click events - show IRI and semantic data
const handleOverlayClick = (overlay: OverlayAnnotation) => {
  const iri = overlay['@id'] || 'No IRI';
  const row = overlay.semanticProperties?.rowIndex || 'Unknown';
  const column = overlay.semanticProperties?.columnIndex || 'Unknown';
  const confidence = overlay.semanticProperties?.confidence;
  const confidenceValues = overlay.semanticProperties?.confidenceValues;
  const confidenceSpansCount = overlay.semanticProperties?.confidenceSpansCount;

  addLog(`🔗 CELL CLICKED: "${overlay.content}"`);
  addLog(`📋 IRI: ${iri}`);
  addLog(`📍 Position: Row ${row}, Column ${column}`);

  // Display confidence information based on what's available
  if (confidenceValues && confidenceValues.length > 1) {
    addLog(`🎯 Confidence Spans (${confidenceSpansCount}): [${confidenceValues.map(v => v.toFixed(3)).join(', ')}]`);
    addLog(`🎯 Primary Confidence: ${confidence?.toFixed(3) || 'Unknown'}`);
  } else if (confidence !== undefined) {
    addLog(`🎯 Confidence: ${typeof confidence === 'number' ? confidence.toFixed(3) : confidence}`);
  } else {
    addLog(`🎯 Confidence: Unknown`);
  }

  addLog(`🏷️  Type: ${overlay['@type'] || 'Unknown'}`);
  addLog(`📊 Full semantic data:`, overlay.semanticProperties);
  addLog('─'.repeat(50));
};

// Handle canvas click events
const handleCanvasClick = (context: { x: number, y: number, pageNumber: number }) => {
  addLog(`Canvas clicked at (${context.x.toFixed(1)}, ${context.y.toFixed(1)})`);
};

// Watch for changes to the page query parameter and navigate
watch(targetPage, async (newPage) => {
  if (pdfViewerRef.value && pdfViewerRef.value.goToPage) {
    isNavigating.value = true;
    pdfViewerRef.value.goToPage(newPage - 1); // 0-based index
    addLog(`Navigated to page ${newPage}`);
    // Give time for page to render
    setTimeout(() => {
      isNavigating.value = false;
    }, 800);
  }
}, { immediate: false });

// Navigate to the page specified in query parameter when PDF is ready
onMounted(() => {
  nextTick(() => {
    setTimeout(() => {
      if (pdfViewerRef.value && pdfViewerRef.value.goToPage && targetPage.value) {
        isNavigating.value = true;
        pdfViewerRef.value.goToPage(targetPage.value - 1);
        addLog(`Navigated to page ${targetPage.value}`);
        // Hide spinner after navigation
        setTimeout(() => {
          isNavigating.value = false;
        }, 800);
      }
    }, 2000);
  });
});

</script>

<template>
  <TestPanel
    heading="PDF 21 JSONLD Table Query Parameter"
    description="Test JSONLD table cell annotations with page from query parameter (?page=8). Click on table cells to see their semantic properties."
  >
    <div class="relative">
      <PDFViewer
        ref="pdfViewerRef"
        file="/pdf-tests/pdf-01.pdf"
        overlays="/pdf-tests/page-8-table-overlay-updated.jsonld"
        @overlay-click="handleOverlayClick"
        @canvas-click="handleCanvasClick"
      />

      <!-- Loading spinner overlay -->
      <div
        v-if="isNavigating"
        class="absolute inset-0 bg-white/80 flex items-center justify-center z-50"
      >
        <div class="flex flex-col items-center gap-3">
          <div class="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p class="text-sm text-gray-600">Loading page {{ targetPage }}...</p>
        </div>
      </div>
    </div>
  </TestPanel>
</template>
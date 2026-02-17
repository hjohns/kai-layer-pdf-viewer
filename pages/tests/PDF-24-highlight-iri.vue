<script setup lang="ts">
import type { OverlayAnnotation } from '@/types/annotations';

definePageMeta({
  middleware: [
    (route) => {
      if (!route.query.page) {
        return navigateTo({ ...route, query: { ...route.query, page: '8' } });
      }
    }
  ]
});

const { addLog } = useLog();

// Use the highlight cell composable
const {
  shouldHighlight,
  disableConfidenceColors,
  highlightIri,
  getCellInfo
} = useHighlightCell({
  defaultIri: 'https://doc/201811HolsworthyDSIFullReport-lab-report-extract.pdftable-25-cell-3'
});

// Handle overlay click events - show IRI and semantic data
const handleOverlayClick = (overlay: OverlayAnnotation) => {
  const info = getCellInfo(overlay);

  addLog(`🔗 CELL CLICKED: "${info.content}"`);
  addLog(`📋 IRI: ${info.iri}`);
  addLog(`📍 Position: Row ${info.rowIndex ?? 'Unknown'}, Column ${info.columnIndex ?? 'Unknown'}`);
  addLog(`🎯 Confidence: ${typeof info.confidence === 'number' ? info.confidence.toFixed(3) : 'Unknown'}`);
  addLog('─'.repeat(50));
};

// Handle canvas click events
const handleCanvasClick = (context: { x: number, y: number, pageNumber: number }) => {
  addLog(`Canvas clicked at (${context.x.toFixed(1)}, ${context.y.toFixed(1)})`);
};

// Highlight info for display
const highlightInfo = computed(() => {
  return `Highlighting: ${highlightIri.value}`;
});

</script>

<template>
  <TestPanel
    heading="PDF 24 Highlight IRI"
    :description="highlightInfo"
  >
    <div class="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
      <strong>Usage:</strong> Add <code>?highlightIri=&lt;iri&gt;</code> to the URL to highlight a specific annotation.
      <div class="mt-1 text-xs text-gray-600">
        Example: <code>?highlightIri=https://example.com/cell/1</code>
      </div>
    </div>
    <PDFViewer
      file="/pdf-tests/pdf-01.pdf"
      overlays="/pdf-tests/page-8-table-overlay-updated.jsonld"
      :highlight-predicate="shouldHighlight"
      :disable-confidence-colors="disableConfidenceColors"
      @overlay-click="handleOverlayClick"
      @canvas-click="handleCanvasClick"
    />
  </TestPanel>
</template>

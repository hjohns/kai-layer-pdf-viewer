<script setup lang="ts">
import type { OverlayAnnotation } from '@/types/annotations';

const { addLog } = useLog();
const pdfViewerRef = ref();

// Handle overlay click events - show IRI and semantic data
const handleOverlayClick = (overlay: OverlayAnnotation) => {
  const iri = overlay['@id'] || 'No IRI';
  const row = overlay.semanticProperties?.row || 'Unknown';
  const column = overlay.semanticProperties?.column || 'Unknown';
  const confidence = overlay.semanticProperties?.confidence || 'Unknown';

  addLog(`🔗 CELL CLICKED: "${overlay.content}"`);
  addLog(`📋 IRI: ${iri}`);
  addLog(`📍 Position: Row ${row}, Column ${column}`);
  addLog(`🎯 Confidence: ${confidence}`);
  addLog(`🏷️  Type: ${overlay['@type'] || 'Unknown'}`);
  addLog(`📊 Full semantic data:`, overlay.semanticProperties);
  addLog('─'.repeat(50));
};

// Handle canvas click events
const handleCanvasClick = (context: { x: number, y: number, pageNumber: number }) => {
  addLog(`Canvas clicked at (${context.x.toFixed(1)}, ${context.y.toFixed(1)})`);
};

// Navigate to page 8 when component mounts
onMounted(() => {
  nextTick(() => {
    // Wait a bit for PDF to load, then navigate to page 8
    setTimeout(() => {
      if (pdfViewerRef.value && pdfViewerRef.value.goToPage) {
        pdfViewerRef.value.goToPage(7); // 0-based index, so 7 = page 8
        addLog('Navigated to page 8 where table annotations are located');
      }
    }, 2000);
  });
});

</script>

<template>
  <TestPanel
    heading="PDF 09 JSONLD Table Annotations"
    description="Test JSONLD table cell annotations with semantic metadata and IRIs. Click on table cells to see their semantic properties."
  >
    <PDFViewer
      ref="pdfViewerRef"
      file="/pdf-tests/pdf-01.pdf"
      overlays="/pdf-tests/page-8-table-overlay.jsonld"
      @overlay-click="handleOverlayClick"
      @canvas-click="handleCanvasClick"
    />
  </TestPanel>
</template>
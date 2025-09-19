<script setup lang="ts">
import type { OverlayAnnotation } from '@/types/annotations';

const { addLog } = useLog();

// Handle overlay click events - simplest possible
const handleOverlayClick = (overlay: OverlayAnnotation) => {
  addLog(`Overlay clicked: ${overlay.content}`);
};

// Handle canvas click events
const handleCanvasClick = (context: { x: number, y: number, pageNumber: number }) => {
  addLog(`Canvas clicked at (${context.x.toFixed(1)}, ${context.y.toFixed(1)})`);
};

</script>

<template>
  <TestPanel 
    heading="PDF 06 Overlay and PDF Clicks" 
    description="Simplest click example - just logs when clicked"
  >
    <PDFViewer 
      file="/pdf-tests/pdf-01.pdf" 
      overlays="/pdf-tests/pdf-01-overlay.json"
      @overlay-click="handleOverlayClick"
      @canvas-click="handleCanvasClick"
    />
  </TestPanel>
</template>

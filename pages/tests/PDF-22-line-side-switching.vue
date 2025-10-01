<script setup lang="ts">
import type { OverlayAnnotation } from '@/types/annotations';
import type { MouseLineIntersectionContext } from '@/composables/useMouseGuide';

const { addLog } = useLog();
const pdfViewerRef = ref();
const intersectingOverlays = ref<OverlayAnnotation[]>([]);
const mouseLineX = ref<number | null>(null);
const mouseLineY = ref<number | null>(null);
const lastIntersectedIds = ref<string[]>([]);

// Use the mouse line mode composable for toggling between vertical/horizontal
const { lineMode, mouseLineConfig, toggleLineMode } = useMouseLineMode({
  initialMode: 'vertical'
});

// Handle overlay click events - show IRI and semantic data
const handleOverlayClick = (overlay: OverlayAnnotation) => {
  const iri = overlay['@id'] || 'No IRI';
  const row = overlay.semanticProperties?.rowIndex || 'Unknown';
  const column = overlay.semanticProperties?.columnIndex || 'Unknown';
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

const handleMouseLineIntersections = (context: MouseLineIntersectionContext) => {
  const ids = context.overlays.map(annotation => annotation['@id'] || `${annotation.page}-${annotation.line}`);
  const hasChanged = ids.length !== lastIntersectedIds.value.length ||
    ids.some((id, index) => id !== lastIntersectedIds.value[index]);

  intersectingOverlays.value = context.overlays;

  if (context.orientation === 'vertical') {
    const normalizedX = Number.isFinite(context.x) ? context.x : null;
    mouseLineX.value = normalizedX;
    mouseLineY.value = null;

    if (normalizedX !== null && hasChanged) {
      lastIntersectedIds.value = ids;
      if (ids.length) {
        addLog(`📐 Vertical line at x=${normalizedX.toFixed(1)} intersects ${ids.length} overlay(s)`);
        context.overlays.forEach(annotation => addLog(`   • ${annotation.content}`));
      } else {
        addLog(`📐 Vertical line at x=${normalizedX.toFixed(1)} intersects no overlays`);
      }
      addLog('─'.repeat(50));
    }
  } else if (context.orientation === 'horizontal') {
    const normalizedY = Number.isFinite(context.y) ? context.y : null;
    mouseLineY.value = normalizedY;
    mouseLineX.value = null;

    if (normalizedY !== null && hasChanged) {
      lastIntersectedIds.value = ids;
      if (ids.length) {
        addLog(`📐 Horizontal line at y=${normalizedY.toFixed(1)} intersects ${ids.length} overlay(s)`);
        context.overlays.forEach(annotation => addLog(`   • ${annotation.content}`));
      } else {
        addLog(`📐 Horizontal line at y=${normalizedY.toFixed(1)} intersects no overlays`);
      }
      addLog('─'.repeat(50));
    }
  }
};

// Navigate to page 8 when component mounts
onMounted(() => {
  nextTick(() => {
    // Wait a bit for PDF to load, then navigate to page 8
    setTimeout(() => {
      if (pdfViewerRef.value && pdfViewerRef.value.goToPage) {
        pdfViewerRef.value.goToPage(7); // 0-based index, so 7 = page 8
        addLog('Navigated to page 8 where table annotations are located');
        addLog('Click the toggle button to switch between vertical/horizontal/none modes');
      }
    }, 2000);
  });
});

</script>

<template>
  <TestPanel
    heading="PDF 22 Line Side Switching"
    description="Test vertical/horizontal line annotations with automatic side-switching based on cursor position (right 50% → left, bottom 50% → top)."
  >
    <div class="mb-4">
      <button
        @click="toggleLineMode"
        class="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        <template v-if="lineMode === 'vertical'">│ Vertical Mode</template>
        <template v-else-if="lineMode === 'horizontal'">── Horizontal Mode</template>
        <template v-else>✕ No Line</template>
      </button>
    </div>

    <PDFViewer
      ref="pdfViewerRef"
      file="/pdf-tests/pdf-01.pdf"
      overlays="/pdf-tests/page-8-table-overlay-updated.jsonld"
      @overlay-click="handleOverlayClick"
      @canvas-click="handleCanvasClick"
      :mouse-line="mouseLineConfig"
      @mouse-line-intersections="handleMouseLineIntersections"
    />

    <div class="mt-4 space-y-2">
      <p class="text-sm text-muted-foreground">
        <template v-if="lineMode === 'vertical' && mouseLineX !== null">
          Vertical line at x={{ mouseLineX.toFixed(1) }} intersects {{ intersectingOverlays.length }} overlay(s).
          <span class="text-xs ml-2">(Tooltips switch to left when cursor is on right 50%)</span>
        </template>
        <template v-else-if="lineMode === 'horizontal' && mouseLineY !== null">
          Horizontal line at y={{ mouseLineY.toFixed(1) }} intersects {{ intersectingOverlays.length }} overlay(s).
          <span class="text-xs ml-2">(Tooltips switch to top when cursor is on bottom 50%)</span>
        </template>
        <template v-else-if="lineMode === 'none'">
          Line mode disabled. Click the toggle button to enable vertical or horizontal line.
        </template>
        <template v-else>
          Move the mouse over the PDF to inspect overlays with the guide line.
        </template>
      </p>
      <ul v-if="intersectingOverlays.length" class="list-disc pl-5 text-sm leading-6">
        <li v-for="overlay in intersectingOverlays" :key="overlay['@id'] || overlay.line">
          {{ overlay.content }}
        </li>
      </ul>
      <p v-else class="text-xs text-muted-foreground">No overlays intersect the current guide line.</p>
    </div>
  </TestPanel>
</template>
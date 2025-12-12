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
const route = useRoute();
const router = useRouter();

// Default IRI to use when none is provided
const DEFAULT_IRI = 'https://doc/201811HolsworthyDSIFullReport-lab-report-extract.pdftable-25-cell-3';

// Get IRI from query parameter, or use default
const highlightIri = computed(() => {
  const qpIri = route.query.highlightIri as string | undefined;
  return qpIri || DEFAULT_IRI;
});

// Set default IRI on mount if not already set
onMounted(() => {
  if (!route.query.highlightIri) {
    router.replace({
      query: { ...route.query, highlightIri: DEFAULT_IRI }
    });
  }
});

// Handle overlay click events - show IRI and semantic data
const handleOverlayClick = (overlay: OverlayAnnotation) => {
  const iri = overlay['@id'] || 'No IRI';
  const row = overlay.semanticProperties?.rowIndex || 'Unknown';
  const column = overlay.semanticProperties?.columnIndex || 'Unknown';
  const confidence = overlay.semanticProperties?.confidence;

  addLog(`🔗 CELL CLICKED: "${overlay.content}"`);
  addLog(`📋 IRI: ${iri}`);
  addLog(`📍 Position: Row ${row}, Column ${column}`);
  addLog(`🎯 Confidence: ${typeof confidence === 'number' ? confidence.toFixed(3) : confidence || 'Unknown'}`);
  addLog('─'.repeat(50));
};

// Handle canvas click events
const handleCanvasClick = (context: { x: number, y: number, pageNumber: number }) => {
  addLog(`Canvas clicked at (${context.x.toFixed(1)}, ${context.y.toFixed(1)})`);
};

// Predicate to determine if an annotation should be highlighted
const shouldHighlight = (annotation: OverlayAnnotation): boolean => {
  return annotation['@id'] === highlightIri.value;
};

// Disable confidence colors when highlighting by IRI
const disableConfidenceColors = computed(() => !!highlightIri.value);

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

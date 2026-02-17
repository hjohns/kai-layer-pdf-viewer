<script setup lang="ts">
import type { OverlayAnnotation } from '@/types/annotations';
import type { MouseLineIntersectionContext } from '@/composables/useMouseGuide';

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

// Use the highlight cell composable with manual confidence colors control
const {
  shouldHighlight,
  disableConfidenceColors,
  highlightIri,
  isHighlightMode,
  getCellInfo,
  setHighlightIri,
  clearHighlight,
  toggleConfidenceColors
} = useHighlightCell({
  confidenceColorsMode: 'manual'  // Manual control for toggling confidence colors
});

// Track mouse line intersections for line mode
const intersectingOverlays = ref<OverlayAnnotation[]>([]);
const mouseLineX = ref<number | null>(null);

// Sample cell IRIs for quick toggle
const sampleIris = [
  'https://doc/201811HolsworthyDSIFullReport-lab-report-extract.pdftable-25-cell-3',
  'https://doc/201811HolsworthyDSIFullReport-lab-report-extract.pdftable-25-cell-5',
  'https://doc/201811HolsworthyDSIFullReport-lab-report-extract.pdftable-25-cell-10'
];

// Mouse line configuration - disabled when in highlight mode
const mouseLineConfig = computed(() => ({
  enabled: !isHighlightMode.value,
  color: 'rgba(249, 115, 22, 0.8)',
  width: 2,
  tooltips: true,
  orientation: 'vertical' as const
}));

// Handle overlay click events
const handleOverlayClick = (overlay: OverlayAnnotation) => {
  const info = getCellInfo(overlay);

  addLog(`🔗 CELL CLICKED: "${info.content}"`);
  addLog(`📋 IRI: ${info.iri}`);
  addLog(`📍 Position: Row ${info.rowIndex ?? 'Unknown'}, Column ${info.columnIndex ?? 'Unknown'}`);
  addLog(`🎯 Confidence: ${typeof info.confidence === 'number' ? info.confidence.toFixed(3) : 'Unknown'}`);
  addLog('─'.repeat(50));

  // In line mode, clicking a cell switches to highlight mode for that cell
  if (!isHighlightMode.value && info.iri !== 'No IRI') {
    setHighlightIri(info.iri);
    addLog(`✨ Switched to HIGHLIGHT MODE for IRI: ${info.iri}`);
  }
};

// Handle mouse line intersections (only active in line mode)
const handleMouseLineIntersections = (context: MouseLineIntersectionContext) => {
  if (context.orientation !== 'vertical' || isHighlightMode.value) {
    return;
  }

  intersectingOverlays.value = context.overlays;
  const normalizedX = Number.isFinite(context.x) ? context.x : null;
  mouseLineX.value = normalizedX;
};

// Toggle to line mode
const switchToLineMode = () => {
  clearHighlight();
  addLog('📐 Switched to LINE MODE');
  addLog('─'.repeat(50));
};

// Toggle to cell highlight mode
const switchToCellMode = (iri: string) => {
  setHighlightIri(iri);
  addLog(`🎯 Switched to CELL MODE - highlighting: ${iri}`);
  addLog('─'.repeat(50));
};

// Description based on current mode
const modeDescription = computed(() => {
  if (isHighlightMode.value) {
    return `CELL MODE: Highlighting ${highlightIri.value}`;
  }
  return 'LINE MODE: Vertical line intersections with tooltips';
});

</script>

<template>
  <TestPanel
    heading="PDF 25 Toggle Line vs Cell Highlighting"
    :description="modeDescription"
  >
    <!-- Mode Toggle Controls -->
    <div class="mb-4 p-4 bg-muted rounded-lg space-y-3">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-sm">Current Mode:</span>
        <Badge :variant="isHighlightMode ? 'default' : 'secondary'">
          {{ isHighlightMode ? '🎯 Cell Highlight' : '📐 Line Intersections' }}
        </Badge>
      </div>

      <div class="space-y-2">
        <div class="text-sm font-semibold">Quick Switch:</div>
        <div class="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            :class="{ 'bg-accent': !isHighlightMode }"
            @click="switchToLineMode"
          >
            📐 Line Mode
          </Button>
          <Button
            v-for="(iri, index) in sampleIris"
            :key="iri"
            size="sm"
            variant="outline"
            :class="{ 'bg-accent': highlightIri === iri }"
            @click="switchToCellMode(iri)"
          >
            🎯 Cell {{ index + 1 }}
          </Button>
        </div>
      </div>

      <!-- Confidence Colors Toggle -->
      <div class="space-y-2 pt-2 border-t">
        <div class="text-sm font-semibold">Display Options:</div>
        <div class="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            :class="{ 'bg-red-100 dark:bg-red-900': !disableConfidenceColors }"
            @click="toggleConfidenceColors"
          >
            {{ disableConfidenceColors ? '🎨 Show Confidence Colors' : '🚫 Hide Confidence Colors' }}
          </Button>
          <span class="text-xs text-muted-foreground">
            {{ disableConfidenceColors ? 'Confidence colors hidden' : 'Confidence colors shown' }}
          </span>
        </div>
      </div>

      <!-- Instructions based on mode -->
      <div class="text-xs text-muted-foreground mt-2 p-2 bg-background rounded border">
        <template v-if="isHighlightMode">
          <strong>Cell Highlight Mode:</strong> The selected cell is highlighted in yellow.
          Mouse line is disabled. Toggle confidence colors to see the highlight more clearly.
          Click "Line Mode" or clear the URL parameter to switch back.
        </template>
        <template v-else>
          <strong>Line Mode:</strong> Move your mouse over the PDF to see vertical line intersections
          with tooltips. Click any cell to switch to Cell Highlight Mode for that cell.
          Confidence colors show data quality (green = high confidence, red = low confidence).
        </template>
      </div>
    </div>

    <!-- PDF Viewer -->
    <PDFViewer
      file="/pdf-tests/pdf-01.pdf"
      overlays="/pdf-tests/page-8-table-overlay-updated.jsonld"
      :highlight-predicate="shouldHighlight"
      :disable-confidence-colors="disableConfidenceColors"
      :mouse-line="mouseLineConfig"
      @overlay-click="handleOverlayClick"
      @mouse-line-intersections="handleMouseLineIntersections"
    />

    <!-- Status Display -->
    <div class="mt-4 space-y-2">
      <!-- Line Mode Status -->
      <template v-if="!isHighlightMode">
        <p class="text-sm text-muted-foreground">
          <template v-if="mouseLineX !== null">
            Vertical line at x={{ mouseLineX.toFixed(1) }} intersects {{ intersectingOverlays.length }} cell(s).
          </template>
          <template v-else>
            Move the mouse over the PDF to inspect cells with the vertical guide.
          </template>
        </p>
        <ul v-if="intersectingOverlays.length" class="list-disc pl-5 text-sm leading-6">
          <li v-for="overlay in intersectingOverlays" :key="overlay['@id'] || overlay.line">
            {{ overlay.content }}
            <span class="text-xs text-muted-foreground ml-2">
              (Row {{ overlay.semanticProperties?.rowIndex ?? '?' }},
              Col {{ overlay.semanticProperties?.columnIndex ?? '?' }})
            </span>
          </li>
        </ul>
        <p v-else-if="mouseLineX !== null" class="text-xs text-muted-foreground">
          No cells intersect the current guide line.
        </p>
      </template>

      <!-- Cell Highlight Mode Status -->
      <template v-else>
        <div class="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded text-sm">
          <div class="font-semibold mb-1">Highlighting Cell:</div>
          <div class="text-xs font-mono break-all">{{ highlightIri }}</div>
          <div class="mt-2 text-xs">
            Click the "Line Mode" button above or
            <button
              @click="clearHighlight"
              class="text-blue-600 dark:text-blue-400 underline hover:no-underline"
            >
              clear the highlight
            </button>
            to return to line intersection mode.
          </div>
        </div>
      </template>
    </div>

    <!-- Technical Info -->
    <div class="mt-4 p-3 bg-muted rounded text-xs">
      <div class="font-semibold mb-1">Technical Details:</div>
      <ul class="list-disc pl-5 space-y-1">
        <li><code>isHighlightMode</code>: {{ isHighlightMode }}</li>
        <li><code>mouseLineConfig.enabled</code>: {{ mouseLineConfig.enabled }}</li>
        <li><code>disableConfidenceColors</code>: {{ disableConfidenceColors }} (manual control)</li>
        <li><code>highlightIri</code>: {{ highlightIri || '(none)' }}</li>
      </ul>
      <div class="mt-2 text-muted-foreground">
        This test uses <code>confidenceColorsMode: 'manual'</code> to allow independent
        control of confidence colors. Toggle them on/off to see the highlighted cell more clearly.
      </div>
    </div>
  </TestPanel>
</template>
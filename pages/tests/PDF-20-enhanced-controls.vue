<script setup lang="ts">
import type { AnnotationFetcher } from '@/composables/usePdf';
import type { OverlayAnnotation } from '@/types/annotations';
import type { MouseLineIntersectionContext } from '@/composables/useMouseGuide';
import type { AnnotationRenderContext } from '@/composables/usePdf';

const { addLog } = useLog();
const { getConfidenceColors } = useAnnotationStyling();
const {
  showWordConfidenceVisualization,
  clearWordConfidenceVisualization,
  hasWordLevelConfidence
} = useWordConfidenceVisualization();
const SPARQL_ENDPOINT = 'https://ecass-fuseki.agreeablemoss-36d29f99.australiaeast.azurecontainerapps.io/confidence/query';
const SPARQL_UPDATE_ENDPOINT = 'https://ecass-fuseki.agreeablemoss-36d29f99.australiaeast.azurecontainerapps.io/confidence/update';

const SPARQL_QUERY_TEMPLATE = `PREFIX geo: <http://www.opengis.net/ont/geosparql#>
prefix di: <https://document-intelligence/ontology/>
prefix sdo: <https://schema.org/>
prefix prov: <http://www.w3.org/ns/prov#>
DESCRIBE ?cell ?word
{
  VALUES ?pagenumber { UNDEF }
  ?page a di:Page ;
  di:page ?pagenumber .
  {
    ?table sdo:isPartOf ?page .
    ?table a di:Table .
    ?page a di:Page .
    ?cell a di:Cell .
    ?cell sdo:isPartOf ?table .
    FILTER NOT EXISTS {
      ?newerCell prov:wasRevisionOf ?cell
    }
  }
  UNION
  {
    ?word sdo:isPartOf ?page .
    ?page a di:Page .
    ?word a di:Word .
    FILTER NOT EXISTS { ?word sdo:isPartOf ?cell . ?cell a di:Cell }
  }
}`;

const pdfViewerRef = ref();
const selectedCell = ref<OverlayAnnotation | null>(null);
const editForm = ref({
  visible: false,
  cellValue: '',
  originalValue: ''
});
const isSubmitting = ref(false);
const intersectingOverlays = ref<OverlayAnnotation[]>([]);
const mouseLineX = ref<number | null>(null);
const lastIntersectedIds = ref<string[]>([]);
const showAllVersions = ref(false);

// New control states
const lineMode = ref<'vertical' | 'horizontal' | 'none'>('vertical');
const showConfidenceColors = ref(true);

const fetchAnnotations: AnnotationFetcher = async (pageNumber) => {
  addLog(`Fetching JSON-LD annotations from Fuseki for page ${pageNumber}`);

  try {
    // Toggle query based on version view preference
    const query = showAllVersions.value
      ? SPARQL_QUERY_TEMPLATE.replace('FILTER NOT EXISTS { \n      ?newerCell prov:wasRevisionOf ?cell \n    }', '') // Remove filter for all versions
      : SPARQL_QUERY_TEMPLATE; // Keep filter for latest only

    const sparqlQuery = query.replace('UNDEF', pageNumber.toString());
    addLog(`🔍 Generated SPARQL query (${showAllVersions.value ? 'all versions' : 'latest only'}):`);
    addLog(sparqlQuery);

    const url = `${SPARQL_ENDPOINT}?` +
      new URLSearchParams({ query: sparqlQuery }).toString();

    addLog(`🌐 Request URL: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/ld+json'
      }
    });

    if (!response.ok) {
      addLog(`❌ SPARQL request failed with status ${response.status}`);
      const errorText = await response.text();
      addLog(`❌ Error response: ${errorText}`);
      return { overlay: [] };
    }

    const payload = await response.json();

    addLog(`✅ Received JSON-LD payload for page ${pageNumber}`);
    addLog(`📦 Payload type: ${typeof payload}`);
    addLog(`📦 Payload keys: ${Object.keys(payload)}`);
    addLog(`📦 Full payload:`, payload);
    return payload;
  } catch (error) {
    console.error('Failed to fetch SPARQL annotations', error);
    addLog(`Failed to fetch annotations for page ${pageNumber}`);
    return { overlay: [] };
  }
};

// Generate a unique revision IRI based on timestamp
const generateRevisionIRI = (originalIRI: string): string => {
  const timestamp = Date.now();
  return `${originalIRI}-rev-${timestamp}`;
};

// Generate INSERT query for creating cell revision
const generateRevisionQuery = (originalCellIRI: string, newValue: string, originalCell: OverlayAnnotation) => {
  const revisionIRI = generateRevisionIRI(originalCellIRI);

  return `PREFIX di: <https://document-intelligence/ontology/>
PREFIX sdo: <https://schema.org/>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

INSERT {
  ?revisionIRI a di:Cell ;
    di:content ?newContent ;
    di:rowIndex ?rowIndex ;
    di:columnIndex ?columnIndex ;
    geo:hasGeometry ?geometry ;
    sdo:isPartOf ?table ;
    prov:wasRevisionOf ?originalIRI ;
    prov:generatedAtTime ?timenow ;
    prov:wasAttributedTo <urn:user:test-user> ;
    di:confidenceSpans ?confidenceSpans .
} WHERE {
  VALUES (?revisionIRI ?originalIRI ?newContent) {
    (<${revisionIRI}> <${originalCellIRI}> "${newValue}")
  }

  # Reuse all existing properties from the original cell
  ?originalIRI a di:Cell ;
    di:rowIndex ?rowIndex ;
    di:columnIndex ?columnIndex ;
    geo:hasGeometry ?geometry ;
    sdo:isPartOf ?table .

  # Optional properties - only include if they exist
  OPTIONAL { ?originalIRI di:confidenceSpans ?confidenceSpans }

  BIND(NOW() AS ?timenow)
}`;
};

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

  // Check if this is a revision cell
  if (overlay.semanticProperties?.wasRevisionOf) {
    addLog(`🔄 This cell is a revision of: ${overlay.semanticProperties.wasRevisionOf}`);
    addLog(`⏰ Generated at: ${overlay.semanticProperties.generatedAtTime || 'Unknown'}`);
  }

  // Open edit form for cells only
  if (overlay['@type']?.includes('Cell') || overlay.semanticProperties?.rowIndex !== undefined) {
    selectedCell.value = overlay;
    editForm.value = {
      visible: true,
      cellValue: overlay.content || '',
      originalValue: overlay.content || ''
    };
    addLog(`📝 Opening edit form for cell content (will create revision)`);
  }

  addLog('─'.repeat(50));
};

const handleCanvasClick = (context: { x: number; y: number; pageNumber: number }) => {
  addLog(`Canvas clicked at (${context.x.toFixed(1)}, ${context.y.toFixed(1)})`);
  // Close edit form when clicking on canvas
  if (editForm.value.visible) {
    closeEditForm();
  }
};

const handleMouseLineIntersections = (context: MouseLineIntersectionContext) => {
  // Early return for disabled lines or mismatched orientation
  if (lineMode.value === 'none' ||
      (lineMode.value === 'vertical' && context.orientation !== 'vertical') ||
      (lineMode.value === 'horizontal' && context.orientation !== 'horizontal')) {
    return;
  }

  // Only process if context has valid data
  if (!context.overlays || !Array.isArray(context.overlays)) {
    return;
  }

  const ids = context.overlays.map(annotation => annotation['@id'] || `${annotation.page}-${annotation.line}`);
  const hasChanged = ids.length !== lastIntersectedIds.value.length ||
    ids.some((id, index) => id !== lastIntersectedIds.value[index]);

  // Only update reactive values if something actually changed
  if (hasChanged) {
    intersectingOverlays.value = context.overlays;
    lastIntersectedIds.value = ids;
  }

  const normalizedX = Number.isFinite(context.x) ? context.x : null;
  mouseLineX.value = normalizedX;

  if (normalizedX === null || !hasChanged) {
    return;
  }

  // Throttle logging to reduce DOM updates
  if (ids.length) {
    addLog(`📐 ${lineMode.value} line at ${context.orientation === 'vertical' ? 'x' : 'y'}=${normalizedX.toFixed(1)} intersects ${ids.length} overlay(s)`);
    // Only log first few overlays to reduce overhead
    context.overlays.slice(0, 5).forEach(annotation => {
      const isRevision = annotation.semanticProperties?.wasRevisionOf ? ' [REVISION]' : '';
      addLog(`   • ${annotation.content}${isRevision}`);
    });
    if (context.overlays.length > 5) {
      addLog(`   ... and ${context.overlays.length - 5} more`);
    }
  } else {
    addLog(`📐 ${lineMode.value} line intersects no overlays`);
  }
  addLog('─'.repeat(50));
};

const closeEditForm = () => {
  editForm.value.visible = false;
  selectedCell.value = null;
  editForm.value.cellValue = '';
  editForm.value.originalValue = '';
  addLog(`📝 Edit form closed`);
};

const submitCellEdit = async () => {
  if (!selectedCell.value || !selectedCell.value['@id']) {
    addLog(`❌ Cannot create revision: No IRI available`);
    return;
  }

  if (editForm.value.cellValue === editForm.value.originalValue) {
    addLog(`ℹ️ No changes made to cell value`);
    closeEditForm();
    return;
  }

  isSubmitting.value = true;
  const cellIRI = selectedCell.value['@id'];
  const newValue = editForm.value.cellValue;

  try {
    const revisionQuery = generateRevisionQuery(cellIRI, newValue, selectedCell.value);
    addLog(`🔄 Generated SPARQL INSERT DATA query for revision:`);
    addLog(revisionQuery);

    const response = await fetch(SPARQL_UPDATE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-update',
        'Accept': 'text/plain'
      },
      body: revisionQuery
    });

    if (!response.ok) {
      addLog(`❌ SPARQL INSERT failed with status ${response.status}`);
      const errorText = await response.text();
      addLog(`❌ Error response: ${errorText}`);
    } else {
      addLog(`✅ Cell revision created successfully!`);
      addLog(`📝 Original: "${editForm.value.originalValue}" → New revision: "${newValue}"`);
      addLog(`🔗 Original IRI: ${cellIRI}`);
      addLog(`🔗 Revision IRI: ${generateRevisionIRI(cellIRI)}`);
      addLog(`📦 Original cell remains unchanged, new revision cell created with provenance`);

      // Refresh annotations to show the new revision
      if (pdfViewerRef.value?.refreshAnnotationsForPage) {
        addLog(`🔄 Refreshing annotations to show new revision...`);
        await pdfViewerRef.value.refreshAnnotationsForPage();
      }
    }
  } catch (error) {
    console.error('Failed to create cell revision', error);
    addLog(`❌ Failed to create cell revision: ${error}`);
  } finally {
    isSubmitting.value = false;
    closeEditForm();
  }
};

const toggleVersionView = async () => {
  showAllVersions.value = !showAllVersions.value;
  addLog(`🔄 Switching to ${showAllVersions.value ? 'all versions' : 'latest only'} view`);

  // Refresh annotations with new view
  if (pdfViewerRef.value?.refreshAnnotationsForPage) {
    await pdfViewerRef.value.refreshAnnotationsForPage();
  }
};

const refreshData = async () => {
  addLog(`🔄 Manually refreshing annotations from database...`);

  try {
    if (!pdfViewerRef.value) {
      addLog(`❌ PDF viewer reference not available`);
      return;
    }

    // Trigger a re-render by calling refreshAnnotationsForPage (uses current page by default)
    await pdfViewerRef.value.refreshAnnotationsForPage();
    addLog(`✅ Refresh completed - page re-rendered with fresh data`);
  } catch (error) {
    addLog(`❌ Error during refresh: ${error}`);
  }
};

// New control functions with throttling
let lastToggleTime = 0;
const TOGGLE_THROTTLE_MS = 150;

const toggleLineMode = () => {
  const now = Date.now();
  if (now - lastToggleTime < TOGGLE_THROTTLE_MS) return;
  lastToggleTime = now;

  const modes: Array<'vertical' | 'horizontal' | 'none'> = ['vertical', 'horizontal', 'none'];
  const currentIndex = modes.indexOf(lineMode.value);
  lineMode.value = modes[(currentIndex + 1) % modes.length];
  addLog(`📐 Line mode changed to: ${lineMode.value}`);
};

const toggleConfidenceColors = async () => {
  const now = Date.now();
  if (now - lastToggleTime < TOGGLE_THROTTLE_MS) return;
  lastToggleTime = now;

  showConfidenceColors.value = !showConfidenceColors.value;
  addLog(`🎨 Confidence colors ${showConfidenceColors.value ? 'enabled' : 'disabled'}`);

  // Force a re-render by refreshing annotations
  if (pdfViewerRef.value?.refreshAnnotationsForPage) {
    await pdfViewerRef.value.refreshAnnotationsForPage();
  }
};

// Cached mouse line configurations to avoid object recreation
const mouseLineConfigs = {
  none: { enabled: false },
  vertical: {
    enabled: true,
    color: 'rgba(249, 115, 22, 0.8)',
    width: 2,
    tooltips: true,
    orientation: 'vertical'
  },
  horizontal: {
    enabled: true,
    color: 'rgba(249, 115, 22, 0.8)',
    width: 2,
    tooltips: true,
    orientation: 'horizontal'
  }
} as const;

// Computed mouse line configuration
const mouseLineConfig = computed(() => mouseLineConfigs[lineMode.value]);

// HTML annotation function for confidence colors - make it reactive
const createConfidenceAnnotation = computed(() => {
  console.log('🏷️ createConfidenceAnnotation computed function created, showConfidenceColors:', showConfidenceColors.value);

  return (context: AnnotationRenderContext, annotation: OverlayAnnotation): string => {
    console.log('🏷️ createConfidenceAnnotation called:', {
      showConfidenceColors: showConfidenceColors.value,
      annotationContent: annotation.content,
      confidence: annotation.semanticProperties?.confidence
    });

    // TEMPORARY TEST: Always return something to see if HTML annotation works
    if (!showConfidenceColors.value) {
      console.log('🏷️ Confidence colors disabled, returning test HTML');
      return `<div style="background: red; color: white; padding: 2px;">TEST: ${annotation.content}</div>`;
    }

    const colors = getConfidenceColors(annotation);
    const confidence = annotation.semanticProperties?.confidence;
    const confidencePercent = confidence ? (confidence * 100).toFixed(1) : 'N/A';
    const hasWordLevel = hasWordLevelConfidence(annotation);

    console.log('🏷️ Applying confidence colors:', {
      colors,
      confidencePercent,
      hasWordLevel,
      content: annotation.content
    });

    return `<div
      style="
        background-color: ${colors.fill};
        border: 2px solid ${colors.stroke};
        padding: 4px 6px;
        border-radius: 3px;
        font-size: 12px;
        font-weight: 600;
        color: #1f2937;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        min-height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        word-break: break-word;
        ${hasWordLevel ? 'cursor: pointer;' : ''}
      "
      title="Cell Confidence: ${confidencePercent}%${hasWordLevel ? ' • Hover for word-level details' : ''}"
      class="confidence-annotation ${hasWordLevel ? 'has-word-confidence' : ''}"
      data-annotation-id="${annotation['@id'] || 'unknown'}"
      onmouseenter="if (window.handleConfidenceHover) window.handleConfidenceHover(this, true)"
      onmouseleave="if (window.handleConfidenceHover) window.handleConfidenceHover(this, false)"
    >
      ${annotation.content || ''}
    </div>`;
  };
});

// Global hover handler for word-level confidence visualization
const handleConfidenceHover = (element: HTMLElement, isEntering: boolean) => {
  console.log('🖱️ handleConfidenceHover called:', {
    isEntering,
    showConfidenceColors: showConfidenceColors.value,
    element: element.textContent?.substring(0, 20)
  });

  if (!showConfidenceColors.value) {
    console.log('🖱️ Confidence colors disabled, skipping hover');
    return; // Don't show word-level if confidence colors are disabled
  }

  if (isEntering) {
    // Find the corresponding annotation
    const annotationId = element.dataset.annotationId;
    console.log('🖱️ Looking for annotation ID:', annotationId);
    if (!annotationId) return;

    // Get the current page annotations and find the matching one
    if (pdfViewerRef.value?.pageAnnotations) {
      const annotation = pdfViewerRef.value.pageAnnotations.find((ann: OverlayAnnotation) => ann['@id'] === annotationId);
      console.log('🖱️ Found annotation:', annotation ? annotation.content : 'NOT FOUND');
      if (annotation && hasWordLevelConfidence(annotation)) {
        console.log('🖱️ Showing word confidence visualization');
        const rect = element.getBoundingClientRect();
        const container = element.closest('.pdf-page-container') as HTMLElement;
        if (container) {
          showWordConfidenceVisualization(annotation, container, rect);
        } else {
          console.log('🖱️ No container found');
        }
      } else {
        console.log('🖱️ No word-level confidence available');
      }
    } else {
      console.log('🖱️ No page annotations available');
    }
  } else {
    console.log('🖱️ Clearing word confidence visualization');
    clearWordConfidenceVisualization();
  }
};

onMounted(() => {
  // Set up global hover handler
  (window as any).handleConfidenceHover = handleConfidenceHover;
  console.log('🏗️ Component mounted, showConfidenceColors:', showConfidenceColors.value);

  // Watch for changes to showConfidenceColors
  watch(showConfidenceColors, (newValue, oldValue) => {
    console.log('📊 showConfidenceColors changed:', { oldValue, newValue });
  });

  nextTick(() => {
    setTimeout(() => {
      if (pdfViewerRef.value && pdfViewerRef.value.goToPage) {
        pdfViewerRef.value.goToPage(7);
        addLog('Navigated to page 8 where table annotations are located');
      }
    }, 2000);
  });
});

onUnmounted(() => {
  // Clean up global handler
  delete (window as any).handleConfidenceHover;
  clearWordConfidenceVisualization();
});
</script>

<template>
  <TestPanel
    heading="Enhanced Controls Test"
    description="Cell revision test with enhanced controls for line guides and confidence visualization."
  >
    <template #inputs>
      <!-- Enhanced Control Buttons -->
      <div class="flex gap-2 mb-4 flex-wrap">
        <!-- Line Mode Toggle Button -->
        <Button
          variant="outline"
          size="sm"
          @click="toggleLineMode"
          :class="{
            'bg-orange-100 border-orange-300': lineMode === 'vertical',
            'bg-blue-100 border-blue-300': lineMode === 'horizontal',
            'bg-gray-100 border-gray-300': lineMode === 'none'
          }"
        >
          {{ lineMode === 'vertical' ? '│ Vertical' : lineMode === 'horizontal' ? '── Horizontal' : '✕ No Line' }}
        </Button>

        <!-- Confidence Colors Toggle Button -->
        <Button
          variant="outline"
          size="sm"
          @click="toggleConfidenceColors"
          :class="{ 'bg-green-100 border-green-300': showConfidenceColors }"
        >
          {{ showConfidenceColors ? '🎨 Hide Colors' : '🎨 Show Colors' }}
        </Button>

        <!-- Original Buttons -->
        <Button
          variant="outline"
          size="sm"
          @click="toggleVersionView"
          :class="{ 'bg-blue-100': showAllVersions }"
        >
          {{ showAllVersions ? 'Show Latest Only' : 'Show All Versions' }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          @click="refreshData"
          class="text-green-600 hover:text-green-700 hover:bg-green-50"
        >
          🔄 Refresh Data
        </Button>
      </div>
    </template>

    <PDFViewer
      ref="pdfViewerRef"
      file="/pdf-tests/pdf-01.pdf"
      :annotation-fetcher="fetchAnnotations"
      @overlay-click="handleOverlayClick"
      @canvas-click="handleCanvasClick"
      :mouse-line="mouseLineConfig"
      @mouse-line-intersections="handleMouseLineIntersections"
      :html-annotation="showConfidenceColors ? ((ctx, ann) => `<div style='background: red; color: white; padding: 4px;'>TEST</div>`) : undefined"
    />

    <!-- Edit Form Modal -->
    <div v-if="editForm.visible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">Create Cell Revision</h3>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            New Cell Content:
          </label>
          <textarea
            v-model="editForm.cellValue"
            class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            rows="3"
            placeholder="Enter new cell content..."
          />
        </div>

        <div class="mb-4 p-3 bg-gray-50 rounded text-sm">
          <div><strong>Original IRI:</strong> {{ selectedCell?.['@id'] || 'N/A' }}</div>
          <div><strong>Position:</strong> Row {{ selectedCell?.semanticProperties?.rowIndex || '?' }}, Column {{ selectedCell?.semanticProperties?.columnIndex || '?' }}</div>
          <div><strong>Current:</strong> "{{ editForm.originalValue }}"</div>
          <div v-if="selectedCell?.semanticProperties?.wasRevisionOf" class="text-orange-600">
            <strong>This is already a revision of:</strong> {{ selectedCell.semanticProperties.wasRevisionOf }}
          </div>
        </div>

        <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
          <p><strong>Note:</strong> This will create a new cell with <code>prov:wasRevisionOf</code> pointing to the original. The original cell remains unchanged.</p>
        </div>

        <div class="flex gap-3 justify-end">
          <button
            @click="closeEditForm"
            :disabled="isSubmitting"
            class="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            @click="submitCellEdit"
            :disabled="isSubmitting || !editForm.cellValue.trim()"
            class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ isSubmitting ? 'Creating Revision...' : 'Create Revision' }}
          </button>
        </div>
      </div>
    </div>

    <div class="mt-4 space-y-2">
      <p class="text-sm text-muted-foreground">
        Click on any cell overlay to create a revision. Original cells remain unchanged. Use the enhanced controls above to customize the viewing experience.
      </p>
      <div class="text-sm text-muted-foreground">
        <div><strong>Line Mode:</strong> {{ lineMode === 'vertical' ? 'Vertical guide line' : lineMode === 'horizontal' ? 'Horizontal guide line' : 'No guide line' }}</div>
        <div><strong>Confidence Colors:</strong> {{ showConfidenceColors ? 'Showing confidence-based colors' : 'Standard overlay colors' }}</div>
      </div>
      <p class="text-sm text-muted-foreground">
        <template v-if="mouseLineX !== null && lineMode !== 'none'">
          {{ lineMode === 'vertical' ? 'Vertical' : 'Horizontal' }} line at {{ lineMode === 'vertical' ? 'x' : 'y' }}={{ mouseLineX.toFixed(1) }} intersects {{ intersectingOverlays.length }} overlay(s).
        </template>
        <template v-else-if="lineMode === 'none'">
          Guide lines are disabled. Enable them using the line mode button above.
        </template>
        <template v-else>
          Move the mouse over the PDF to inspect overlays with the {{ lineMode }} guide.
        </template>
      </p>
      <ul v-if="intersectingOverlays.length" class="list-disc pl-5 text-sm leading-6">
        <li v-for="overlay in intersectingOverlays" :key="overlay['@id'] || overlay.line">
          {{ overlay.content }}
          <span v-if="overlay.semanticProperties?.wasRevisionOf" class="ml-2 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">
            REVISION
          </span>
        </li>
      </ul>
      <p v-else class="text-xs text-muted-foreground">No overlays intersect the current guide line.</p>
      <div v-if="selectedCell && editForm.visible" class="p-3 bg-green-50 border border-green-200 rounded text-sm">
        <strong>Creating revision for:</strong> {{ selectedCell.content || 'Empty cell' }}
      </div>
    </div>
  </TestPanel>
</template>
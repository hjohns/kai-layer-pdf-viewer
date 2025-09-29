<script setup lang="ts">
import type { AnnotationFetcher } from '@/composables/usePdf';
import type { OverlayAnnotation } from '@/types/annotations';
import type { MouseLineIntersectionContext } from '@/composables/useMouseGuide';

const { addLog } = useLog();
const SPARQL_ENDPOINT = 'https://ecass-fuseki.agreeablemoss-36d29f99.australiaeast.azurecontainerapps.io/confidence/query';
const SPARQL_UPDATE_ENDPOINT = 'https://ecass-fuseki.agreeablemoss-36d29f99.australiaeast.azurecontainerapps.io/confidence/update';

const SPARQL_QUERY_TEMPLATE = `PREFIX geo: <http://www.opengis.net/ont/geosparql#>
prefix di: <https://document-intelligence/ontology/>
prefix sdo: <https://schema.org/>
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

const fetchAnnotations: AnnotationFetcher = async (pageNumber) => {
  addLog(`Fetching JSON-LD annotations from Fuseki for page ${pageNumber}`);

  try {
    const sparqlQuery = SPARQL_QUERY_TEMPLATE.replace('UNDEF', pageNumber.toString());
    addLog(`🔍 Generated SPARQL query:`);
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

const generateUpdateQuery = (cellIRI: string, newValue: string) => {
  return `PREFIX di: <https://document-intelligence/ontology/>
PREFIX sdo: <https://schema.org/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

DELETE {
  <${cellIRI}> sdo:text ?oldText .
}
INSERT {
  <${cellIRI}> sdo:text "${newValue}" .
}
WHERE {
  <${cellIRI}> sdo:text ?oldText .
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

  // Open edit form for cells only
  if (overlay['@type']?.includes('Cell') || overlay.semanticProperties?.rowIndex !== undefined) {
    selectedCell.value = overlay;
    editForm.value = {
      visible: true,
      cellValue: overlay.content || '',
      originalValue: overlay.content || ''
    };
    addLog(`📝 Opening edit form for cell content`);
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
  if (context.orientation !== 'vertical') {
    return;
  }

  const ids = context.overlays.map(annotation => annotation['@id'] || `${annotation.page}-${annotation.line}`);
  const hasChanged = ids.length !== lastIntersectedIds.value.length ||
    ids.some((id, index) => id !== lastIntersectedIds.value[index]);

  intersectingOverlays.value = context.overlays;
  const normalizedX = Number.isFinite(context.x) ? context.x : null;
  mouseLineX.value = normalizedX;

  if (normalizedX === null) {
    lastIntersectedIds.value = ids;
    return;
  }

  if (hasChanged) {
    lastIntersectedIds.value = ids;

    if (ids.length) {
      addLog(`📐 Line at x=${normalizedX.toFixed(1)} intersects ${ids.length} overlay(s)`);
      context.overlays.forEach(annotation => addLog(`   • ${annotation.content}`));
    } else {
      addLog(`📐 Line at x=${normalizedX.toFixed(1)} intersects no overlays`);
    }
    addLog('─'.repeat(50));
  }
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
    addLog(`❌ Cannot update cell: No IRI available`);
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
    const updateQuery = generateUpdateQuery(cellIRI, newValue);
    addLog(`🔄 Generated SPARQL UPDATE query:`);
    addLog(updateQuery);

    const response = await fetch(SPARQL_UPDATE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-update',
        'Accept': 'text/plain'
      },
      body: updateQuery
    });

    if (!response.ok) {
      addLog(`❌ SPARQL UPDATE failed with status ${response.status}`);
      const errorText = await response.text();
      addLog(`❌ Error response: ${errorText}`);
    } else {
      addLog(`✅ Cell updated successfully!`);
      addLog(`📝 Changed "${editForm.value.originalValue}" → "${newValue}"`);
      addLog(`🔗 IRI: ${cellIRI}`);

      // Update the overlay content locally for visual feedback
      if (selectedCell.value) {
        selectedCell.value.content = newValue;
      }
    }
  } catch (error) {
    console.error('Failed to update cell', error);
    addLog(`❌ Failed to update cell: ${error}`);
  } finally {
    isSubmitting.value = false;
    closeEditForm();
  }
};

onMounted(() => {
  nextTick(() => {
    setTimeout(() => {
      if (pdfViewerRef.value && pdfViewerRef.value.goToPage) {
        pdfViewerRef.value.goToPage(7);
        addLog('Navigated to page 8 where table annotations are located');
      }
    }, 2000);
  });
});
</script>

<template>
  <TestPanel
    heading="Cell Editor Test"
    description="Click on cell overlays to edit their values with SPARQL UPDATE queries on page 8."
  >
    <PDFViewer
      ref="pdfViewerRef"
      file="/pdf-tests/pdf-01.pdf"
      :annotation-fetcher="fetchAnnotations"
      @overlay-click="handleOverlayClick"
      @canvas-click="handleCanvasClick"
      :mouse-line="{ enabled: true, color: 'rgba(249, 115, 22, 0.8)', width: 2, tooltips: true }"
      @mouse-line-intersections="handleMouseLineIntersections"
    />

    <!-- Edit Form Modal -->
    <div v-if="editForm.visible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">Edit Cell Value</h3>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Cell Content:
          </label>
          <textarea
            v-model="editForm.cellValue"
            class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            rows="3"
            placeholder="Enter new cell content..."
          />
        </div>

        <div class="mb-4 p-3 bg-gray-50 rounded text-sm">
          <div><strong>IRI:</strong> {{ selectedCell?.['@id'] || 'N/A' }}</div>
          <div><strong>Position:</strong> Row {{ selectedCell?.semanticProperties?.rowIndex || '?' }}, Column {{ selectedCell?.semanticProperties?.columnIndex || '?' }}</div>
          <div><strong>Original:</strong> "{{ editForm.originalValue }}"</div>
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
            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ isSubmitting ? 'Updating...' : 'Update Cell' }}
          </button>
        </div>
      </div>
    </div>

    <div class="mt-4 space-y-2">
      <p class="text-sm text-muted-foreground">
        Click on any cell overlay to open the edit form. Move the mouse over the PDF to inspect overlays with the vertical guide.
      </p>
      <p class="text-sm text-muted-foreground">
        <template v-if="mouseLineX !== null">
          Vertical line at x={{ mouseLineX.toFixed(1) }} intersects {{ intersectingOverlays.length }} overlay(s).
        </template>
        <template v-else>
          Move the mouse over the PDF to inspect overlays with the vertical guide.
        </template>
      </p>
      <ul v-if="intersectingOverlays.length" class="list-disc pl-5 text-sm leading-6">
        <li v-for="overlay in intersectingOverlays" :key="overlay['@id'] || overlay.line">
          {{ overlay.content }}
        </li>
      </ul>
      <p v-else class="text-xs text-muted-foreground">No overlays intersect the current guide line.</p>
      <div v-if="selectedCell && editForm.visible" class="p-3 bg-blue-50 border border-blue-200 rounded text-sm">
        <strong>Currently editing:</strong> {{ selectedCell.content || 'Empty cell' }}
      </div>
    </div>
  </TestPanel>
</template>
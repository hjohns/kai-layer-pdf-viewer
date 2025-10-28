<script setup lang="ts">
import type { AnnotationFetcher } from '@/composables/usePdf';
import type { OverlayAnnotation } from '@/types/annotations';
import type { MouseLineIntersectionContext } from '@/composables/useMouseGuide';

definePageMeta({
  validate: async (route) => {
    if (!route.query.page) {
      return navigateTo({ ...route, query: { ...route.query, page: '8' } });
    }
    return true;
  }
});

const { addLog } = useLog();
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
      context.overlays.forEach(annotation => {
        const isRevision = annotation.semanticProperties?.wasRevisionOf ? ' [REVISION]' : '';
        addLog(`   • ${annotation.content}${isRevision}`);
      });
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

      if (pdfViewerRef.value && pdfViewerRef.value.refreshAnnotationsForPage) {
        await pdfViewerRef.value.refreshAnnotationsForPage();
      }
      
      await refreshData();
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
  if (pdfViewerRef.value && pdfViewerRef.value.refreshAnnotations) {
    await pdfViewerRef.value.refreshAnnotations();
  }
};

const refreshData = async () => {
  addLog(`🔄 Manually refreshing annotations from database...`);

  // Force a re-fetch by calling our fetchAnnotations function directly
  // This will re-run the SPARQL query for the current page
  try {
    if (pdfViewerRef.value?.currentPage !== undefined) {
      const currentPageNumber = pdfViewerRef.value.currentPage + 1; // currentPage is 0-indexed
      addLog(`🔍 Refreshing annotations for page ${currentPageNumber}...`);

      const refreshedData = await fetchAnnotations(currentPageNumber);
      addLog(`✅ Fetched fresh data from database`, refreshedData);

      // Trigger a component re-render by navigating to the same page
      // This will cause the PDF viewer to re-process the annotations
      if (pdfViewerRef.value.goToPage) {
        await pdfViewerRef.value.goToPage(pdfViewerRef.value.currentPage);
        addLog(`✅ Refresh completed - page re-rendered with fresh data`);
      } else {
        addLog(`⚠️ Data fetched but couldn't trigger page refresh`);
      }
    } else {
      addLog(`❌ Could not determine current page number`);
    }
  } catch (error) {
    addLog(`❌ Error during refresh: ${error}`);
  }
};

</script>

<template>
  <TestPanel
    heading="Cell Revision Test (Lightweight Provenance)"
    description="Click on cell overlays to create revisions using PROV wasRevisionOf pattern. Original cells remain unchanged."
  >
    <template #inputs>
      <div class="flex gap-2 mb-4">
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
        Click on any cell overlay to create a revision. Original cells remain unchanged. Use the toggle to view all versions or latest only.
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
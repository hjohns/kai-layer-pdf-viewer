<script setup lang="ts">
import type { AnnotationFetcher } from '@/composables/usePdf';
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
const SPARQL_ENDPOINT = 'https://ecass-fuseki.agreeablemoss-36d29f99.australiaeast.azurecontainerapps.io/confidence/query';
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

const handleCanvasClick = (context: { x: number; y: number; pageNumber: number }) => {
  addLog(`Canvas clicked at (${context.x.toFixed(1)}, ${context.y.toFixed(1)})`);
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

</script>

<template>
  <TestPanel
    heading="PDF 16 Remote Vertical Tooltips"
    description="Combine remote JSON-LD annotations from Fuseki with vertical mouse guide inspection on page 8."
  >
    <PDFViewer
      file="/pdf-tests/pdf-01.pdf"
      :annotation-fetcher="fetchAnnotations"
      @overlay-click="handleOverlayClick"
      @canvas-click="handleCanvasClick"
      :mouse-line="{ enabled: true, color: 'rgba(249, 115, 22, 0.8)', width: 2, tooltips: true }"
      @mouse-line-intersections="handleMouseLineIntersections"
    />
    <div class="mt-4 space-y-2">
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
    </div>
  </TestPanel>
</template>

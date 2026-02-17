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
  try {
    const sparqlQuery = SPARQL_QUERY_TEMPLATE.replace('UNDEF', pageNumber.toString());

    const url = `${SPARQL_ENDPOINT}?` +
      new URLSearchParams({ query: sparqlQuery }).toString();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/ld+json'
      }
    });

    if (!response.ok) {
      return { overlay: [] };
    }

    const payload = await response.json();
    return payload;
  } catch (error) {
    return { overlay: [] };
  }
};

const handleOverlayClick = (overlay: OverlayAnnotation) => {
  // Handle overlay click silently
};

const handleCanvasClick = (context: { x: number; y: number; pageNumber: number }) => {
  // Handle canvas click silently
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
  }
};

</script>

<template>
  <div class="w-full h-screen bg-background">
    <PDFViewer
      file="/pdf-tests/pdf-01.pdf"
      :annotation-fetcher="fetchAnnotations"
      @overlay-click="handleOverlayClick"
      @canvas-click="handleCanvasClick"
      :mouse-line="{ enabled: true, color: 'rgba(249, 115, 22, 0.8)', width: 2, tooltips: true }"
      @mouse-line-intersections="handleMouseLineIntersections"
      class="w-full h-full"
    />

    <!-- Optional: Simple status overlay -->
    <div
      v-if="mouseLineX !== null && intersectingOverlays.length > 0"
      class="absolute top-4 right-4 bg-black/80 text-white p-3 rounded-lg shadow-lg max-w-sm"
    >
      <p class="text-sm font-medium mb-2">
        Line at x={{ mouseLineX.toFixed(1) }} intersects {{ intersectingOverlays.length }} items:
      </p>
      <ul class="text-xs space-y-1">
        <li v-for="overlay in intersectingOverlays.slice(0, 5)" :key="overlay['@id'] || overlay.line">
          {{ overlay.content }}
        </li>
        <li v-if="intersectingOverlays.length > 5" class="italic opacity-70">
          ... and {{ intersectingOverlays.length - 5 }} more
        </li>
      </ul>
    </div>
  </div>
</template>
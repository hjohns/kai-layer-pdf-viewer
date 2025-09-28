<script setup lang="ts">
import type { AnnotationFetcher } from '@/composables/usePdf';

const { addLog } = useLog();
const SPARQL_ENDPOINT = 'https://ecass-fuseki.agreeablemoss-36d29f99.australiaeast.azurecontainerapps.io/test/query';
const SPARQL_QUERY = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
CONSTRUCT WHERE {
  ?sub ?pred ?obj .
}`;

const fetchAnnotations: AnnotationFetcher = async (pageNumber) => {
  // Endpoint currently returns annotations for page 8 in the dataset
  if (pageNumber !== 8) {
    addLog(`Skipping remote fetch for page ${pageNumber}`);
    return { overlay: [] };
  }

  addLog(`Fetching JSON-LD annotations from Fuseki for page ${pageNumber}`);

  try {
    const url = `${SPARQL_ENDPOINT}?` +
      new URLSearchParams({ query: SPARQL_QUERY }).toString();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/ld+json'
      }
    });

    if (!response.ok) {
      addLog(`SPARQL request failed with status ${response.status}`);
      return { overlay: [] };
    }

    const payload = await response.json();

    addLog(`Received JSON-LD payload for page ${pageNumber}`);
    return payload;
  } catch (error) {
    console.error('Failed to fetch SPARQL annotations', error);
    addLog(`Failed to fetch annotations for page ${pageNumber}`);
    return { overlay: [] };
  }
};
</script>

<template>
  <TestPanel
    heading="PDF 15 SPARQL JSON-LD"
    description="Annotations load directly from the Fuseki SPARQL endpoint with application/ld+json negotiation."
  >
    <PDFViewer
      file="/pdf-tests/pdf-01.pdf"
      :annotation-fetcher="fetchAnnotations"
    />
  </TestPanel>
</template>

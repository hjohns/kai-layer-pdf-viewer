<script setup lang="ts">
import type { AnnotationFetcher } from '@/composables/usePdf';

const { addLog } = useLog();
const nuxtApp = useNuxtApp();

const fetchAnnotations: AnnotationFetcher = async (pageNumber) => {
  addLog(`Fetching annotations from API for page ${pageNumber}`);
  try {
    const payload = await nuxtApp.$fetch(`/api/pdf/${pageNumber}/annotations`);
    addLog(`Received annotation payload for page ${pageNumber}`);
    return payload;
  } catch (error) {
    console.error('Failed to fetch annotations for page', pageNumber, error);
    addLog(`Failed to fetch annotations for page ${pageNumber}`);
    return { overlay: [] };
  }
};
</script>

<template>
  <TestPanel
    heading="PDF 14 API-backed Annotations"
    description="Annotations are retrieved through a mocked REST endpoint that returns JSON or JSON-LD per page."
  >
    <PDFViewer
      file="/pdf-tests/pdf-01.pdf"
      :annotation-fetcher="fetchAnnotations"
    />
  </TestPanel>
</template>

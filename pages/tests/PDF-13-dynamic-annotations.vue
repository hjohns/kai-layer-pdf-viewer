<script setup lang="ts">
import type { AnnotationFetcher } from '@/composables/usePdf';

const { addLog } = useLog();

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const annotationStore: Record<number, { overlay: Array<{ page: string; rect: number[]; content: string; line?: number }> }> = {
  1: {
    overlay: [
      {
        page: '1',
        rect: [
          1.2296,
          0.6163,
          3.1505,
          0.6129,
          3.1508,
          0.7734,
          1.2299,
          0.7767
        ],
        content: 'CHAIN OF CUSTODY RECORD',
        line: 0
      },
      {
        page: '1',
        rect: [
          3.6133,
          0.6291,
          4.1275,
          0.6385,
          4.1258,
          0.7335,
          3.6116,
          0.7241
        ],
        content: 'Eurofins | mgt',
        line: 2
      }
    ]
  },
  8: {
    overlay: [
      {
        page: '8',
        rect: [
          2.5332,
          1.8968,
          4.4883,
          1.9002,
          4.4883,
          2.0938,
          2.5332,
          2.0904
        ],
        content: 'Sample dynamic fetch annotation',
        line: 0
      }
    ]
  }
};

const fetchAnnotations: AnnotationFetcher = async (pageNumber) => {
  addLog(`Fetching annotations for page ${pageNumber}`);
  await wait(200);
  const payload = annotationStore[pageNumber];
  if (!payload) {
    addLog(`No annotations returned for page ${pageNumber}`);
    return { overlay: [] };
  }
  addLog(`Returned ${payload.overlay.length} annotation(s) for page ${pageNumber}`);
  return payload;
};
</script>

<template>
  <TestPanel
    heading="PDF 13 Dynamic Annotations"
    description="Annotations load on demand via an async fetcher so the host application can stream them page by page."
  >
    <PDFViewer
      file="/pdf-tests/pdf-01.pdf"
      :annotation-fetcher="fetchAnnotations"
    />
  </TestPanel>
</template>

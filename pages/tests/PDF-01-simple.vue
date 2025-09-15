<script setup lang="ts">
import { useMuPdf } from '@/composables/useMuPdf';

const { workerInitialized, loadDocument, renderPage, currentPage, getPageCount, annotations, getMetadata, addSquareAnnotation, addAnnotation } = useMuPdf();

</script>

<template>
    <div>
        <TestPanel heading="PDF 01 Simple" description="Test PDF 01 simple">
            <PDFViewer 
                documentId="/pdf-tests/pdf-01-overlay.json" 
                file="/pdf-tests/pdf-01.pdf"
            />
        </TestPanel>
    </div>
</template>
<script setup lang="ts">
definePageMeta({
  validate: async (route) => {
    if (!route.query.page) {
      return navigateTo({ ...route, query: { ...route.query, page: '8' } });
    }
    return true;
  }
});
</script>

<template>
    <TestPanel heading="PDF 01 Simple" description="Test PDF 01 simple">
        <PDFViewer 
            overlays="/pdf-tests/pdf-01-overlay.json" 
            file="/pdf-tests/pdf-01.pdf"
        />
    </TestPanel>
</template>
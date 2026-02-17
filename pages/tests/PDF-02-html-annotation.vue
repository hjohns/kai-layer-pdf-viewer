<script setup lang="ts">
definePageMeta({
  middleware: [
    (route) => {
      if (!route.query.page) {
        return navigateTo({ ...route, query: { ...route.query, page: '8' } });
      }
    }
  ]
});
</script>

<template>
  <div>
    <TestPanel 
      heading="PDF 02 Simple HTML Annotation" 
      description="Ultra-simple HTML overlay rendering with just an htmlAnnotation prop"
    >      
      <PDFViewer 
        file="/pdf-tests/pdf-01.pdf" 
        overlays="/pdf-tests/pdf-01-overlay.json"
        :htmlAnnotation="(context, annotation) => `<div class='bg-white border p-2 rounded'>${annotation.content}</div>`"
      />
    </TestPanel>
  </div>
</template>

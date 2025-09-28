<template>
  <TestPanel
    heading="PDF 12 Inline Annotations"
    description="PDF viewer consumes inline JSON overlay data"
  >
    <PDFViewer
      :overlays-data="inlineOverlays"
      file="/pdf-tests/pdf-01.pdf"
    />
  </TestPanel>
</template>

<script setup lang="ts">
const inlineOverlays = {
  overlay: [
    {
      page: "1",
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
      content: "CHAIN OF CUSTODY RECORD",
      line: 0
    }
  ]
};
</script>

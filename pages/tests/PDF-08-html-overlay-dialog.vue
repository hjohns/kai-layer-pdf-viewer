<template>
  <div>
    <TestPanel 
      heading="PDF 08 HTML Overlay + Dialog" 
      description="HTML overlays with custom click dialog"
    >
      <PDFViewer 
        :file="pdfFile" 
        :overlays="overlays"
        :htmlAnnotation="renderHtmlOverlay"
        @overlay-click="handleOverlayClick"
      />
    </TestPanel>

    <!-- Custom Dialog -->
    <Dialog :open="showDialog" @update:open="showDialog = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>HTML Overlay Clicked</DialogTitle>
          <DialogDescription>
            You clicked on an HTML-rendered overlay
          </DialogDescription>
        </DialogHeader>
        
        <div v-if="clickedOverlay" class="py-4">
          <p><strong>Content:</strong> {{ clickedOverlay.content }}</p>
          <p><strong>Page:</strong> {{ clickedOverlay.page }}</p>
          <p><strong>Rendered as:</strong> HTML overlay with custom styling</p>
        </div>
        
        <DialogFooter>
          <Button variant="outline" @click="rejectOverlay">Reject</Button>
          <Button @click="approveOverlay">Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { OverlayAnnotation } from '@/types/annotations';

const { addLog } = useLog();

// PDF file configuration
const pdfFile = '/pdf-tests/pdf-01.pdf';
const overlays = '/pdf-tests/pdf-01-overlay.json';

// State for custom dialog
const showDialog = ref(false);
const clickedOverlay = ref<OverlayAnnotation | null>(null);

// HTML overlay renderer
const renderHtmlOverlay = (context: any, annotation: OverlayAnnotation) => {
  return `<div class='bg-blue-100 border border-blue-300 p-2 rounded shadow-sm text-blue-800 font-semibold'>${annotation.content}</div>`;
};

// Handle overlay click events
const handleOverlayClick = (overlay: OverlayAnnotation) => {
  clickedOverlay.value = overlay;
  showDialog.value = true;
  addLog(`HTML overlay clicked: ${overlay.content}`);
};

// Handle dialog actions
const approveOverlay = () => {
  if (clickedOverlay.value) {
    addLog(`APPROVED HTML overlay: ${clickedOverlay.value.content}`);
  }
  showDialog.value = false;
  clickedOverlay.value = null;
};

const rejectOverlay = () => {
  if (clickedOverlay.value) {
    addLog(`REJECTED HTML overlay: ${clickedOverlay.value.content}`);
  }
  showDialog.value = false;
  clickedOverlay.value = null;
};

addLog('PDF-08: HTML overlay + dialog example loaded');
</script>

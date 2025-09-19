<script setup lang="ts">
import { ref } from 'vue';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { OverlayAnnotation } from '@/types/annotations';

const { addLog } = useLog();

// State for custom dialog
const showDialog = ref(false);
const clickedOverlay = ref<OverlayAnnotation | null>(null);

// Handle overlay click events
const handleOverlayClick = (overlay: OverlayAnnotation) => {
  clickedOverlay.value = overlay;
  showDialog.value = true;
  addLog(`Overlay clicked: ${overlay.content} - showing dialog`);
};

// Handle dialog actions
const approveOverlay = () => {
  if (clickedOverlay.value) {
    addLog(`APPROVED: ${clickedOverlay.value.content}`);
  }
  showDialog.value = false;
  clickedOverlay.value = null;
};

const rejectOverlay = () => {
  if (clickedOverlay.value) {
    addLog(`REJECTED: ${clickedOverlay.value.content}`);
  }
  showDialog.value = false;
  clickedOverlay.value = null;
};

addLog('PDF-07: Custom dialog example loaded - click overlays');
</script>

<template>
  <div>
    <TestPanel 
      heading="PDF 07 Custom Dialog" 
      description="Shows custom approve/reject dialog with overlay details"
    >
      <div class="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-500 mb-6">
        <h3 class="text-lg font-semibold text-purple-800 mb-3">Custom Dialog Features</h3>
        <ul class="space-y-1 text-sm">
          <li class="text-gray-700">• Click overlays to show custom dialog</li>
          <li class="text-gray-700">• Shows overlay content and page info</li>
          <li class="text-gray-700">• Approve/reject actions with logging</li>
          <li class="text-gray-700">• Clean, minimal dialog implementation</li>
        </ul>
      </div>
      
      <PDFViewer 
        file="/pdf-tests/pdf-01.pdf" 
        overlays="/pdf-tests/pdf-01-overlay.json"
        @overlay-click="handleOverlayClick"
      />
    </TestPanel>

    <!-- Custom Dialog -->
    <Dialog :open="showDialog" @update:open="showDialog = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Overlay Clicked</DialogTitle>
          <DialogDescription>
            What would you like to do with this overlay?
          </DialogDescription>
        </DialogHeader>
        
        <div v-if="clickedOverlay" class="space-y-3">
          <div class="bg-gray-50 p-3 rounded-lg">
            <h4 class="font-semibold text-gray-800 mb-2">Overlay Details</h4>
            <p class="text-sm"><strong>Content:</strong> {{ clickedOverlay.content }}</p>
            <p class="text-sm"><strong>Page:</strong> {{ clickedOverlay.page }}</p>
            <p class="text-sm"><strong>Line:</strong> {{ clickedOverlay.line }}</p>
            <p class="text-sm"><strong>Type:</strong> {{ clickedOverlay.type || 'standard' }}</p>
          </div>
          
          <div class="bg-blue-50 p-3 rounded-lg">
            <h4 class="font-semibold text-blue-800 mb-2">Actions</h4>
            <p class="text-sm text-gray-600">Choose to approve or reject this overlay annotation.</p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" @click="rejectOverlay">Reject</Button>
          <Button @click="approveOverlay">Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

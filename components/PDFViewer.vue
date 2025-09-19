<template>
    <div>
      <div class="relative w-full h-full">
        <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-background/80">
          <LucideLoader2 class="h-8 w-8 animate-spin"/>
        </div>
        
        <div v-else-if="error" class="absolute inset-0 flex items-center justify-center">
          <p class="text-destructive">{{ error }}</p>
        </div>
        
        <div v-else-if="pdfDocument" class="p-4">
          <div class="pdf-toolbar mb-4 flex items-center gap-4 bg-muted p-2 rounded-lg">
            <div class="flex items-center gap-4 flex-1">
              <Button 
                variant="ghost" 
                size="icon"
                :disabled="!canGoPrev"
                @click="prevPage"
              >
                <LucideChevronLeft class="h-4 w-4" />
              </Button>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  :value="currentPage + 1"
                  @change="e => goToPage(Number((e.target as HTMLInputElement).value) - 1)"
                  class="w-16 h-8 text-center rounded border bg-background border-input hover:border-accent focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span class="text-sm text-muted-foreground">of {{ totalPages }}</span>
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                :disabled="!canGoNext"
                @click="nextPage"
              >
                <LucideChevronRight class="h-4 w-4" />
              </Button>
              <div class="flex-1 flex items-center justify-end gap-4 text-sm text-muted-foreground">
                <span v-if="metadata.author">By {{ metadata.author }}</span>
                <span v-if="metadata.modDate">Modified {{ metadata.modDate }}</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Button variant="ghost" size="icon" @click="zoomOut">
                <LucideZoomOut class="h-4 w-4" />
              </Button>
              <span class="text-sm">{{ zoomPercentage }}%</span>
              <Button variant="ghost" size="icon" @click="zoomIn">
                <LucideZoomIn class="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div class="mt-4 pdf-container" ref="containerRef">
            <div class="relative">
              <canvas 
                ref="canvasRef" 
                class="border" 
                style="min-width: 100px; min-height: 100px;"
                @click="handleCanvasClick"
                @mousemove="handleCanvasMouseMove"
                @mouseleave="handleCanvasMouseLeave"
              ></canvas>
              <canvas
                ref="overlayCanvasRef"
                class="absolute top-0 left-0 pointer-events-none"
                style="min-width: 100px; min-height: 100px;"
              ></canvas>
              <!-- HTML Overlay Container - Built into PDFViewer -->
              <div 
                ref="htmlOverlayContainer"
                class="absolute top-0 left-0 w-full h-full"
                style="z-index: 50; pointer-events: none;"
              >
                <!-- HTML overlay elements will be added here automatically -->
              </div>
            </div>
          </div>
        </div>
  
        <div v-else class="absolute inset-0 flex items-center justify-center">
          <p class="text-muted-foreground">No PDF selected</p>
        </div>
      </div>
  
    </div>
  </template>
  
  <script setup lang="ts">
  import { watch, onMounted, onBeforeUnmount } from "vue";  
  import { usePdf } from '@/composables/usePdf';
  
  import type { OverlayAnnotation } from '@/types/annotations';
  import type { AnnotationRenderContext } from '@/composables/usePdfAnnotations';

  const props = defineProps<{ 
    overlays: string | null, 
    file: string,
    htmlAnnotation?: (context: AnnotationRenderContext, annotation: OverlayAnnotation) => string
  }>();

  // Define events that the component can emit
  const emit = defineEmits<{
    'overlay-click': [overlay: OverlayAnnotation, context: { x: number, y: number, pageNumber: number }]
    'canvas-click': [event: { x: number, y: number, pageNumber: number }]
  }>();
  
  const { 
    // State
    pdfDocument,
    currentPage,
    totalPages,
    isLoading,
    error,
    metadata,
    workerInitialized,
    canvasRef,
    overlayCanvasRef,
    htmlOverlayContainer,
    
    
    // Methods
    loadPdf,
    initializePdfCoordinates,
    displayPage,
    goToPage,
    nextPage,
    prevPage,
    zoomIn,
    zoomOut,
    handleCanvasClick,
    handleCanvasMouseMove,
    handleCanvasMouseLeave,
    cleanup,
    cleanupProviders,
    
    // Computed
    canGoNext,
    canGoPrev,
    zoomPercentage
  } = usePdf(
    props.htmlAnnotation,
    // onOverlayClick handler
    (overlay: OverlayAnnotation, context: { x: number, y: number, pageNumber: number }) => {
      emit('overlay-click', overlay, context);
    },
    // onCanvasClick handler  
    (context: { x: number, y: number, pageNumber: number }) => {
      emit('canvas-click', context);
    }
  );
  
  
  watch(
    () => props.file,
    async (newFile) => {
      if (!newFile) return;
      console.log("File changed, loading new PDF:", newFile);
      await loadPdf(newFile, props.overlays!);
    },
    { immediate: true }
  );
  
  watch(workerInitialized, async (isInitialized) => {
    if (isInitialized && props.file) {
      await loadPdf(props.file, props.overlays!);
    }
  });
  
  watch(canvasRef, (newCanvas) => {
    if (newCanvas && pdfDocument.value && currentPage.value === 0) {
      console.log("Canvas now available, displaying first page");
      displayPage(0);
    }
  });
  
  onMounted(() => {
    console.log("Component mounted, canvas ref:", canvasRef.value);
  });
  
  onBeforeUnmount(() => {
    try {
      cleanup();
    } catch (e) {
      console.error("Error during component cleanup:", e);
    }
  });
  </script>
  
  <style scoped>
  
  .pdf-viewer-wrapper {
    @apply h-full flex flex-col;
  }
  
  .canvas-container {
    @apply flex-1 overflow-auto bg-muted flex justify-center items-center p-4;
  }
  
  .pdf-viewer {
    @apply flex-1 flex flex-col overflow-hidden;
  }
  
  .pagination-container {
    @apply bg-background p-4 border-b text-center sticky top-0 z-10;
  }
  
  .pagination-content {
    @apply flex justify-center items-center gap-2;
  }
  
  .page-label {
    @apply mx-2;
  }
  
  .pdf-container {
    @apply min-h-[400px] w-full flex justify-center overflow-auto;
  }
  
  canvas {
    @apply max-w-full shadow-lg block;
  }
  
  .no-pdf-message {
    @apply flex justify-center items-center h-full text-lg text-muted-foreground;
  }
  </style>
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
                ref="annotationCanvasRef"
                class="absolute top-0 left-0 pointer-events-none"
                style="min-width: 100px; min-height: 100px;"
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
import { watch, onMounted, onBeforeUnmount, nextTick } from "vue";  
import { usePdf } from '@/composables/usePdf';

import type { OverlayAnnotation } from '@/types/annotations';
import type { AnnotationRenderContext, AnnotationSource } from '@/composables/usePdfAnnotations';
import type { AnnotationFetcher } from '@/composables/usePdf';
import type {
  MouseLineTooltipOptions,
  MouseLineIntersectionContext,
  MouseLineOrientation
} from '@/composables/useMouseGuide';

type MouseLineTooltipProp = boolean | ({ enabled?: boolean } & Partial<Omit<MouseLineTooltipOptions, 'enabled'>>);

interface MouseLinePropConfig {
  enabled?: boolean;
  color?: string;
  width?: number;
  orientation?: MouseLineOrientation;
  tooltips?: MouseLineTooltipProp;
}

const props = defineProps<{
  overlays?: string | null,
  overlaysData?: unknown,
  annotationFetcher?: AnnotationFetcher | null,
  file: string,
  htmlAnnotation?: (context: AnnotationRenderContext, annotation: OverlayAnnotation) => string,
  mouseLine?: MouseLinePropConfig,
  page?: number
}>();

// Define events that the component can emit
const emit = defineEmits<{
  'overlay-click': [overlay: OverlayAnnotation, context: { x: number, y: number, pageNumber: number }]
    'canvas-click': [event: { x: number, y: number, pageNumber: number }]
    'mouse-line-intersections': [context: MouseLineIntersectionContext]
}>();

const toMouseLineOptions = (config?: MouseLinePropConfig) => ({
  enabled: config?.enabled ?? false,
  color: config?.color ?? 'rgba(59, 130, 246, 0.65)',
  width: config?.width ?? 1.5,
  orientation: config?.orientation ?? 'vertical',
  tooltips: config?.tooltips,
  onIntersections: (context: MouseLineIntersectionContext) => {
    emit('mouse-line-intersections', context);
  }
});

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
    annotationCanvasRef,
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
    setMouseLineOptions,
    setAnnotationFetcher,
    refreshAnnotationsForPage,
    
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
    },
    {
      mouseLine: toMouseLineOptions(props.mouseLine),
      annotationFetcher: props.annotationFetcher ?? null
    }
  );
  
  let lastLoadedFile: string | null = null;
  let lastAnnotationUrl: string | null = null;
  let lastInlineAnnotationRef: unknown = null;

  const loadCurrentPdf = async () => {
    if (!props.file || !workerInitialized.value) {
      return;
    }

    const hasInlineData = props.overlaysData !== undefined && props.overlaysData !== null;
    const annotationSource: AnnotationSource | null = hasInlineData
      ? { data: props.overlaysData }
      : (props.overlays ?? null);

    if (props.overlays && hasInlineData) {
      console.warn('PDFViewer: Both overlays URL and inline data provided, using inline data');
    }

    const hasAnnotationFetcher = typeof props.annotationFetcher === 'function';

    if (!annotationSource && !hasAnnotationFetcher) {
      console.warn('PDFViewer: No overlays source provided, skipping load');
      return;
    }

    const isSameUrlSource =
      typeof annotationSource === 'string' &&
      lastLoadedFile === props.file &&
      lastAnnotationUrl === annotationSource;

    const isSameInlineSource =
      typeof annotationSource !== 'string' &&
      lastLoadedFile === props.file &&
      lastInlineAnnotationRef === props.overlaysData;

    const isSameFetcherOnly =
      !annotationSource &&
      hasAnnotationFetcher &&
      lastLoadedFile === props.file &&
      lastAnnotationUrl === null &&
      lastInlineAnnotationRef === null;

    if (isSameUrlSource || isSameInlineSource || isSameFetcherOnly) {
      return;
    }

    console.log("Loading PDF:", props.file);
    await loadPdf(props.file, annotationSource);
    lastLoadedFile = props.file;

    if (typeof annotationSource === 'string') {
      lastAnnotationUrl = annotationSource;
      lastInlineAnnotationRef = null;
    } else if (annotationSource) {
      lastAnnotationUrl = null;
      lastInlineAnnotationRef = props.overlaysData;
    } else {
      lastAnnotationUrl = null;
      lastInlineAnnotationRef = null;
    }
  };

  watch(
    [() => props.file, workerInitialized],
    async () => {
      await loadCurrentPdf();
    },
    { immediate: true }
  );

  watch(
    () => props.annotationFetcher,
    async (fetcher, previous) => {
      if (fetcher === previous) {
        return;
      }

      setAnnotationFetcher(fetcher);
      lastLoadedFile = null;
      lastAnnotationUrl = null;
      lastInlineAnnotationRef = null;

      if (workerInitialized.value) {
        await loadCurrentPdf();
      }
    }
  );

  watch(
    () => props.overlays,
    async () => {
      lastLoadedFile = null;
      lastAnnotationUrl = null;
      lastInlineAnnotationRef = null;
      await loadCurrentPdf();
    }
  );

  watch(
    () => props.overlaysData,
    async () => {
      lastLoadedFile = null;
      lastAnnotationUrl = null;
      lastInlineAnnotationRef = null;
      await loadCurrentPdf();
    },
    { deep: true }
  );
  
  watch(canvasRef, (newCanvas) => {
    if (newCanvas && pdfDocument.value && currentPage.value === 0) {
      console.log("Canvas now available, displaying first page");
      displayPage(0);
    }
  });

  watch(
    () => props.mouseLine,
    (config) => {
      setMouseLineOptions(toMouseLineOptions(config));
    },
    { deep: true }
  );

  // Watch for page prop changes and navigate to the specified page
  watch(
    () => props.page,
    (newPage) => {
      if (newPage !== undefined && pdfDocument.value) {
        // Convert 1-based page number to 0-based index
        const pageIndex = newPage - 1;
        if (pageIndex >= 0 && pageIndex < totalPages.value) {
          goToPage(pageIndex);
        }
      }
    }
  );

  onMounted(() => {
    console.log("Component mounted, canvas ref:", canvasRef.value);

    // Navigate to initial page if specified
    if (props.page !== undefined) {
      nextTick(() => {
        setTimeout(() => {
          if (pdfDocument.value) {
            const pageIndex = props.page! - 1;
            if (pageIndex >= 0 && pageIndex < totalPages.value) {
              goToPage(pageIndex);
            }
          }
        }, 500);
      });
    }
  });
  
  onBeforeUnmount(() => {
    try {
      cleanup();
    } catch (e) {
      console.error("Error during component cleanup:", e);
    }
  });

  // Expose methods and state to parent components
  defineExpose({
    currentPage,
    refreshAnnotationsForPage,
    goToPage
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

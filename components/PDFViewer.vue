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
                :disabled="currentPage <= 0"
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
                :disabled="currentPage >= totalPages - 1"
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
              <span class="text-sm">{{ Math.round(zoom * 100) }}%</span>
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
              ></canvas>
              <canvas
                ref="overlayCanvasRef"
                class="absolute top-0 left-0 pointer-events-none"
                style="min-width: 100px; min-height: 100px;"
              ></canvas>
            </div>
          </div>
        </div>
  
        <div v-else class="absolute inset-0 flex items-center justify-center">
          <p class="text-muted-foreground">No PDF selected</p>
        </div>
      </div>
  
      <Dialog :open="showDialog" @update:open="showDialog = $event" modal>
        <DialogContent class="z-[100]">
          <DialogHeader>
            <DialogTitle>Annotation Details</DialogTitle>
          </DialogHeader>
          <div v-if="selectedAnnotation">
            <p class="text-lg">{{ selectedAnnotation.content }}</p>
          </div>
          <div>
            
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <Button @click="showDialog = false">
              Approve
            </Button>
            <Button variant="secondary" @click="showDialog = false">
              Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, watch, onMounted, onBeforeUnmount } from "vue";
  import { DateTime } from 'luxon'
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from '#components';
  import type { DocAnnotation } from '@/workers/mupdf.worker';
  
  const runtime = useRuntimeConfig();
  
  const props = defineProps<{ documentId: string | null, file: string }>();
  
  const { workerInitialized, loadDocument, renderPage, getPageCount, getMetadata } = useMuPdf();
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  const pdfDocument = ref<any | null>(null);
  const currentPage = ref(0);
  const totalPages = ref(0);
  const zoom = ref(1);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const pageUrls = ref<string[]>([]);
  const showDialog = ref(false);
  const selectedAnnotation = ref<{ rect: [number, number, number, number], content: string } | null>(null);
  const pageAnnotations = ref<Array<DocAnnotation>>([]);
  const annotationPaths = ref(new Map<string, { path: Path2D, annotation: DocAnnotation }>());
  const overlayCanvasRef = ref<HTMLCanvasElement | null>(null);
  
  const formatPdfDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const cleaned = dateStr.replace(/^D:/, '').replace(/'.*$/, '');
      return DateTime.fromFormat(cleaned, "yyyyMMddHHmmssZ")
        .setZone('local')
        .toLocaleString(DateTime.DATETIME_MED);
    } catch {
      return dateStr;
    }
  };
  
  const metadata = ref({ format: '', modDate: '', author: '' });
  const annotations = ref<string[]>([]);
  
  const cleanup = () => {
    console.log("Cleaning up PDF resources");
    pdfDocument.value = null;
    totalPages.value = 0;
    metadata.value = { format: '', modDate: '', author: '' };
    annotations.value = [];
    
    // Cleanup page URLs
    pageUrls.value.forEach(url => URL.revokeObjectURL(url));
    pageUrls.value = [];
    
    // Clear annotation paths
    annotationPaths.value.clear();
    
    // Clear overlay canvas if it exists
    if (overlayCanvasRef.value) {
      const ctx = overlayCanvasRef.value.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvasRef.value.width, overlayCanvasRef.value.height);
      }
    }
  };
  
  const clearAnnotations = () => {
    // Clear annotation paths
    annotationPaths.value.clear();
    
    // Clear overlay canvas
    if (overlayCanvasRef.value) {
      const ctx = overlayCanvasRef.value.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvasRef.value.width, overlayCanvasRef.value.height);
      }
    }
  };
  
  const loadPageAnnotations = async (pageNumber: number) => {
    //const page = await pdfDocument.value?.loadPage(pageNumber);
    // try {
    //   const annots = await getAnnotations(pageNumber);
    //   return annots.map((annot: { type: string }) => {
    //     return `Annotation: ${annot.type}`;
    //   });
    // } catch (e) {
    //   console.error("Error getting annotations:", e);
    //   return [];
    // }
  };
  
  const displayPage = async (pageNumber: number) => {
    // Clear previous page's annotations
    clearAnnotations();
    
    if (!canvasRef.value) return;
  
    try {
      const ctx = canvasRef.value.getContext('2d');
      if (!ctx) return;
  
      // Apply zoom to scale
      const baseScale = (window.devicePixelRatio * 96) / 72;
      const scaledScale = baseScale * zoom.value;
      const pngData = await renderPage(pageNumber);
      const url = URL.createObjectURL(new Blob([pngData], { type: 'image/png' }));
      pageUrls.value[pageNumber] = url;
  
      const img = new Image();
      img.onload = () => {
        canvasRef.value!.width = img.width;
        canvasRef.value!.height = img.height;
        if (overlayCanvasRef.value) {
          overlayCanvasRef.value.width = img.width;
          overlayCanvasRef.value.height = img.height;
          overlayCanvasRef.value.style.transform = `scale(${zoom.value})`;
          overlayCanvasRef.value.style.transformOrigin = 'top center';
        }
        canvasRef.value!.style.transform = `scale(${zoom.value})`;
        canvasRef.value!.style.transformOrigin = 'top center';
        ctx.drawImage(img, 0, 0);
  
        // Debug: Draw annotation boundaries
        const currentPageAnnotations = pageAnnotations.value.filter(
          (annotation: DocAnnotation) => annotation.page === (pageNumber + 1).toString()
        );
        
        const PDF_POINTS_PER_INCH = 72;
        const SCALE_FACTOR = 1;
        const effectiveDpi = baseScale * PDF_POINTS_PER_INCH * SCALE_FACTOR;
        
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        
        for (const annotation of currentPageAnnotations) {
          // Create unique ID for this annotation
          const annotationId = `annotation-${annotation.page}-${annotation.line}`;
          
          // Draw polygon using all points
          ctx.beginPath();
          for (let i = 0; i < annotation.rect.length; i += 2) {
            const x = annotation.rect[i] * effectiveDpi;
            const y = annotation.rect[i + 1] * effectiveDpi;
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.closePath();
          // Add data attributes for hover
          ctx.fillStyle = 'rgba(255, 0, 0, 0)';
          ctx.fill();
          ctx.stroke();
          
          // Save the path for hit testing
          const path = new Path2D();
          // Recreate the same path
          for (let i = 0; i < annotation.rect.length; i += 2) {
            const x = annotation.rect[i] * effectiveDpi;
            const y = annotation.rect[i + 1] * effectiveDpi;
            if (i === 0) {
              path.moveTo(x, y);
            } else {
              path.lineTo(x, y);
            }
          }
          path.closePath();
          annotationPaths.value.set(annotationId, { path, annotation });
        }
      };
      img.src = url;
    } catch (err) {
      console.error("Error rendering page:", err);
      error.value = "Failed to render page";
    }
  };
  
  const loadPdf = async (file: string, docId: string) => {
    if (!file) return;
    
    console.log('Loading PDF:', file);
    isLoading.value = true;
    error.value = null;
    clearAnnotations();
  
    try {
      const response = await fetch(file);
  
      const [pdfName, matchType, matchRange] = props.documentId!.split("/");
  
      let docAnnotations:any = {}
      try {
        //const anon = await fetch(runtime.public.pdfOverlayContainerBaseUrl + `${pdfName}.overlay.json`)
        const anon = await fetch(docId)
        docAnnotations = await anon.json()
        console.log("ANNONS = ", docAnnotations)
        pageAnnotations.value = docAnnotations?.overlay || [];
      } catch (e) {
        console.error("Error fetching overlay:", e);
      }
  
      console.log('PDF fetch response:', response.status);
      const arrayBuffer = await response.arrayBuffer();
      console.log('PDF arrayBuffer size:', arrayBuffer.byteLength);
      
      await loadDocument(arrayBuffer, docAnnotations?.overlay);
      console.log('PDF document loaded');
      pdfDocument.value = true;
          
      totalPages.value = await getPageCount();
      console.log('Total pages:', totalPages.value);
      
      metadata.value = {
        format: await getMetadata("format") || '',
        modDate: formatPdfDate(await getMetadata("info:ModDate") || ''),
        author: await getMetadata("info:Author") || ''
      };
  
      
      if (currentPage.value === 0) {
        displayPage(0);
      }
    } catch (err) {
      console.error("Error loading PDF:", err);
      error.value = "Failed to load PDF";
    } finally {
      isLoading.value = false;
    }
  };
  
  const goToPage = (page: number) => {
    if (!pdfDocument.value) return;
    if (page < 0 || page >= totalPages.value) return;
    currentPage.value = page;
    displayPage(page);
  };
  
  const nextPage = () => goToPage(currentPage.value + 1);
  const prevPage = () => goToPage(currentPage.value - 1);
  
  const zoomIn = () => {
    zoom.value = Math.min(zoom.value * 1.2, 3);
    if (pdfDocument.value) {
      displayPage(currentPage.value);
    }
  };
  
  const zoomOut = () => {
    zoom.value = Math.max(zoom.value / 1.2, 0.3);
    if (pdfDocument.value) {
      displayPage(currentPage.value);
    }
  };
  
  const handleCanvasClick = (event: MouseEvent) => {
    if (!canvasRef.value || !overlayCanvasRef.value) return;
    const ctx = canvasRef.value.getContext('2d');
    if (!ctx) return;
    
    const rect = canvasRef.value.getBoundingClientRect();
    const scaleX = canvasRef.value.width / rect.width;
    const scaleY = canvasRef.value.height / rect.height;
    
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    
    for (const { path, annotation } of annotationPaths.value.values()) {
      if (ctx.isPointInPath(path, x, y)) {
        selectedAnnotation.value = annotation;
        showDialog.value = true;
        break;
      }
    }
  };
  
  const isPointInPolygon = (point: { x: number, y: number }, polygon: number[]) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 2; i < polygon.length; i += 2) {
      const xi = polygon[i], yi = polygon[i + 1];
      const xj = polygon[j], yj = polygon[j + 1];
      
      const intersect = ((yi > point.y) !== (yj > point.y))
          && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
      
      j = i;
    }
    return inside;
  };
  
  const handleCanvasMouseMove = (event: MouseEvent) => {
    if (!canvasRef.value || !overlayCanvasRef.value) return;
    const ctx = overlayCanvasRef.value.getContext('2d');
    if (!ctx) return;
    
    const rect = canvasRef.value.getBoundingClientRect();
    const scaleX = canvasRef.value.width / rect.width;
    const scaleY = canvasRef.value.height / rect.height;
    
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    
    // Clear overlay
    ctx.clearRect(0, 0, overlayCanvasRef.value.width, overlayCanvasRef.value.height);
    
    let isOverAnnotation = false;
    // Check for hover over annotations
    for (const { path, annotation } of annotationPaths.value.values()) {
      if (ctx.isPointInPath(path, x, y)) {
        isOverAnnotation = true;
        // Draw highlighted polygon
        ctx.save();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fill(path);
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.stroke(path);
        ctx.restore();
        break;
      }
    }
      
    canvasRef.value.style.cursor = isOverAnnotation ? 'pointer' : 'default';
  };
  
  watch(
    () => props.file,
    async (newFile) => {
      if (!newFile) return;
      console.log("File changed, loading new PDF:", newFile);
      await loadPdf(newFile, props.documentId!);
    },
    { immediate: true }
  );
  
  watch(workerInitialized, async (isInitialized) => {
    if (isInitialized && props.file) {
      await loadPdf(props.file, props.documentId!);
    }
  });
  
  watch(canvasRef, (newCanvas) => {
    if (newCanvas && currentPage.value === 0) {
      console.log("Canvas now available, rendering first page");
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
  :deep(.fixed) {
    position: fixed;
    z-index: 100;
  }
  
  :deep([role="dialog"]) {
    position: relative;
    z-index: 100;
  }
  
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
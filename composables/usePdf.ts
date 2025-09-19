import { ref, computed, toRaw } from 'vue';
import { DateTime } from 'luxon';
import { useMuPdf } from './useMuPdf';
import { usePdfAnnotations } from './usePdfAnnotations';

import type { OverlayAnnotation } from '@/types/annotations';
import type { AnnotationRenderContext } from './usePdfAnnotations';

export function usePdf(
  htmlAnnotation?: (context: AnnotationRenderContext, annotation: OverlayAnnotation) => string,
  onOverlayClick?: (overlay: OverlayAnnotation, context: { x: number, y: number, pageNumber: number }) => void,
  onCanvasClick?: (context: { x: number, y: number, pageNumber: number }) => void
) {
  const { workerInitialized, loadDocument, renderPage, getPageCount, getMetadata } = useMuPdf();
  
  // State - declare refs first
  const pdfDocument = ref<any | null>(null);
  const currentPage = ref(0);
  const totalPages = ref(0);
  const zoom = ref(1);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const pageUrls = ref<string[]>([]);
  const metadata = ref({ format: '', modDate: '', author: '' });
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = ref<HTMLCanvasElement | null>(null);
  const htmlOverlayContainer = ref<HTMLElement | null>(null);
  
  // Initialize annotations with canvas and overlay container refs
  const { 
    pageAnnotations, 
    selectedAnnotation, 
    showDialog, 
    loadAnnotations, 
    initializePdfCoordinates,
    drawAnnotations, 
    handleAnnotationClick, 
    handleAnnotationHover, 
    drawHoverEffect, 
    drawAnnotationText,
    clearAnnotations, 
    closeDialog, 
    selectedAnnotationContent,
    cleanupProviders,
    getAnnotationAtPoint
  } = usePdfAnnotations(canvasRef, htmlOverlayContainer, htmlAnnotation, onOverlayClick);

  // Format PDF date strings
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

  // Load PDF document with annotations
  const loadPdf = async (file: string, docId: string) => {
    if (!file) return;
    
    clearAnnotations();
    
    // Initialize simple coordinate system (no external dependencies)
    console.log('[PDF Loading] Initializing simple coordinate system');
    initializePdfCoordinates();
    
    // Load annotations using the composable
    await loadAnnotations(docId);
    
    console.log('Loading PDF:', file);
    isLoading.value = true;
    error.value = null;

    try {
      const response = await fetch(file);
      console.log('PDF fetch response:', response.status);
      const arrayBuffer = await response.arrayBuffer();
      console.log('PDF arrayBuffer size:', arrayBuffer.byteLength);
      
      await loadDocument(arrayBuffer, toRaw(pageAnnotations.value));
      console.log('PDF document loaded');
      pdfDocument.value = true;
          
      totalPages.value = await getPageCount();
      console.log('Total pages:', totalPages.value);
      
      metadata.value = {
        format: await getMetadata("format") || '',
        modDate: formatPdfDate(await getMetadata("info:ModDate") || ''),
        author: await getMetadata("info:Author") || ''
      };
      
      // Always display the first page when PDF loads
      displayPage(0);
    } catch (err) {
      console.error("Error loading PDF:", err);
      error.value = "Failed to load PDF";
    } finally {
      isLoading.value = false;
    }
  };

  // Display page with annotations
  const displayPage = async (pageNumber: number) => {
    console.log('Displaying page:', pageNumber, 'Canvas available:', !!canvasRef.value);
    
    // Clear previous page's annotations
    clearAnnotations();
    
    if (!canvasRef.value) {
      console.log('Canvas not available, skipping display');
      return;
    }
  
    try {
      const ctx = canvasRef.value.getContext('2d');
      if (!ctx) {
        console.log('Canvas context not available');
        return;
      }
  
      // Apply zoom to scale
      const baseScale = (window.devicePixelRatio * 96) / 72;
      const url = await renderPageAsImage(pageNumber);
      if (!url) {
        console.log('Failed to render page image');
        return;
      }
  
      console.log('Rendering page image, URL:', url);
      const img = new Image();
      img.onload = () => {
        console.log('Image loaded, dimensions:', img.width, 'x', img.height);
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
        console.log('Image drawn to canvas');
  
        // Draw annotations using the composable
        const PDF_POINTS_PER_INCH = 72;
        const SCALE_FACTOR = 1;
        const effectiveDpi = baseScale * PDF_POINTS_PER_INCH * SCALE_FACTOR;
        
        drawAnnotations(ctx, pageNumber, effectiveDpi);
        console.log('Annotations drawn');
      };
      img.src = url;
    } catch (err) {
      console.error("Error rendering page:", err);
    }
  };

  // Navigation methods
  const goToPage = (page: number) => {
    if (!pdfDocument.value) return;
    if (page < 0 || page >= totalPages.value) return;
    currentPage.value = page;
    displayPage(page);
  };

  const nextPage = () => goToPage(currentPage.value + 1);
  const prevPage = () => goToPage(currentPage.value - 1);

  // Zoom methods
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

  // Render page as image
  const renderPageAsImage = async (pageNumber: number) => {
    if (!pdfDocument.value) return null;
    
    try {
      const pngData = await renderPage(pageNumber);
      const url = URL.createObjectURL(new Blob([pngData], { type: 'image/png' }));
      pageUrls.value[pageNumber] = url;
      return url;
    } catch (err) {
      console.error("Error rendering page:", err);
      error.value = "Failed to render page";
      return null;
    }
  };

  // Canvas event handlers
  const handleCanvasClick = (event: MouseEvent) => {
    if (!canvasRef.value || !overlayCanvasRef.value) return;
    const ctx = canvasRef.value.getContext('2d');
    if (!ctx) return;
    
    const rect = canvasRef.value.getBoundingClientRect();
    const scaleX = canvasRef.value.width / rect.width;
    const scaleY = canvasRef.value.height / rect.height;
    
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    
    // Check if an overlay was clicked
    const clickedOverlay = getAnnotationAtPoint(x, y, ctx);
    
    if (clickedOverlay) {
      // Emit overlay-specific click event
      const context = { x, y, pageNumber: currentPage.value };
      if (onOverlayClick) {
        onOverlayClick(clickedOverlay, context);
      }
    } else {
      // Emit general canvas click event
      const context = { x, y, pageNumber: currentPage.value };
      if (onCanvasClick) {
        onCanvasClick(context);
      }
    }
  };

  // Track previous hover state to avoid unnecessary redraws
  const previousHoverState = ref(false);
  const previousHoveredAnnotation = ref<any>(null);
  
  // Function to clear HTML overlays
  const clearHtmlOverlays = () => {
    if (htmlOverlayContainer.value) {
      const overlays = htmlOverlayContainer.value.querySelectorAll('.pdf-simple-html-overlay');
      overlays.forEach(overlay => overlay.remove());
      console.log('[HTML Overlays] Cleared', overlays.length, 'overlays');
    }
  };
  


  const handleCanvasMouseMove = async (event: MouseEvent) => {
    if (!canvasRef.value || !overlayCanvasRef.value) return;
    const ctx = overlayCanvasRef.value.getContext('2d');
    if (!ctx) return;
    
    const rect = canvasRef.value.getBoundingClientRect();
    const scaleX = canvasRef.value.width / rect.width;
    const scaleY = canvasRef.value.height / rect.height;
    
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    
    // Check for hover over annotations using composable
    const isOverAnnotation = handleAnnotationHover(x, y, ctx);
    
    // Only redraw if hover state changed or if we're hovering over a different annotation
    const currentAnnotation = isOverAnnotation ? getAnnotationAtPoint(x, y, ctx) : null;
    const annotationChanged = previousHoveredAnnotation.value !== currentAnnotation;
    const hoverStateChanged = previousHoverState.value !== isOverAnnotation;
    
    if (hoverStateChanged || annotationChanged) {
      // Clear overlay
      ctx.clearRect(0, 0, overlayCanvasRef.value.width, overlayCanvasRef.value.height);
      
      // Only clear HTML overlays when not hovering or annotation changed (but not when just moving within same annotation)
      if (!isOverAnnotation) {
        clearHtmlOverlays();
      } else if (annotationChanged) {
        clearHtmlOverlays();
      }
      
      if (isOverAnnotation) {
        // Calculate effective DPI for text rendering
        const baseScale = (window.devicePixelRatio * 96) / 72;
        const PDF_POINTS_PER_INCH = 72;
        const SCALE_FACTOR = 1;
        const effectiveDpi = baseScale * PDF_POINTS_PER_INCH * SCALE_FACTOR;
        
        await drawHoverEffect(ctx, x, y, effectiveDpi);
      }
      
      // Update tracking state
      previousHoverState.value = isOverAnnotation;
      previousHoveredAnnotation.value = currentAnnotation;
    }
      
    canvasRef.value.style.cursor = isOverAnnotation ? 'pointer' : 'default';
  };

  // Handle mouse leave - clear all overlays (but be more careful about when this triggers)
  const handleCanvasMouseLeave = (event: MouseEvent) => {
    // Check if we're actually leaving the canvas area or just moving to an overlay
    const canvas = canvasRef.value;
    if (!canvas || !overlayCanvasRef.value) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    
    // Only clear if mouse is actually outside the canvas bounds
    const isOutsideCanvas = (
      mouseX < rect.left || 
      mouseX > rect.right || 
      mouseY < rect.top || 
      mouseY > rect.bottom
    );
    
    if (isOutsideCanvas) {
      const ctx = overlayCanvasRef.value.getContext('2d');
      if (!ctx) return;
      
      // Clear canvas overlay
      ctx.clearRect(0, 0, overlayCanvasRef.value.width, overlayCanvasRef.value.height);
      
      // Clear HTML overlays
      clearHtmlOverlays();
      
      // Reset hover state
      previousHoverState.value = false;
      previousHoveredAnnotation.value = null;
      
      console.log('[Canvas Mouse Leave] Cleared all overlays (mouse truly outside canvas)');
    }
  };

  // Canvas management
  const clearOverlayCanvas = () => {
    if (overlayCanvasRef.value) {
      const ctx = overlayCanvasRef.value.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvasRef.value.width, overlayCanvasRef.value.height);
      }
    }
  };

  // Cleanup methods
  const cleanupPageUrls = () => {
    pageUrls.value.forEach(url => URL.revokeObjectURL(url));
    pageUrls.value = [];
  };

  const cleanup = () => {
    console.log("Cleaning up PDF resources");
    pdfDocument.value = null;
    totalPages.value = 0;
    metadata.value = { format: '', modDate: '', author: '' };
    cleanupPageUrls();
    clearAnnotations();
    clearOverlayCanvas();
  };

  // Computed properties
  const canGoNext = computed(() => currentPage.value < totalPages.value - 1);
  const canGoPrev = computed(() => currentPage.value > 0);
  const zoomPercentage = computed(() => Math.round(zoom.value * 100));

  return {
    // State
    pdfDocument,
    currentPage,
    totalPages,
    zoom,
    isLoading,
    error,
    pageUrls,
    metadata,
    workerInitialized,
    canvasRef,
    overlayCanvasRef,
    htmlOverlayContainer,

    // Annotation state (re-exported from usePdfAnnotations)
    pageAnnotations,
    selectedAnnotation,
    showDialog,
    selectedAnnotationContent,

    // Methods
    loadPdf,
    initializePdfCoordinates,
    displayPage,
    goToPage,
    nextPage,
    prevPage,
    zoomIn,
    zoomOut,
    renderPageAsImage,
    formatPdfDate,
    handleCanvasClick,
    handleCanvasMouseMove,
    handleCanvasMouseLeave,
    clearOverlayCanvas,
    cleanup,
    cleanupPageUrls,

    // Annotation methods (re-exported from usePdfAnnotations)
    closeDialog,
    cleanupProviders,
    
    // HTML overlay management
    clearHtmlOverlays,

    // Computed
    canGoNext,
    canGoPrev,
    zoomPercentage
  };
}

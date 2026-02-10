import { ref, computed, toRaw, watch, unref, type Ref } from 'vue';
import { DateTime } from 'luxon';
import { useMuPdf } from './useMuPdf';
import { usePdfAnnotations } from './usePdfAnnotations';
import {
  useMouseGuide,
  type MouseLineOptions,
  type MouseLineTooltipOptions,
  type MouseLineOrientation,
  type MouseLineIntersectionContext
} from './useMouseGuide';

import type { OverlayAnnotation } from '@/types/annotations';
import type { AnnotationRenderContext, AnnotationSource } from './usePdfAnnotations';

export type AnnotationFetcher = (
  pageNumber: number
) => Promise<AnnotationSource | OverlayAnnotation[] | null | undefined>
  | AnnotationSource
  | OverlayAnnotation[]
  | null
  | undefined;

export interface UsePdfMouseLineOptions {
  enabled?: boolean;
  color?: string;
  width?: number;
  orientation?: MouseLineOrientation;
  onIntersections?: (context: MouseLineIntersectionContext) => void;
  tooltips?: boolean | Partial<MouseLineTooltipOptions>;
}

export interface UsePdfOptions {
  mouseLine?: UsePdfMouseLineOptions;
  annotationFetcher?: AnnotationFetcher | null;
  highlightPredicate?: Ref<((annotation: OverlayAnnotation) => boolean) | undefined> | ((annotation: OverlayAnnotation) => boolean);
  disableConfidenceColors?: Ref<boolean | undefined> | boolean;
}

const pdfByteCache = new Map<string, Promise<ArrayBuffer>>();

const fetchPdfBytes = (file: string): Promise<ArrayBuffer> => {
  const cached = pdfByteCache.get(file);
  if (cached) {
    return cached;
  }

  const request = fetch(file)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF (${response.status})`);
      }
      return response.arrayBuffer();
    })
    .catch((error) => {
      // Drop failed requests so callers can retry on subsequent attempts.
      pdfByteCache.delete(file);
      throw error;
    });

  pdfByteCache.set(file, request);
  return request;
};

export function usePdf(
  htmlAnnotation?: (context: AnnotationRenderContext, annotation: OverlayAnnotation) => string,
  onOverlayClick?: (overlay: OverlayAnnotation, context: { x: number, y: number, pageNumber: number }) => void,
  onCanvasClick?: (context: { x: number, y: number, pageNumber: number }) => void,
  options: UsePdfOptions = {}
) {
  const { workerInitialized, loadDocument, renderPage, getPageCount, getMetadata } = useMuPdf();

  const normalizeTooltipOptions = (
    input?: boolean | Partial<MouseLineTooltipOptions>
  ): MouseLineTooltipOptions | undefined => {
    if (input === undefined) {
      return undefined;
    }

    if (typeof input === 'boolean') {
      return { enabled: input };
    }

    return {
      enabled: input.enabled ?? true,
      offset: input.offset,
      verticalGap: input.verticalGap,
      estimatedHeight: input.estimatedHeight
    };
  };

  const mapMouseLineOptions = (config?: UsePdfMouseLineOptions): Partial<MouseLineOptions> => {
    if (!config) {
      return {};
    }

    const mapped: Partial<MouseLineOptions> = {};

    if (config.enabled !== undefined) {
      mapped.enableMouseLine = config.enabled;
    }
    if (config.color !== undefined) {
      mapped.mouseLineColor = config.color;
    }
    if (config.width !== undefined) {
      mapped.mouseLineWidth = config.width;
    }
    if (config.orientation !== undefined) {
      mapped.orientation = config.orientation;
    }
    if (config.onIntersections !== undefined) {
      mapped.onMouseLineIntersections = config.onIntersections;
    }
    if (config.tooltips !== undefined) {
      mapped.tooltip = normalizeTooltipOptions(config.tooltips);
    }

    return mapped;
  };

  const initialMouseLineOptions: Partial<MouseLineOptions> = {
    enableMouseLine: options.mouseLine?.enabled ?? false
  };

  if (options.mouseLine?.color !== undefined) {
    initialMouseLineOptions.mouseLineColor = options.mouseLine.color;
  }
  if (options.mouseLine?.width !== undefined) {
    initialMouseLineOptions.mouseLineWidth = options.mouseLine.width;
  }
  if (options.mouseLine?.orientation !== undefined) {
    initialMouseLineOptions.orientation = options.mouseLine.orientation;
  }
  if (options.mouseLine?.onIntersections) {
    initialMouseLineOptions.onMouseLineIntersections = options.mouseLine.onIntersections;
  }

  const tooltipConfig = normalizeTooltipOptions(options.mouseLine?.tooltips);
  if (tooltipConfig) {
    initialMouseLineOptions.tooltip = tooltipConfig;
  }
  
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
  const annotationCanvasRef = ref<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = ref<HTMLCanvasElement | null>(null);
  const htmlOverlayContainer = ref<HTMLElement | null>(null);

  // Store the current effectiveDpi for annotation redraws
  const currentEffectiveDpi = ref(192); // Default DPI

  // Optimized HTML overlay lifecycle management (defined before usePdfAnnotations)
  const activeOverlays = new Map<string, HTMLElement>();
  const overlayPool: HTMLElement[] = [];
  const MAX_POOL_SIZE = 20;

  const createOverlayElement = (): HTMLElement => {
    // Try to reuse from pool first
    const pooledElement = overlayPool.pop();
    if (pooledElement) {
      // Reset pooled element
      pooledElement.innerHTML = '';
      pooledElement.className = 'pdf-simple-html-overlay';
      pooledElement.style.cssText = '';
      return pooledElement;
    }

    // Create new element if pool is empty
    const overlay = document.createElement('div');
    overlay.className = 'pdf-simple-html-overlay';
    return overlay;
  };

  const recycleOverlayElement = (element: HTMLElement) => {
    if (overlayPool.length < MAX_POOL_SIZE) {
      // Remove all event listeners by cloning the element
      const cleanElement = element.cloneNode(true) as HTMLElement;
      overlayPool.push(cleanElement);
    }
  };

  const addTrackedOverlay = (id: string, element: HTMLElement) => {
    // Remove existing overlay with same ID if it exists
    const existing = activeOverlays.get(id);
    if (existing) {
      existing.remove();
      recycleOverlayElement(existing);
    }

    activeOverlays.set(id, element);
  };

  const clearHtmlOverlays = (reason?: string) => {
    if (!htmlOverlayContainer.value) return;

    // Clear word confidence visualization
    clearWordConfidenceVisualization();

    // Use tracked overlays instead of DOM queries for better performance
    const overlayCount = activeOverlays.size;

    if (overlayCount > 0) {
      console.log('[HTML Overlays] Clearing', overlayCount, 'overlays, reason:', reason || 'unknown');
      console.trace('[HTML Overlays] Clear stack trace');

      activeOverlays.forEach((overlay, id) => {
        console.log('[HTML Overlays] Removing overlay:', id, overlay);
        overlay.remove();
        recycleOverlayElement(overlay);
      });

      activeOverlays.clear();
    } else {
      console.debug('[HTML Overlays] Cleared', overlayCount, 'overlays, pool size:', overlayPool.length, 'reason:', reason || 'unknown');
    }
  };

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
    getAnnotationAtPoint,
    getAnnotationsIntersectingVerticalLine,
    getAnnotationsIntersectingHorizontalLine,
    clearWordConfidenceVisualization,
    hasWordLevelConfidence
  } = usePdfAnnotations(annotationCanvasRef, htmlOverlayContainer, htmlAnnotation, onOverlayClick, {
    createOverlayElement,
    addTrackedOverlay
  },
  // Pass as refs or plain values - usePdfAnnotations will handle both
  options.highlightPredicate,
  options.disableConfidenceColors);

  const dynamicAnnotationFetcher = ref<AnnotationFetcher | null>(
    options.annotationFetcher ?? null
  );
  const annotationCache = ref<Map<number, OverlayAnnotation[]>>(new Map());

  const updatePageAnnotationsFromCache = () => {
    if (!annotationCache.value.size) {
      pageAnnotations.value = [];
      return;
    }

    const combined: OverlayAnnotation[] = [];
    annotationCache.value.forEach((annotations) => {
      combined.push(...annotations);
    });
    pageAnnotations.value = combined;
  };

  const parsePageNumber = (pageValue: unknown, fallback?: number) => {
    if (typeof pageValue === 'number' && Number.isFinite(pageValue)) {
      return Math.trunc(pageValue);
    }

    if (typeof pageValue === 'string' && pageValue.trim() !== '') {
      const parsed = Number(pageValue);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }

    if (fallback !== undefined) {
      return Math.trunc(fallback);
    }

    return null;
  };

  const groupAnnotationsByPage = (
    annotations: OverlayAnnotation[],
    fallback?: number
  ) => {
    const grouped = new Map<number, OverlayAnnotation[]>();

    for (const annotation of annotations) {
      const pageNumber = parsePageNumber(annotation.page, fallback);
      if (pageNumber === null) {
        continue;
      }

      if (!grouped.has(pageNumber)) {
        grouped.set(pageNumber, []);
      }
      grouped.get(pageNumber)!.push(annotation);
    }

    return grouped;
  };

  const resetAnnotationCache = () => {
    annotationCache.value.clear();
    updatePageAnnotationsFromCache();
  };

  const replaceAnnotationCache = (annotations: OverlayAnnotation[]) => {
    annotationCache.value.clear();

    const grouped = groupAnnotationsByPage(annotations);
    grouped.forEach((list, page) => {
      annotationCache.value.set(page, list);
    });

    updatePageAnnotationsFromCache();
  };

  const upsertAnnotations = (
    annotations: OverlayAnnotation[],
    fallbackPage?: number
  ) => {
    const grouped = groupAnnotationsByPage(annotations, fallbackPage);
    if (!grouped.size && fallbackPage !== undefined) {
      annotationCache.value.set(fallbackPage, []);
      updatePageAnnotationsFromCache();
      return;
    }

    grouped.forEach((list, page) => {
      annotationCache.value.set(page, list);
    });

    updatePageAnnotationsFromCache();
  };

  const cloneAnnotationsForWorker = (annotations: OverlayAnnotation[]) => {
    const raw = toRaw(annotations);

    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(raw);
      } catch (error) {
        console.warn('[PDF Loading] structuredClone failed, falling back to JSON serialization:', error);
      }
    }

    return raw.map((annotation) => {
      const plain = JSON.parse(JSON.stringify(annotation)) as OverlayAnnotation;
      return plain;
    });
  };

  const setAnnotationFetcher = (fetcher?: AnnotationFetcher | null) => {
    dynamicAnnotationFetcher.value = fetcher ?? null;
    resetAnnotationCache();
  };

  const fetchAnnotationsForPage = async (
    pageNumber: number,
    { force = false }: { force?: boolean } = {}
  ): Promise<OverlayAnnotation[]> => {
    const pageKey = pageNumber + 1;

    if (!force && annotationCache.value.has(pageKey)) {
      return annotationCache.value.get(pageKey) ?? [];
    }

    if (!dynamicAnnotationFetcher.value) {
      if (!annotationCache.value.has(pageKey)) {
        annotationCache.value.set(pageKey, []);
        updatePageAnnotationsFromCache();
      }
      return annotationCache.value.get(pageKey) ?? [];
    }

    try {
      const result = await dynamicAnnotationFetcher.value(pageKey);

      if (!result) {
        annotationCache.value.set(pageKey, []);
        updatePageAnnotationsFromCache();
        return [];
      }

      const annotations = await loadAnnotations(result, { defaultPage: pageKey });
      upsertAnnotations(annotations, pageKey);
      return annotationCache.value.get(pageKey) ?? annotations;
    } catch (err) {
      console.error(`[PDF Annotations] Failed to fetch annotations for page ${pageKey}:`, err);
      annotationCache.value.set(pageKey, []);
      updatePageAnnotationsFromCache();
      return [];
    }
  };

  const refreshAnnotationsForPage = async (pageNumber?: number) => {
    const targetPage = pageNumber !== undefined ? pageNumber : currentPage.value;
    const pageKey = targetPage + 1;
    annotationCache.value.delete(pageKey);
    updatePageAnnotationsFromCache();
    return fetchAnnotationsForPage(targetPage, { force: true });
  };

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
  const loadPdf = async (
    file: string,
    annotationSource: AnnotationSource | null | undefined
  ) => {
    if (!file) return;

    clearAnnotations();
    resetAnnotationCache();

    // Initialize simple coordinate system (no external dependencies)
    console.log('[PDF Loading] Initializing simple coordinate system');
    initializePdfCoordinates();

    if (!annotationSource) {
      if (!dynamicAnnotationFetcher.value) {
        console.warn('[PDF Loading] No annotation source provided, skipping overlay load');
      }
      pageAnnotations.value = [];
    } else {
      // Load annotations using the composable
      const annotations = await loadAnnotations(annotationSource);
      replaceAnnotationCache(annotations);
    }
    
    console.log('Loading PDF:', file);
    isLoading.value = true;
    error.value = null;

    try {
      const arrayBuffer = await fetchPdfBytes(file);
      console.log('PDF arrayBuffer size:', arrayBuffer.byteLength);
      
      const workerAnnotations = cloneAnnotationsForWorker(pageAnnotations.value);
      await loadDocument(arrayBuffer, workerAnnotations);
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

    await fetchAnnotationsForPage(pageNumber).catch((err) => {
      console.error(`[PDF Rendering] Unable to ensure annotations for page ${pageNumber + 1}:`, err);
    });
    
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
        if (annotationCanvasRef.value) {
          annotationCanvasRef.value.width = img.width;
          annotationCanvasRef.value.height = img.height;
          annotationCanvasRef.value.style.transform = `scale(${zoom.value})`;
          annotationCanvasRef.value.style.transformOrigin = 'top center';
        }

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
  
        // Draw annotations on dedicated annotation canvas
        if (annotationCanvasRef.value) {
          const annotationCtx = annotationCanvasRef.value.getContext('2d');
          if (annotationCtx) {
            // Clear previous annotations from the dedicated layer
            annotationCtx.clearRect(0, 0, annotationCanvasRef.value.width, annotationCanvasRef.value.height);

            const PDF_POINTS_PER_INCH = 72;
            const SCALE_FACTOR = 1;
            const effectiveDpi = baseScale * PDF_POINTS_PER_INCH * SCALE_FACTOR;

            // Store the effectiveDpi for annotation redraws
            currentEffectiveDpi.value = effectiveDpi;

            console.log('[PDF Display] About to draw annotations - pageNumber:', pageNumber, 'effectiveDpi:', effectiveDpi);
            console.log('[PDF Display] Annotation canvas dimensions:', annotationCanvasRef.value.width, 'x', annotationCanvasRef.value.height);
            drawAnnotations(annotationCtx, pageNumber, effectiveDpi);
            console.log('[PDF Display] Annotations drawn on dedicated layer');
          } else {
            console.error('[PDF Display] Could not get annotation canvas context');
          }
        } else {
          console.error('[PDF Display] Annotation canvas ref is null');
        }
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

  const {
    handleMouseMove,
    handleMouseLeave,
    updateMouseGuideOptions,
    resetMouseLinePayload,
    cleanup: cleanupMouseGuide
  } = useMouseGuide(
    {
      canvasRef,
      overlayCanvasRef,
      currentPage,
      handleAnnotationHover,
      getAnnotationAtPoint,
      drawHoverEffect,
      clearHtmlOverlays,
      getAnnotationsIntersectingVerticalLine,
      getAnnotationsIntersectingHorizontalLine,
      htmlOverlayContainer,
      annotationCanvasRef // Add annotation canvas reference
    },
    initialMouseLineOptions
  );

  const setMouseLineOptions = (config?: UsePdfMouseLineOptions) => {
    updateMouseGuideOptions(mapMouseLineOptions(config));
  };

  const handleCanvasMouseMove = handleMouseMove;
  const handleCanvasMouseLeave = handleMouseLeave;

  // Canvas management
  const clearOverlayCanvas = () => {
    if (overlayCanvasRef.value) {
      const ctx = overlayCanvasRef.value.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvasRef.value.width, overlayCanvasRef.value.height);
      }
    }
  };

  const clearAnnotationCanvas = () => {
    if (annotationCanvasRef.value) {
      const ctx = annotationCanvasRef.value.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, annotationCanvasRef.value.width, annotationCanvasRef.value.height);
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
    resetAnnotationCache();
    clearAnnotationCanvas();
    clearOverlayCanvas();
    clearHtmlOverlays(); // Clear tracked overlays and recycle elements
    resetMouseLinePayload();
    cleanupMouseGuide();

    // Clear overlay pool on full cleanup
    overlayPool.length = 0;
    activeOverlays.clear();
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
    annotationCanvasRef,
    overlayCanvasRef,
    htmlOverlayContainer,
    currentEffectiveDpi,

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
    setMouseLineOptions,
    clearOverlayCanvas,
    fetchAnnotationsForPage,
    refreshAnnotationsForPage,
    setAnnotationFetcher,
    cleanup,
    cleanupPageUrls,

    // Annotation methods (re-exported from usePdfAnnotations)
    closeDialog,
    cleanupProviders,
    drawAnnotations,

    // HTML overlay management
    clearHtmlOverlays,
    createOverlayElement,
    addTrackedOverlay,

    // Computed
    canGoNext,
    canGoPrev,
    zoomPercentage
  };
}

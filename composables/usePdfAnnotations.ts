import { ref, computed, type Ref } from 'vue';
import html2canvas from 'html2canvas';
import type { OverlayAnnotation } from '@/types/annotations';
import { usePdfCoordinates } from './usePdfCoordinates';

// Custom annotation provider interfaces
export interface AnnotationRenderContext {
  ctx: CanvasRenderingContext2D;
  annotation: OverlayAnnotation;
  effectiveDpi: number;
  pageNumber: number;
  rect: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };
}

export interface AnnotationProvider {
  id: string;
  name: string;
  description?: string;
  canHandle: (annotation: OverlayAnnotation) => boolean;
  render: (context: AnnotationRenderContext) => void | Promise<void>;
  createOverlay?: (context: AnnotationRenderContext, containerElement: HTMLElement) => HTMLElement | null;
}

export interface AnnotationProviderOptions {
  id?: string; // Optional - will be auto-generated from name if not provided
  name: string;
  description?: string;
  canHandle: (annotation: OverlayAnnotation) => boolean;
  render: (context: AnnotationRenderContext) => void | Promise<void>;
  createOverlay?: (context: AnnotationRenderContext, containerElement: HTMLElement) => HTMLElement | null;
}

// HTML Template System
export interface HtmlTemplateResult {
  html: string;
  width?: number;
  height?: number;
  styles?: Record<string, string>;
}

export type HtmlTemplateFunction = (
  annotation: OverlayAnnotation, 
  context: AnnotationRenderContext
) => HtmlTemplateResult;

// HTML Overlay Template System
export interface HtmlOverlayResult {
  html: string;
  styles?: Record<string, string>;
  events?: Record<string, (event: Event) => void>;
}

export type HtmlOverlayFunction = (
  annotation: OverlayAnnotation,
  context: AnnotationRenderContext
) => HtmlOverlayResult | null;

// Global singleton state
const globalAnnotationProviders = ref<Map<string, AnnotationProvider>>(new Map());
const globalActiveProviders = ref(new Set<string>(['default']));

// Debug flag to disable fallback rendering for testing
const disableFallbackRendering = ref(false);

// Default provider definition
const createDefaultProvider = (): AnnotationProvider => ({
  id: 'default',
  name: 'Default Text Renderer',
  description: 'Built-in text rendering for annotations',
  canHandle: () => true, // Default provider handles all annotations
  render: () => {} // Will be set later
});

export function usePdfAnnotations(
  canvasRef?: Ref<HTMLCanvasElement | null>,
  htmlOverlayContainer?: Ref<HTMLElement | null>,
  htmlAnnotation?: (context: AnnotationRenderContext, annotation: OverlayAnnotation) => string,
  onOverlayClick?: (overlay: OverlayAnnotation, context: { x: number, y: number, pageNumber: number }) => void
) {
  // State
  const pageAnnotations = ref<OverlayAnnotation[]>([]);
  const selectedAnnotation = ref<OverlayAnnotation | null>(null);
  const annotationPaths = ref(new Map<string, { path: Path2D, annotation: OverlayAnnotation }>());
  const showDialog = ref(false);
  
  // Use global singleton state
  const annotationProviders = globalAnnotationProviders;
  const activeProviders = globalActiveProviders;
  const defaultProvider = createDefaultProvider();
  
  // Simple PDF coordinate system (no PDF.js dependency)
  const pdfCoords = usePdfCoordinates();
  
  // Text styling configuration
  const textStyle = ref({
    fontFamily: 'Arial, sans-serif',
    fontSize: 12, // Fixed font size for consistency
    textColor: 'rgba(0, 0, 0, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.98)', // More opaque white background
    borderColor: 'rgba(0, 0, 0, 0.4)',
    padding: 6, // Increased padding for better spacing
    minWidth: 20,
    minHeight: 10,
    maxWidth: 200, // Maximum width before wrapping
    lineHeight: 1.2 // Line height multiplier
  });

  // Load annotations from JSON file
  const loadAnnotations = async (docId: string) => {
    try {
      const response = await fetch(docId);
      const data = await response.json();
      pageAnnotations.value = data?.overlay || [];
      console.log('Loaded annotations:', pageAnnotations.value.length);
    } catch (error) {
      console.error('Error loading annotations:', error);
      pageAnnotations.value = [];
    }
  };
  
  // Simple coordinate initialization (no external dependencies needed)
  const initializePdfCoordinates = () => {
    console.log('[PDF Annotations] Simple coordinate system ready (no initialization needed)');
    return true;
  };

  // Get annotations for a specific page
  const getAnnotationsForPage = (pageNumber: number) => {
    return pageAnnotations.value.filter(
      (annotation: OverlayAnnotation) => annotation.page === (pageNumber + 1).toString()
    );
  };

  // Convert annotation coordinates to canvas coordinates
  const convertCoordinates = (rect: number[], effectiveDpi: number) => {
    const points: [number, number][] = [];
    for (let i = 0; i < rect.length; i += 2) {
      const x = rect[i] * effectiveDpi;
      const y = rect[i + 1] * effectiveDpi;
      points.push([x, y]);
    }
    return points;
  };

  // Create Path2D for annotation
  const createAnnotationPath = (rect: number[], effectiveDpi: number): Path2D => {
    const path = new Path2D();
    const points = convertCoordinates(rect, effectiveDpi);
    
    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i];
      if (i === 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    path.closePath();
    return path;
  };

  // Draw annotations on canvas
  const drawAnnotations = (
    ctx: CanvasRenderingContext2D, 
    pageNumber: number, 
    effectiveDpi: number
  ) => {
    const currentPageAnnotations = getAnnotationsForPage(pageNumber);
    
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    
    // Clear existing paths
    annotationPaths.value.clear();
    
    for (const annotation of currentPageAnnotations) {
      const annotationId = `annotation-${annotation.page}-${annotation.line}`;
      const path = createAnnotationPath(annotation.rect, effectiveDpi);
      
      // Draw the annotation
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255, 0, 0, 0)';
      ctx.fill(path);
      ctx.stroke(path);
      
      // Store path for hit testing
      annotationPaths.value.set(annotationId, { path, annotation });
    }
  };

  // Check if point is inside any annotation
  const getAnnotationAtPoint = (x: number, y: number, ctx: CanvasRenderingContext2D) => {
    for (const { path, annotation } of annotationPaths.value.values()) {
      if (ctx.isPointInPath(path, x, y)) {
        return annotation;
      }
    }
    return null;
  };

  // Handle annotation click (legacy - kept for backward compatibility)
  const handleAnnotationClick = (x: number, y: number, ctx: CanvasRenderingContext2D) => {
    const annotation = getAnnotationAtPoint(x, y, ctx);
    if (annotation) {
      // No default action - let the parent handle the click via events
      return true;
    }
    return false;
  };

  // Show default dialog (can be called manually if needed)
  const showAnnotationDialog = (annotation: OverlayAnnotation) => {
    selectedAnnotation.value = annotation;
    showDialog.value = true;
  };

  // Handle annotation hover
  const handleAnnotationHover = (x: number, y: number, ctx: CanvasRenderingContext2D) => {
    const annotation = getAnnotationAtPoint(x, y, ctx);
    return annotation !== null;
  };

  // Helper function to wrap text
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  };

  // Helper function to determine if rectangle is tall and skinny
  const isVerticalOrientation = (width: number, height: number): boolean => {
    return height > width * 1.2; // If height is 1.2x greater than width (more lenient)
  };

  // Set up the default provider with the built-in text rendering
  const setupDefaultProvider = () => {
    defaultProvider.render = (context: AnnotationRenderContext) => {
      drawDefaultAnnotationText(context);
    };
  };

  // Default annotation text rendering (extracted from original function)
  const drawDefaultAnnotationText = (context: AnnotationRenderContext) => {
    const { ctx, annotation, effectiveDpi } = context;
    const { minX, maxX, minY, maxY, width, height } = context.rect;
    
    if (!annotation.content || !annotation.content.trim()) return;
    
    // Only skip if the rectangle is completely invalid (negative or zero dimensions)
    if (width <= 0 || height <= 0) {
      console.log('Skipping annotation - invalid dimensions:', { width, height });
      return;
    }
    
    // Never skip annotations that have content - always show text overlay
    const isVertical = isVerticalOrientation(width, height);
    
    ctx.save();
    
    // Set text styling - scale font size based on rectangle size
    const baseFontSize = textStyle.value.fontSize;
    let fontSize = baseFontSize;
    
    // Scale font size down for very small rectangles
    if (width < 15 || height < 10) {
      fontSize = Math.max(6, baseFontSize * 0.6); // Minimum 6px font
    } else if (width < 25 || height < 15) {
      fontSize = Math.max(8, baseFontSize * 0.7); // Minimum 8px font
    }
    
    ctx.font = `${fontSize}px ${textStyle.value.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Adjust padding based on rectangle size
    const basePadding = textStyle.value.padding;
    const padding = (width < 20 || height < 12) ? Math.max(2, basePadding * 0.5) : basePadding;
    const lineHeight = fontSize * textStyle.value.lineHeight;
    
    // Debug logging
    console.log('Annotation text rendering:', {
      content: annotation.content,
      width,
      height,
      isVertical,
      ratio: height / width
    });
    
    let lines: string[];
    let textWidth: number;
    let textHeight: number;
    
    if (isVertical && width >= 8 && height >= 12) {
      // For vertical orientation, treat each character as a line
      // Use vertical if rectangle is tall and has minimum width
      lines = annotation.content.split('').filter(char => char.trim());
      textWidth = fontSize; // Character width
      textHeight = lines.length * lineHeight;
      console.log('Vertical text:', { lines, textWidth, textHeight });
    } else {
      // For horizontal orientation, wrap text normally (fallback for small rectangles)
      const maxTextWidth = Math.min(width - padding * 2, textStyle.value.maxWidth);
      lines = wrapText(ctx, annotation.content, maxTextWidth);
      
      // Calculate dimensions
      textWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
      textHeight = lines.length * lineHeight;
      console.log('Horizontal text (fallback):', { lines, textWidth, textHeight, reason: isVertical ? 'too small for vertical' : 'horizontal orientation' });
    }
    
    // Calculate background dimensions - allow it to extend beyond rectangle if needed
    const bgWidth = Math.max(textWidth + padding * 2, Math.min(width, textStyle.value.maxWidth));
    const bgHeight = textHeight + padding * 2;
    
    // Center the background within the rectangle, but allow it to extend if needed
    const bgX = minX + Math.max(0, (width - bgWidth) / 2);
    const bgY = minY + Math.max(0, (height - bgHeight) / 2);
    
    // Draw background with more opacity for better visibility
    ctx.fillStyle = 'rgba(255, 255, 255, 0.98)'; // More opaque white background
    ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
    
    // Draw border with slightly thicker line
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bgX, bgY, bgWidth, bgHeight);
    
    // Draw text - center within the background box
    ctx.fillStyle = textStyle.value.textColor;
    
    if (isVertical) {
      // Draw vertical text (each character on a new line)
      const startX = bgX + bgWidth / 2;
      const startY = bgY + (bgHeight - textHeight) / 2 + fontSize / 2;
      
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], startX, startY + i * lineHeight);
      }
    } else {
      // Draw horizontal text (wrapped lines)
      const startX = bgX + bgWidth / 2;
      const startY = bgY + (bgHeight - textHeight) / 2 + fontSize / 2;
      
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], startX, startY + i * lineHeight);
      }
    }
    
    ctx.restore();
  };

  // New provider-based annotation text rendering
  const drawAnnotationText = async (
    ctx: CanvasRenderingContext2D, 
    annotation: OverlayAnnotation, 
    effectiveDpi: number,
    pageNumber: number = 0
  ) => {
    if (!annotation.content || !annotation.content.trim()) {
      console.log('Skipping annotation - no content:', annotation);
      return;
    }
    
    // Calculate rectangle bounds
    const points = convertCoordinates(annotation.rect, effectiveDpi);
    if (points.length < 3) {
      console.log('Skipping annotation - invalid points:', points);
      return;
    }
    
    const minX = Math.min(...points.map(p => p[0]));
    const maxX = Math.max(...points.map(p => p[0]));
    const minY = Math.min(...points.map(p => p[1]));
    const maxY = Math.max(...points.map(p => p[1]));
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    // Only skip if the rectangle is completely invalid
    if (width <= 0 || height <= 0) {
      console.log('Skipping annotation - invalid dimensions:', { width, height });
      return;
    }
    
    console.log('Drawing annotation text:', {
      content: annotation.content,
      width,
      height,
      activeProviders: Array.from(activeProviders.value)
    });
    
    // Create render context
    const context: AnnotationRenderContext = {
      ctx,
      annotation,
      effectiveDpi,
      pageNumber,
      rect: { minX, maxX, minY, maxY, width, height }
    };
    
    // Check if htmlAnnotation prop is provided for simple HTML overlay rendering
    if (htmlAnnotation && canvasRef?.value && htmlOverlayContainer?.value) {
      try {
        console.log('[Simple HTML Render] Creating overlay for:', annotation.content);
        
        // Check if overlay already exists for this annotation
        const annotationId = `${annotation.page}-${annotation.line}`;
        const existingOverlay = htmlOverlayContainer.value.querySelector(`[data-annotation-id="${annotationId}"]`);
        if (existingOverlay) {
          console.log('[Simple HTML Render] Overlay already exists, skipping creation');
          return; // Skip creation if overlay already exists
        }
        
        // Generate HTML using the provided function
        const htmlContent = htmlAnnotation(context, annotation);
        
        // Create overlay element
        const overlay = document.createElement('div');
        overlay.innerHTML = htmlContent;
        overlay.className = 'pdf-simple-html-overlay';
        overlay.setAttribute('data-annotation-id', annotationId);
        
        // Position overlay using coordinate conversion
        const screenCoords = convertPdfCoordsToOverlayCoords(
          annotation,
          annotation.page,
          canvasRef.value,
          { minX, minY, width, height }
        );
        
        if (screenCoords) {
          // Calculate scaled font size based on zoom level
          const canvasBounds = canvasRef.value.getBoundingClientRect();
          const canvasActualWidth = canvasRef.value.width;
          const scaleRatio = canvasBounds.width / canvasActualWidth;
          const scaledFontSize = Math.max(8, Math.min(16, 12 * scaleRatio)); // Min 8px, max 16px
          
          // Create a temporary element to measure the actual HTML content size
          const tempMeasure = document.createElement('div');
          tempMeasure.innerHTML = htmlContent;
          tempMeasure.style.position = 'absolute';
          tempMeasure.style.left = '-9999px';
          tempMeasure.style.top = '-9999px';
          tempMeasure.style.visibility = 'hidden';
          tempMeasure.style.fontSize = `${scaledFontSize}px`;
          tempMeasure.style.fontFamily = 'Arial, sans-serif';
          tempMeasure.style.whiteSpace = 'nowrap'; // Don't wrap for natural size
          tempMeasure.style.boxSizing = 'border-box';
          
          document.body.appendChild(tempMeasure);
          const naturalWidth = tempMeasure.offsetWidth;
          const naturalHeight = tempMeasure.offsetHeight;
          document.body.removeChild(tempMeasure);
          
          // Center the overlay on the center point of the PDF rectangle
          const centerX = screenCoords.x + (screenCoords.width / 2);
          const centerY = screenCoords.y + (screenCoords.height / 2);
          const overlayLeft = centerX - (naturalWidth / 2);
          const overlayTop = centerY - (naturalHeight / 2);
          
          overlay.style.position = 'absolute';
          overlay.style.left = `${overlayLeft}px`;
          overlay.style.top = `${overlayTop}px`;
          overlay.style.width = `${naturalWidth}px`; // Use natural width
          overlay.style.height = `${naturalHeight}px`; // Use natural height
          overlay.style.zIndex = '1000';
          overlay.style.pointerEvents = 'auto';
          overlay.style.fontSize = `${scaledFontSize}px`;
          overlay.style.fontFamily = 'Arial, sans-serif';
          overlay.style.boxSizing = 'border-box';
          
          // Add click handler that calls the overlay click callback directly
          overlay.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            console.log('[Simple HTML Render] Overlay clicked:', annotation.content);
            
            // Call the overlay click callback directly
            if (onOverlayClick) {
              const context = {
                x: event.clientX,
                y: event.clientY,
                pageNumber: parseInt(annotation.page)
              };
              onOverlayClick(annotation, context);
            }
          });
          
          // Add mouse enter/leave handlers to prevent flickering
          overlay.addEventListener('mouseenter', (event) => {
            event.stopPropagation();
            console.log('[Simple HTML Render] Mouse entered overlay');
          });
          
          overlay.addEventListener('mouseleave', (event) => {
            event.stopPropagation();
            console.log('[Simple HTML Render] Mouse left overlay');
          });
          
          htmlOverlayContainer.value.appendChild(overlay);
          console.log('[Simple HTML Render] Overlay created and positioned:');
          console.log('  - PDF rect center:', centerX.toFixed(1), ',', centerY.toFixed(1));
          console.log('  - Overlay position:', overlayLeft.toFixed(1), ',', overlayTop.toFixed(1));
          console.log('  - Natural size:', naturalWidth, 'x', naturalHeight, 'Scaled font size:', scaledFontSize);
          
          // Skip provider-based rendering - HTML overlay IS the visual representation
          return;
        }
      } catch (error) {
        console.warn('[Simple HTML Render] Error creating overlay:', error);
        // Fall through to provider-based rendering
      }
    }
    
    // Find the appropriate provider for this annotation
    const provider = findProviderForAnnotation(annotation);
    
    try {
      await provider.render(context);
    } catch (error) {
      console.warn(`Error rendering annotation with provider ${provider.id}:`, error);
      // Fallback to default provider if custom provider fails (unless disabled for debugging)
      if (provider.id !== 'default' && !disableFallbackRendering.value) {
        try {
          await defaultProvider.render(context);
        } catch (fallbackError) {
          console.error('Default provider also failed:', fallbackError);
        }
      } else if (disableFallbackRendering.value) {
        console.log('Fallback rendering disabled for debugging - no default rendering');
      }
    }
  };

  // Initialize the default provider
  setupDefaultProvider();

  // Simple coordinate conversion using canvas-rendered coordinates
  const convertPdfCoordsToOverlayCoords = (
    annotation: OverlayAnnotation,
    pageNumber: string | number,
    canvasElement: HTMLCanvasElement | null | undefined,
    canvasRenderedRect?: { minX: number; minY: number; width: number; height: number }
  ) => {
    if (!canvasElement || !canvasRenderedRect) {
      console.warn('[PDF Coord Conversion] No canvas element or canvas rect provided');
      return null;
    }
    
    try {
      // Use canvas-rendered coordinates with built-in overlay container
      const coords = pdfCoords.convertCanvasToOverlayCoords(
        canvasRenderedRect, // Canvas-rendered coordinates (already correct)
        canvasElement
      );
      
      if (!coords) {
        console.warn('[PDF Coord Conversion] Failed to convert coordinates');
        return null;
      }
      
      console.log(`[PDF Coord Conversion] Page ${pageNumber}`);
      console.log(`[PDF Coord Conversion] Canvas rect: minX=${canvasRenderedRect.minX.toFixed(1)}, minY=${canvasRenderedRect.minY.toFixed(1)}, ${canvasRenderedRect.width.toFixed(1)}x${canvasRenderedRect.height.toFixed(1)}`);
      console.log(`[PDF Coord Conversion] Converted coords:`, coords);
      
      return coords;
    } catch (error) {
      console.error('[PDF Coord Conversion] Error:', error);
      return null;
    }
  };

  // HTML Overlay System - for interactive elements (uses built-in PDFViewer overlay container)
  const createHtmlOverlay = (
    overlayTemplate: HtmlOverlayFunction,
    annotation: OverlayAnnotation,
    context: AnnotationRenderContext,
    canvasRenderedRect: { minX: number; minY: number; width: number; height: number }
  ): HTMLElement | null => {
    try {
      const result = overlayTemplate(annotation, context);
      if (!result) return null;
      
      const { html, styles = {}, events = {} } = result;
      
      // Create overlay element
      const overlay = document.createElement('div');
      overlay.innerHTML = html;
      overlay.className = 'pdf-annotation-overlay';
      
      // Get canvas and overlay container from PDFViewer context
      const canvas = canvasRef?.value;
      const overlayContainer = htmlOverlayContainer?.value;
      
      if (!canvas || !overlayContainer) {
        console.warn('[createHtmlOverlay] Canvas or overlay container not available');
        return null;
      }
      
      // Use coordinate conversion with built-in overlay container
      const pageNumber = annotation.page;
      const screenCoords = convertPdfCoordsToOverlayCoords(
        annotation,
        pageNumber,
        canvas,
        canvasRenderedRect
      );
      
      if (!screenCoords) {
        console.warn('[createHtmlOverlay] Failed to convert coordinates');
        return null;
      }
      
      // Position overlay using PDF.js converted coordinates
      overlay.style.position = 'absolute';
      overlay.style.left = `${screenCoords.x}px`;
      overlay.style.top = `${screenCoords.y}px`;
      overlay.style.width = `${screenCoords.width}px`;
      overlay.style.height = `${screenCoords.height}px`;
      overlay.style.zIndex = '1000';
      overlay.style.pointerEvents = 'auto';
      
      console.log(`[createHtmlOverlay] Converted coords: ${screenCoords.x}, ${screenCoords.y}, ${screenCoords.width}x${screenCoords.height}`);
      
      // Apply custom styles
      Object.entries(styles).forEach(([key, value]) => {
        overlay.style.setProperty(key, value);
      });
      
      // Attach event listeners
      Object.entries(events).forEach(([eventType, handler]) => {
        overlay.addEventListener(eventType, handler);
      });
      
      // Add to built-in overlay container
      overlayContainer.appendChild(overlay);
      
      return overlay;
    } catch (error) {
      console.error('Error creating HTML overlay:', error);
      return null;
    }
  };

  // HTML Template Rendering System
  const renderHtmlAnnotation = async (
    template: HtmlTemplateFunction,
    annotation: OverlayAnnotation,
    context: AnnotationRenderContext
  ): Promise<HTMLCanvasElement | null> => {
    try {
      const result = template(annotation, context);
      const { html, width, height, styles = {} } = result;
      
      // Use provided dimensions or calculate from context
      const renderWidth = width || context.rect.width;
      const renderHeight = height || context.rect.height;
      
      // Create temporary div with the HTML content
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '-9999px';
      tempDiv.style.width = `${renderWidth}px`;
      tempDiv.style.height = `${renderHeight}px`;
      
      // Apply custom styles if provided
      Object.entries(styles).forEach(([key, value]) => {
        tempDiv.style.setProperty(key, value);
      });
      
      // Add to DOM temporarily
      document.body.appendChild(tempDiv);
      
      // Render to canvas using html2canvas
      const canvas = await html2canvas(tempDiv, {
        width: renderWidth,
        height: renderHeight,
        backgroundColor: null,
        scale: 1,
        useCORS: true,
        allowTaint: true
      });
      
      // Clean up
      document.body.removeChild(tempDiv);
      
      // Return the canvas as-is - positioning will be handled by the caller
      return canvas;
    } catch (error) {
      console.error('Error rendering HTML annotation:', error);
      return null;
    }
  };
  
  // Register the default provider only once globally
  if (!annotationProviders.value.has('default')) {
    annotationProviders.value.set('default', defaultProvider);
  }

  // Draw hover effect
  const drawHoverEffect = async (ctx: CanvasRenderingContext2D, x: number, y: number, effectiveDpi: number) => {
    const annotation = getAnnotationAtPoint(x, y, ctx);
    if (annotation) {
      const annotationId = `annotation-${annotation.page}-${annotation.line}`;
      const { path } = annotationPaths.value.get(annotationId) || { path: null };
      
      if (path) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fill(path);
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.stroke(path);
        ctx.restore();
        
        // Draw annotation text - always try to draw, regardless of orientation
        try {
          await drawAnnotationText(ctx, annotation, effectiveDpi);
        } catch (error) {
          console.warn('Error drawing annotation text:', error);
        }
      }
    }
  };

  // Clear all annotations
  const clearAnnotations = () => {
    annotationPaths.value.clear();
    selectedAnnotation.value = null;
    showDialog.value = false;
  };

  // Close dialog
  const closeDialog = () => {
    showDialog.value = false;
    selectedAnnotation.value = null;
  };

  // Text style utilities
  const updateTextStyle = (updates: Partial<typeof textStyle.value>) => {
    textStyle.value = { ...textStyle.value, ...updates };
  };

  const resetTextStyle = () => {
    textStyle.value = {
      fontFamily: 'Arial, sans-serif',
      fontSize: 12, // Fixed font size for consistency
      textColor: 'rgba(0, 0, 0, 0.9)',
      backgroundColor: 'rgba(255, 255, 255, 0.98)', // More opaque white background
      borderColor: 'rgba(0, 0, 0, 0.4)',
      padding: 6, // Increased padding for better spacing
      minWidth: 20,
      minHeight: 10,
      maxWidth: 200, // Maximum width before wrapping
      lineHeight: 1.2 // Line height multiplier
    };
  };

  // Custom annotation provider management
  const registerAnnotationProvider = (options: AnnotationProviderOptions) => {
    // Use provided ID or generate from name
    const id = options.id || options.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    const provider: AnnotationProvider = {
      id,
      name: options.name,
      description: options.description,
      canHandle: options.canHandle,
      render: options.render
    };
    
    annotationProviders.value.set(provider.id, provider);
    activeProviders.value.add(provider.id);
    console.log(`Registered annotation provider: ${provider.name} (${provider.id})`);
  };

  const unregisterAnnotationProvider = (id: string) => {
    if (id === 'default') {
      console.warn('Cannot unregister the default annotation provider');
      return;
    }
    
    const removed = annotationProviders.value.delete(id);
    if (removed) {
      console.log(`Unregistered annotation provider: ${id}`);
    } else {
      console.warn(`Annotation provider not found: ${id}`);
    }
  };

  const getAnnotationProvider = (id: string): AnnotationProvider | undefined => {
    return annotationProviders.value.get(id);
  };

  const getAllProviders = (): AnnotationProvider[] => {
    return Array.from(annotationProviders.value.values());
  };

  const findProviderForAnnotation = (annotation: OverlayAnnotation): AnnotationProvider => {
    const providers = getAllProviders();
    console.log(`Finding provider for annotation: "${annotation.content}"`);
    console.log(`Available providers:`, providers.map(p => ({ id: p.id, name: p.name })));
    console.log(`Active providers:`, Array.from(activeProviders.value));
    
    // Check custom providers first (excluding default)
    const customProviders = providers.filter(p => p.id !== 'default');
    for (const provider of customProviders) {
      if (activeProviders.value.has(provider.id)) {
        console.log(`Checking custom provider: ${provider.name} (${provider.id})`);
        const canHandle = provider.canHandle(annotation);
        console.log(`Custom provider ${provider.name} canHandle: ${canHandle}`);
        if (canHandle) {
          console.log(`Selected custom provider: ${provider.name} (${provider.id}) for annotation:`, annotation.content);
          return provider;
        }
      } else {
        console.log(`Custom provider ${provider.name} (${provider.id}) is not active`);
      }
    }
    
    // Fallback to default provider
    console.log(`Using default provider for annotation:`, annotation.content);
    return defaultProvider;
  };

  // Provider state management
  const toggleProvider = (providerId: string) => {
    if (providerId === 'default') return; // Can't disable default
    
    if (activeProviders.value.has(providerId)) {
      unregisterAnnotationProvider(providerId);
      activeProviders.value.delete(providerId);
    } else {
      // Re-register the provider if it exists
      const provider = annotationProviders.value.get(providerId);
      if (provider) {
        registerAnnotationProvider(provider);
        activeProviders.value.add(providerId);
      }
    }
  };

  const isProviderActive = (providerId: string): boolean => {
    return activeProviders.value.has(providerId);
  };

  const getActiveProviders = (): string[] => {
    return Array.from(activeProviders.value);
  };

  // Cleanup function to clear all custom providers
  const cleanupProviders = () => {
    const customProviders = Array.from(annotationProviders.value.keys())
      .filter(id => id !== 'default');
    
    customProviders.forEach(id => {
      annotationProviders.value.delete(id);
      activeProviders.value.delete(id);
    });
    
    // Reset to only default provider
    activeProviders.value.clear();
    activeProviders.value.add('default');
    
    console.log(`Cleaned up all custom providers, active providers:`, Array.from(activeProviders.value));
  };

  // Computed
  const selectedAnnotationContent = computed(() => selectedAnnotation.value?.content || '');

  return {
    // State
    pageAnnotations,
    selectedAnnotation,
    annotationPaths,
    showDialog,
    textStyle,
    
    // Methods
    loadAnnotations,
    initializePdfCoordinates,
    getAnnotationsForPage,
    convertCoordinates,
    createAnnotationPath,
    drawAnnotations,
    getAnnotationAtPoint,
    handleAnnotationClick,
    showAnnotationDialog,
    handleAnnotationHover,
    drawHoverEffect,
    drawAnnotationText,
    clearAnnotations,
    closeDialog,
    updateTextStyle,
    resetTextStyle,
    
    // Custom annotation provider methods
    registerAnnotationProvider,
    unregisterAnnotationProvider,
    getAnnotationProvider,
    getAllProviders,
    findProviderForAnnotation,
    
    // Provider state management
    toggleProvider,
    isProviderActive,
    getActiveProviders,
    activeProviders,
    cleanupProviders,
    
    // Computed
    selectedAnnotationContent,
    
    // HTML Template System
    renderHtmlAnnotation,
    
    // HTML Overlay System
    createHtmlOverlay,
    
    // Debug utilities
    disableFallbackRendering,
    
    // Test function for coordinate debugging
    testCoordinateConversion: pdfCoords.testCoordinateConversion
  };
}

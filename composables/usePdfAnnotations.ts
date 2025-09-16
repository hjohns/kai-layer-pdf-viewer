import { ref, computed } from 'vue';
import type { DocAnnotation } from '@/workers/mupdf.worker';

// Re-export DocAnnotation for external use
export type { DocAnnotation };

// Custom annotation provider interfaces
export interface AnnotationRenderContext {
  ctx: CanvasRenderingContext2D;
  annotation: DocAnnotation;
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
  canHandle: (annotation: DocAnnotation) => boolean;
  render: (context: AnnotationRenderContext) => void;
  priority?: number; // Higher numbers = higher priority
}

export interface AnnotationProviderOptions {
  id: string;
  name: string;
  description?: string;
  canHandle: (annotation: DocAnnotation) => boolean;
  render: (context: AnnotationRenderContext) => void;
  priority?: number;
}

export function usePdfAnnotations() {
  // State
  const pageAnnotations = ref<DocAnnotation[]>([]);
  const selectedAnnotation = ref<DocAnnotation | null>(null);
  const annotationPaths = ref(new Map<string, { path: Path2D, annotation: DocAnnotation }>());
  const showDialog = ref(false);
  
  // Custom annotation providers
  const annotationProviders = ref<Map<string, AnnotationProvider>>(new Map());
  const defaultProvider: AnnotationProvider = {
    id: 'default',
    name: 'Default Text Renderer',
    description: 'Built-in text rendering for annotations',
    canHandle: () => true, // Default provider handles all annotations
    priority: 0,
    render: () => {} // Will be set later
  };
  
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

  // Get annotations for a specific page
  const getAnnotationsForPage = (pageNumber: number) => {
    return pageAnnotations.value.filter(
      (annotation: DocAnnotation) => annotation.page === (pageNumber + 1).toString()
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

  // Handle annotation click
  const handleAnnotationClick = (x: number, y: number, ctx: CanvasRenderingContext2D) => {
    const annotation = getAnnotationAtPoint(x, y, ctx);
    if (annotation) {
      selectedAnnotation.value = annotation;
      showDialog.value = true;
      return true;
    }
    return false;
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
  const drawAnnotationText = (
    ctx: CanvasRenderingContext2D, 
    annotation: DocAnnotation, 
    effectiveDpi: number,
    pageNumber: number = 0
  ) => {
    if (!annotation.content || !annotation.content.trim()) return;
    
    // Calculate rectangle bounds
    const points = convertCoordinates(annotation.rect, effectiveDpi);
    if (points.length < 3) return;
    
    const minX = Math.min(...points.map(p => p[0]));
    const maxX = Math.max(...points.map(p => p[0]));
    const minY = Math.min(...points.map(p => p[1]));
    const maxY = Math.max(...points.map(p => p[1]));
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    // Only skip if the rectangle is completely invalid
    if (width <= 0 || height <= 0) return;
    
    // Create render context
    const context: AnnotationRenderContext = {
      ctx,
      annotation,
      effectiveDpi,
      pageNumber,
      rect: { minX, maxX, minY, maxY, width, height }
    };
    
    // Find the appropriate provider for this annotation
    const provider = findProviderForAnnotation(annotation);
    
    try {
      provider.render(context);
    } catch (error) {
      console.warn(`Error rendering annotation with provider ${provider.id}:`, error);
      // Fallback to default provider if custom provider fails
      if (provider.id !== 'default') {
        try {
          defaultProvider.render(context);
        } catch (fallbackError) {
          console.error('Default provider also failed:', fallbackError);
        }
      }
    }
  };

  // Initialize the default provider
  setupDefaultProvider();

  // Draw hover effect
  const drawHoverEffect = (ctx: CanvasRenderingContext2D, x: number, y: number, effectiveDpi: number) => {
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
          drawAnnotationText(ctx, annotation, effectiveDpi);
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
    const provider: AnnotationProvider = {
      id: options.id,
      name: options.name,
      description: options.description,
      canHandle: options.canHandle,
      render: options.render,
      priority: options.priority || 0
    };
    
    annotationProviders.value.set(provider.id, provider);
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
    return Array.from(annotationProviders.value.values()).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  };

  const findProviderForAnnotation = (annotation: DocAnnotation): AnnotationProvider => {
    const providers = getAllProviders();
    
    for (const provider of providers) {
      if (provider.canHandle(annotation)) {
        return provider;
      }
    }
    
    // Fallback to default provider
    return defaultProvider;
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
    getAnnotationsForPage,
    convertCoordinates,
    createAnnotationPath,
    drawAnnotations,
    getAnnotationAtPoint,
    handleAnnotationClick,
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
    
    // Computed
    selectedAnnotationContent
  };
}

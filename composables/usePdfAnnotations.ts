import { ref, computed } from 'vue';
import type { DocAnnotation } from '@/workers/mupdf.worker';

export function usePdfAnnotations() {
  // State
  const pageAnnotations = ref<DocAnnotation[]>([]);
  const selectedAnnotation = ref<DocAnnotation | null>(null);
  const annotationPaths = ref(new Map<string, { path: Path2D, annotation: DocAnnotation }>());
  const showDialog = ref(false);
  
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

  // Draw annotation text inside rectangle
  const drawAnnotationText = (
    ctx: CanvasRenderingContext2D, 
    annotation: DocAnnotation, 
    effectiveDpi: number
  ) => {
    if (!annotation.content || !annotation.content.trim()) return;
    
    const points = convertCoordinates(annotation.rect, effectiveDpi);
    if (points.length < 3) return;
    
    // Calculate bounding box
    const minX = Math.min(...points.map(p => p[0]));
    const maxX = Math.max(...points.map(p => p[0]));
    const minY = Math.min(...points.map(p => p[1]));
    const maxY = Math.max(...points.map(p => p[1]));
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    // More lenient size requirements - only skip if extremely small
    const isVertical = isVerticalOrientation(width, height);
    const absoluteMinWidth = 8;  // Very small minimum
    const absoluteMinHeight = 6; // Very small minimum
    
    if (width < absoluteMinWidth || height < absoluteMinHeight) {
      console.log('Skipping annotation - too small:', { width, height, absoluteMinWidth, absoluteMinHeight, isVertical });
      return;
    }
    
    ctx.save();
    
    // Set text styling - use smaller font for very small rectangles
    const baseFontSize = textStyle.value.fontSize;
    const fontSize = (width < 20 || height < 12) ? Math.max(8, baseFontSize * 0.8) : baseFontSize;
    ctx.font = `${fontSize}px ${textStyle.value.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const padding = textStyle.value.padding;
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
    
    if (isVertical && width >= 12 && height >= 16) {
      // For vertical orientation, treat each character as a line
      // Only use vertical if rectangle is tall enough to accommodate it
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
    
    // Computed
    selectedAnnotationContent
  };
}

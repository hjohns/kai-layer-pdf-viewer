import { ref } from 'vue';

// Lightweight PDF coordinate conversion without PDF.js dependency
// Based on PDF.js coordinate system math but simplified

export function usePdfCoordinates() {
  
  // Convert canvas-rendered coordinates to overlay coordinates (built-in overlay container)
  const convertCanvasToOverlayCoords = (
    canvasRect: { minX: number; minY: number; width: number; height: number },
    canvasElement: HTMLCanvasElement | null | undefined
  ) => {
    if (!canvasElement) {
      console.warn('[PDF Coords] No canvas element provided');
      return null;
    }
    
    try {
      const { minX, minY, width, height } = canvasRect;
      
      console.log(`[PDF Coords] Canvas rect: ${minX.toFixed(1)}, ${minY.toFixed(1)}, ${width.toFixed(1)}x${height.toFixed(1)}`);
      
      // Get canvas dimensions and scaling
      const canvasBounds = canvasElement.getBoundingClientRect();
      const canvasActualWidth = canvasElement.width;
      const canvasActualHeight = canvasElement.height;
      const canvasDisplayWidth = canvasBounds.width;
      const canvasDisplayHeight = canvasBounds.height;
      
      // Calculate scale factors from canvas pixels to display pixels
      const scaleX = canvasDisplayWidth / canvasActualWidth;
      const scaleY = canvasDisplayHeight / canvasActualHeight;
      
      // The overlay container is positioned absolute relative to the canvas container
      // So we can use the scaled coordinates directly
      const overlayX = minX * scaleX;
      const overlayY = minY * scaleY;
      const overlayWidth = width * scaleX;
      const overlayHeight = height * scaleY;
      
      console.log(`[PDF Coords] Canvas: ${canvasActualWidth}x${canvasActualWidth} -> Display: ${canvasDisplayWidth.toFixed(1)}x${canvasDisplayHeight.toFixed(1)}`);
      console.log(`[PDF Coords] Scale factors: ${scaleX.toFixed(3)}, ${scaleY.toFixed(3)}`);
      console.log(`[PDF Coords] Overlay coords: ${overlayX.toFixed(1)}, ${overlayY.toFixed(1)}, ${overlayWidth.toFixed(1)}x${overlayHeight.toFixed(1)}`);
      
      return {
        x: overlayX,
        y: overlayY,
        width: overlayWidth,
        height: overlayHeight
      };
    } catch (error) {
      console.error('[PDF Coords] Error converting coordinates:', error);
      return null;
    }
  };
  
  // Simpler fallback that just uses canvas scaling
  const convertSimpleCoords = (
    minX: number,
    minY: number,
    width: number,
    height: number,
    canvasElement: HTMLCanvasElement | null | undefined
  ) => {
    if (!canvasElement) {
      console.warn('[PDF Coords] No canvas element provided');
      return null;
    }
    
    // Get canvas dimensions
    const canvasRect = canvasElement.getBoundingClientRect();
    const canvasActualWidth = canvasElement.width;
    const canvasActualHeight = canvasElement.height;
    const canvasDisplayWidth = canvasRect.width;
    const canvasDisplayHeight = canvasRect.height;
    
    // Calculate scale factors
    const scaleX = canvasDisplayWidth / canvasActualWidth;
    const scaleY = canvasDisplayHeight / canvasActualHeight;
    
    // Apply scaling
    const screenX = minX * scaleX;
    const screenY = minY * scaleY;
    const screenWidth = width * scaleX;
    const screenHeight = height * scaleY;
    
    console.log(`[Simple Coords] Canvas scale: ${scaleX.toFixed(3)} x ${scaleY.toFixed(3)}`);
    console.log(`[Simple Coords] ${minX.toFixed(1)}, ${minY.toFixed(1)}, ${width.toFixed(1)}x${height.toFixed(1)} -> ${screenX.toFixed(1)}, ${screenY.toFixed(1)}, ${screenWidth.toFixed(1)}x${screenHeight.toFixed(1)}`);
    
    return {
      x: screenX,
      y: screenY,
      width: screenWidth,
      height: screenHeight
    };
  };
  
  // Test function to validate coordinate conversion
  const testCoordinateConversion = (
    testRect: { minX: number; minY: number; width: number; height: number },
    canvasElement: HTMLCanvasElement | null | undefined
  ) => {
    console.log('=== COORDINATE CONVERSION TEST ===');
    console.log('Input canvas rect:', testRect);
    
    if (!canvasElement) {
      console.log('❌ No canvas element provided');
      return null;
    }
    
    // Get canvas info
    const canvasBounds = canvasElement.getBoundingClientRect();
    const canvasActualWidth = canvasElement.width;
    const canvasActualHeight = canvasElement.height;
    const canvasDisplayWidth = canvasBounds.width;
    const canvasDisplayHeight = canvasBounds.height;
    
    console.log('Canvas actual dimensions:', `${canvasActualWidth}x${canvasActualHeight}`);
    console.log('Canvas display dimensions:', `${canvasDisplayWidth.toFixed(1)}x${canvasDisplayHeight.toFixed(1)}`);
    console.log('Canvas position in viewport:', `left=${canvasBounds.left.toFixed(1)}, top=${canvasBounds.top.toFixed(1)}`);
    
    // Check for canvas transformations (zoom)
    const canvasStyle = window.getComputedStyle(canvasElement);
    const transform = canvasStyle.transform;
    console.log('Canvas transform:', transform);
    
    // Calculate scale factors
    const scaleX = canvasDisplayWidth / canvasActualWidth;
    const scaleY = canvasDisplayHeight / canvasActualHeight;
    console.log('Scale factors:', `scaleX=${scaleX.toFixed(3)}, scaleY=${scaleY.toFixed(3)}`);
    
    // Convert coordinates
    const screenX = testRect.minX * scaleX;
    const screenY = testRect.minY * scaleY;
    const screenWidth = testRect.width * scaleX;
    const screenHeight = testRect.height * scaleY;
    
    const result = {
      x: screenX,
      y: screenY,
      width: screenWidth,
      height: screenHeight
    };
    
    console.log('Output screen coords:', result);
    console.log('Expected overlay position:', `left=${screenX.toFixed(1)}px, top=${screenY.toFixed(1)}px`);
    console.log('Expected overlay size:', `width=${screenWidth.toFixed(1)}px, height=${screenHeight.toFixed(1)}px`);
    console.log('=== END TEST ===');
    
    return result;
  };

  return {
    convertCanvasToOverlayCoords,
    convertSimpleCoords,
    testCoordinateConversion
  };
}

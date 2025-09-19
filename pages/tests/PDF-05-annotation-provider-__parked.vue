<template>
  <div>
    <TestPanel 
      heading="PDF 03 Annotation Simple" 
      description="Minimal example of custom annotation provider that detects and links domain names"
    >
      <div class="bg-blue-50 p-5 rounded-lg border-l-4 border-blue-500 mb-6">
        <h3 class="text-lg font-semibold text-blue-800 mb-4">Test Instructions</h3>
        <ul class="space-y-2">
          <li class="text-gray-700 leading-relaxed">
            <strong class="text-blue-800">HTML Overlays:</strong> Creates real HTML elements positioned over PDF annotations
          </li>
          <li class="text-gray-700 leading-relaxed">
            <strong class="text-blue-800">Domain Links:</strong> Annotations with domains become clickable links (right-click to inspect!)
          </li>
          <li class="text-gray-700 leading-relaxed">
            <strong class="text-blue-800">Template-Based:</strong> Uses HTML overlay templates - no DOM manipulation needed
          </li>
          <li class="text-gray-700 leading-relaxed">
            <strong class="text-red-800">🧪 Debug:</strong> Run <code class="bg-gray-200 px-1 rounded">testCoords()</code> in console to test coordinate conversion
          </li>
        </ul>
      </div>
      
      <div class="border-2 border-gray-300 rounded-lg overflow-hidden shadow-lg">
        <PDFViewer 
          :file="pdfFile" 
          :overlays="overlays"
          ref="pdfViewerRef"
          @click="handlePdfClick"
        />
        <!-- HTML overlays are now built into PDFViewer! -->
      </div>
    </TestPanel>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import PDFViewer from '@/components/PDFViewer.vue';
import { usePdfAnnotations } from '@/composables/usePdfAnnotations';
import type { OverlayAnnotation } from '@/types/annotations';
import type { AnnotationProvider, AnnotationRenderContext, HtmlOverlayFunction, HtmlTemplateFunction } from '@/composables/usePdfAnnotations';

const { addLog } = useLog();

// PDF file configuration
const pdfFile = '/pdf-tests/pdf-01.pdf';
const overlays = '/pdf-tests/pdf-01-overlay.json';

// Get annotation management functions
const { registerAnnotationProvider, unregisterAnnotationProvider, activeProviders, cleanupProviders, getAllProviders, createHtmlOverlay, renderHtmlAnnotation, disableFallbackRendering, testCoordinateConversion } = usePdfAnnotations();

// PDF viewer ref
const pdfViewerRef = ref();

// Domain name regex pattern - more specific to avoid matching email usernames
const domainPattern = /\b([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b/;

// Visual Template for Canvas Rendering (shows the styled background)
const domainVisualTemplate: HtmlTemplateFunction = (annotation, context) => {
  const { content } = annotation;
  const { width, height } = context.rect;
  const domainMatch = content.match(domainPattern);
  
  if (domainMatch) {
    const domain = domainMatch[0];
    const domainIndex = domainMatch.index!;
    const beforeDomain = content.substring(0, domainIndex);
    const afterDomain = content.substring(domainIndex + domain.length);
    
    const textWidth = context.ctx.measureText(content).width;
    const padding = 4;
    const bgWidth = Math.max(textWidth + padding * 2, Math.min(width, 200));
    
    return {
      html: `
        <div class="pdf-03-annotation-container" style="width: ${bgWidth}px; height: ${20 + padding * 2}px;">
          ${beforeDomain}<span class="pdf-03-domain-link">${domain}</span>${afterDomain}
        </div>
      `,
      width: bgWidth,
      height: 20 + padding * 2
    };
  }
  
  return {
    html: `<div class="pdf-03-annotation-container" style="width: ${Math.min(width, 200)}px; height: 20px;">${content}</div>`,
    width: Math.min(width, 200),
    height: 20
  };
};

// HTML Overlay Template for Domain Links (invisible, for clicking)
const domainOverlayTemplate: HtmlOverlayFunction = (annotation, context) => {
  const { content } = annotation;
  const domainMatch = content.match(domainPattern);
  
  if (!domainMatch) return null;
  
  const domain = domainMatch[0];
  
  // Calculate appropriate font size based on overlay height
  const overlayHeight = context.rect.height;
  const scaledHeight = overlayHeight * 0.38; // Apply the same scaling as coordinates
  const fontSize = Math.max(6, Math.min(12, scaledHeight * 0.6)); // Font size 60% of height, min 6px, max 12px
  
  console.log(`[Font Scaling] Original height: ${overlayHeight}, Scaled height: ${scaledHeight}, Font size: ${fontSize}`);
  
  return {
    html: `<a href="https://${domain}" target="_blank" class="pdf-03-overlay-link">${content}</a>`,
    styles: {
      'background': 'rgba(255, 0, 0, 0.3)', // RED BACKGROUND for debugging
      'border': '2px solid red', // RED BORDER for debugging
      'text-decoration': 'none',
      'display': 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'cursor': 'pointer',
      'color': 'white',
      'font-weight': 'bold',
      'font-size': `${fontSize}px`, // Dynamic font size
      'line-height': '1'
    },
    events: {
      'click': (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        window.open(`https://${domain}`, '_blank');
        console.log(`Opening domain: https://${domain}`);
      },
      'mouseenter': () => {
        console.log(`Hovering over domain: ${domain}`);
      }
    }
  };
};

// Domain detection annotation provider - SIMPLIFIED!
const domainProvider: AnnotationProviderOptions = {
  name: 'Domain Linker',
  description: 'Detects domain names and makes them clickable',
  
  canHandle: (annotation: OverlayAnnotation) => {
    const content = annotation.content || '';
    const hasDomain = domainPattern.test(content);
    console.log(`[Domain Provider] canHandle check: "${content}" -> ${hasDomain}`);
    return hasDomain;
  },
  
  render: async (context: AnnotationRenderContext) => {
    const { ctx, rect } = context;
    const { minX, minY, width, height } = rect;
    
    // TEMPORARILY DISABLE VISUAL RENDERING - only create overlays
    console.log(`Creating overlay for annotation at rect: minX=${minX}, minY=${minY}, width=${width}, height=${height}`);
    
      // Create interactive HTML overlay using built-in PDFViewer overlay container
      const overlay = createHtmlOverlay(
        domainOverlayTemplate, 
        context.annotation, 
        context, 
        { minX, minY, width, height } // Pass canvas-rendered rect for proper overlay positioning and sizing
      );
      
      if (overlay) {
        console.log(`Domain overlay created for: ${context.annotation.content}`);
        console.log(`Overlay positioned at: left=${overlay.style.left}, top=${overlay.style.top}, width=${overlay.style.width}, height=${overlay.style.height}`);
        console.log(`PDF rect: minX=${minX}, minY=${minY}, width=${width}, height=${height}`);
        
        // Add a unique ID for debugging
        overlay.id = `overlay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        overlay.setAttribute('data-annotation-content', context.annotation.content || '');
        console.log(`Overlay ID: ${overlay.id}`);
      } else {
        console.log(`No overlay created for: ${context.annotation.content}`);
      }
  }
};

// Debug function to highlight all overlays
const highlightAllOverlays = () => {
  const overlayContainer = pdfViewerRef.value?.htmlOverlayContainer;
  if (!overlayContainer) return;
  
  const overlays = overlayContainer.children;
  console.log(`Found ${overlays.length} overlays:`);
  
  for (let i = 0; i < overlays.length; i++) {
    const overlay = overlays[i] as HTMLElement;
    const content = overlay.getAttribute('data-annotation-content');
    console.log(`Overlay ${i}: ${content} at position ${overlay.style.left}, ${overlay.style.top}`);
    
    // Flash the overlay
    overlay.style.background = 'rgba(0, 255, 0, 0.8)';
    setTimeout(() => {
      overlay.style.background = 'rgba(255, 0, 0, 0.3)';
    }, 1000);
  }
};

// Debug function to move overlays to visible positions for testing
const moveOverlaysToVisible = () => {
  const overlayContainer = pdfViewerRef.value?.htmlOverlayContainer;
  if (!overlayContainer) return;
  
  const overlays = overlayContainer.children;
  console.log(`Moving ${overlays.length} overlays to visible positions`);
  
  for (let i = 0; i < overlays.length; i++) {
    const overlay = overlays[i] as HTMLElement;
    const content = overlay.getAttribute('data-annotation-content');
    
    // Position overlays in a visible area (stacked vertically)
    overlay.style.left = '100px';
    overlay.style.top = `${100 + (i * 50)}px`;
    overlay.style.width = '200px';
    overlay.style.height = '30px';
    
    console.log(`Moved overlay ${i} (${content}) to visible position: 100px, ${100 + (i * 50)}px`);
  }
};

// Test coordinate conversion function
const testCoords = (testRect?: { minX: number; minY: number; width: number; height: number }) => {
  const canvas = pdfViewerRef.value?.$el?.querySelector('canvas') as HTMLCanvasElement | null;
  
  // Use provided test rect or a sample from the logs
  const rect = testRect || { minX: 1758.5472, minY: 311.769, width: 301.632, height: 23.769 };
  
  console.log('🧪 Testing coordinate conversion...');
  const result = testCoordinateConversion(rect, canvas);
  
  const overlayContainer = pdfViewerRef.value?.htmlOverlayContainer;
  if (result && overlayContainer) {
    // Create a test overlay to visualize the result
    const testOverlay = document.createElement('div');
    testOverlay.style.position = 'absolute';
    testOverlay.style.left = `${result.x}px`;
    testOverlay.style.top = `${result.y}px`;
    testOverlay.style.width = `${result.width}px`;
    testOverlay.style.height = `${result.height}px`;
    testOverlay.style.background = 'rgba(0, 255, 0, 0.5)';
    testOverlay.style.border = '2px solid lime';
    testOverlay.style.zIndex = '2000';
    testOverlay.style.pointerEvents = 'none';
    testOverlay.innerHTML = '🧪 TEST';
    testOverlay.id = 'coordinate-test-overlay';
    
    // Remove existing test overlay
    const existing = document.getElementById('coordinate-test-overlay');
    if (existing) existing.remove();
    
    overlayContainer.appendChild(testOverlay);
    console.log('✅ Test overlay created! Look for the green box with 🧪 TEST');
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      testOverlay.remove();
      console.log('🧪 Test overlay removed');
    }, 5000);
  }
  
  return result;
};

// Expose functions globally for debugging
(window as any).highlightOverlays = highlightAllOverlays;
(window as any).moveOverlaysToVisible = moveOverlaysToVisible;
(window as any).testCoords = testCoords;

// Simple click handler - overlays handle the actual clicks now
const handlePdfClick = (event: MouseEvent) => {
  console.log('PDF clicked - HTML overlays should handle domain links');
  console.log('You can run highlightOverlays() in the console to see all overlays');
};

// Register the provider on mount
onMounted(() => {
  console.log('PDF-03: Mounting, registering domain provider...');
  
  // NOTE: Simple coordinate system now initializes automatically during PDF loading in usePdf.ts
  
  // Enable debug mode - disable fallback rendering to see only custom provider
  disableFallbackRendering.value = true;
  console.log('PDF-03: Fallback rendering disabled for debugging');
  
  registerAnnotationProvider(domainProvider);
  addLog('PDF-03: Domain provider registered and activated');
  addLog('PDF-03: Simple coordinate system will initialize with PDF loading');
  addLog('PDF-03: Fallback rendering disabled for debugging');
  addLog('PDF-03: Active providers:', Array.from(activeProviders.value));
  addLog('PDF-03: All providers:', getAllProviders().map(p => ({ id: p.id, name: p.name })));
});

// Clean up when component is unmounted
onBeforeUnmount(() => {
  // Re-enable fallback rendering
  disableFallbackRendering.value = false;
  console.log('PDF-03: Re-enabled fallback rendering');
  
  // Clean up all custom providers
  addLog('PDF-03: Cleaning up all providers on unmount');
  cleanupProviders();
  console.log('PDF-03: Cleaned up all providers on unmount');
});
</script>

<style>
/* Non-scoped styles for PDF-03 annotations - these will work with html2canvas */
.pdf-03-annotation-container {
  background: rgba(255, 255, 255, 0.98);
  border: 1.5px solid rgba(0, 0, 0, 0.4);
  padding: 0 4px;
  text-align: center;
  font-size: 12px;
  font-family: Arial, sans-serif;
  line-height: 1.2;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  margin: 0;
  overflow: hidden;
  word-wrap: break-word;
  white-space: normal;
  /* Adjust vertical positioning - try these options: */
  align-items: flex-start; /* Align to top */
  /* align-items: flex-end; */    /* Align to bottom */
  /* padding-top: 2px; */         /* Add top padding to push down */
  /* padding-bottom: 2px; */      /* Add bottom padding to push up */
}

.pdf-03-domain-link {
  color: #3b82f6;
  text-decoration: underline;
  cursor: pointer;
}

.pdf-03-overlay-link {
  color: transparent;
  text-decoration: none;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pdf-03-overlay-link:hover {
  background: rgba(59, 130, 246, 0.1);
}
</style>

<template>
  <div>
    <TestPanel 
      heading="PDF 02 Annotation Provider" 
      description="Test custom annotation providers with JSON debug and custom rendering"
    >
      <div class="bg-gray-50 p-6 rounded-lg mb-6 border border-gray-200">
        <h2 class="text-xl font-semibold text-gray-700 mb-5">Provider Management</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div 
            v-for="provider in allProviders" 
            :key="provider.id"
            class="bg-white p-5 rounded-lg border-2 transition-all duration-300 shadow-sm"
            :class="{ 
              'border-green-500 bg-green-50 shadow-green-200': isProviderActive(provider.id),
              'border-gray-200': !isProviderActive(provider.id)
            }"
          >
            <label class="block cursor-pointer">
              <input 
                type="checkbox" 
                :checked="isProviderActive(provider.id)"
                @change="toggleProvider(provider.id)"
                :disabled="provider.id === 'default'"
                class="mr-6"
              />
              <div class="ml-6">
                <strong class="block mb-2 text-gray-800 text-lg">{{ provider.name }}</strong>
                <span class="block text-sm text-gray-600 mb-1 leading-relaxed">{{ provider.description }}</span>
                <span class="block text-xs text-gray-500 italic">Registered order</span>
              </div>
            </label>
          </div>
        </div>
        
        <div class="flex flex-wrap gap-4">
          <button 
            @click="registerTestProviders" 
            class="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 hover:-translate-y-0.5 transition-all duration-200 font-medium uppercase tracking-wide"
          >
            Register Test Providers
          </button>
          
          <button 
            @click="registerCustomProvider" 
            class="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 hover:-translate-y-0.5 transition-all duration-200 font-medium uppercase tracking-wide"
          >
            Register Custom Provider
          </button>
          
          <button 
            @click="clearAllProviders" 
            class="px-6 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 hover:-translate-y-0.5 transition-all duration-200 font-medium uppercase tracking-wide"
          >
            Clear All Custom Providers
          </button>
        </div>
      </div>
      
      <div class="border-2 border-gray-300 rounded-lg overflow-hidden mb-6 shadow-lg">
        <PDFViewer 
          :file="pdfFile" 
          :overlays="overlays"
          ref="pdfViewerRef"
        />
      </div>
      
      <div class="bg-blue-50 p-5 rounded-lg border-l-4 border-blue-500">
        <h3 class="text-lg font-semibold text-blue-800 mb-4">Test Instructions</h3>
        <ul class="space-y-2">
          <li class="text-gray-700 leading-relaxed">
            <strong class="text-blue-800">JSON Debug Provider:</strong> Hover over ANY annotation to see its raw JSON data displayed on the PDF
          </li>
          <li class="text-gray-700 leading-relaxed">
            <strong class="text-blue-800">Simple Custom Provider:</strong> Hover over annotations containing "TEST" to see custom blue styling
          </li>
          <li class="text-gray-700 leading-relaxed">
            <strong class="text-blue-800">Default Provider:</strong> All other annotations use the default text rendering
          </li>
          <li class="text-gray-700 leading-relaxed">Toggle providers on/off to see different rendering behaviors</li>
          <li class="text-gray-700 leading-relaxed">Check browser console for provider selection logs</li>
          <li class="text-gray-700 leading-relaxed">The JSON debug provider shows you exactly what data is available to work with</li>
        </ul>
      </div>
    </TestPanel>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import PDFViewer from '@/components/PDFViewer.vue';
import { usePdfAnnotations } from '@/composables/usePdfAnnotations';
import type { OverlayAnnotation } from '@/types/annotations';
import type { AnnotationProvider, AnnotationRenderContext } from '@/composables/usePdfAnnotations';

// PDF file configuration
const pdfFile = ref('/pdf-tests/pdf-01.pdf');
const overlays = ref('/pdf-tests/pdf-01-overlay.json');

// Get annotation management functions
const {
  registerAnnotationProvider,
  unregisterAnnotationProvider,
  getAllProviders,
  findProviderForAnnotation,
  toggleProvider,
  isProviderActive,
  getActiveProviders,
  activeProviders,
  cleanupProviders
} = usePdfAnnotations();

// Computed providers list
const allProviders = computed(() => getAllProviders());

// Load providers on mount
onMounted(() => {
  registerTestProviders();
});

// Clean up when component is unmounted
onBeforeUnmount(() => {
  cleanupProviders();
  console.log('PDF-02: Cleaned up all providers on unmount');
});

// Register test providers
const registerTestProviders = () => {
  // Clear existing custom providers first
  clearAllProviders();
  
  // JSON Debug Provider - Simple provider that shows annotation data
  registerAnnotationProvider({
    name: 'JSON Debug Provider',
    description: 'Shows the raw annotation JSON data for debugging',
    
    canHandle: (annotation: OverlayAnnotation) => {
      // Handle all annotations for debugging
      return true;
    },
    
    render: (context: AnnotationRenderContext) => {
      const { ctx, annotation, rect, effectiveDpi, pageNumber } = context;
      const { minX, maxX, minY, maxY, width, height } = rect;
      
      ctx.save();
      
      // Draw a more visible background
      ctx.fillStyle = 'rgba(255, 255, 0, 0.3)'; // Yellow background for visibility
      ctx.fillRect(minX, minY, width, height);
      
      // Draw a more visible border
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'; // Red border for visibility
      ctx.lineWidth = 2;
      ctx.strokeRect(minX, minY, width, height);
      
      // Prepare simplified JSON data for small rectangles
      const jsonData = {
        content: annotation.content,
        page: annotation.page,
        line: annotation.line,
        rect: annotation.rect,
        canvasRect: {
          minX: Math.round(minX),
          maxX: Math.round(maxX),
          minY: Math.round(minY),
          maxY: Math.round(maxY),
          width: Math.round(width),
          height: Math.round(height)
        },
        effectiveDpi: Math.round(effectiveDpi * 100) / 100,
        pageNumber: pageNumber
      };
      
      // Convert to JSON string
      const jsonString = JSON.stringify(jsonData, null, 2);
      
      // Adaptive font sizing based on rectangle size
      let fontSize = 8;
      let lineHeight = 10;
      let padding = 2;
      
      if (height > 20) {
        fontSize = 10;
        lineHeight = 12;
        padding = 4;
      } else if (height > 15) {
        fontSize = 9;
        lineHeight = 11;
        padding = 3;
      }
      
      // Set up text styling
      ctx.font = `${fontSize}px monospace`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      // Split JSON into lines
      const lines = jsonString.split('\n');
      
      // Don't truncate - show all lines
      const displayLines = lines;
      
      // Draw background for text - make it extend well beyond rectangle bounds
      const textWidth = Math.max(...displayLines.map(line => ctx.measureText(line).width));
      const textHeight = displayLines.length * lineHeight;
      
      // Make background much larger to accommodate full JSON
      const bgWidth = Math.max(textWidth + padding * 2, 400); // Minimum 400px width
      const bgHeight = Math.max(textHeight + padding * 2, 200); // Minimum 200px height
      const bgX = minX - 50; // Extend 50px to the left
      const bgY = minY - 20; // Extend 20px above
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
      ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
      
      // Draw border around text background
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(bgX, bgY, bgWidth, bgHeight);
      
      // Draw the JSON text - show ALL lines
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      displayLines.forEach((line, index) => {
        ctx.fillText(
          line,
          bgX + padding,
          bgY + padding + (index * lineHeight)
        );
      });
      
      ctx.restore();
    }
  });

  // Update active providers
  activeProviders.value.add('json-debug');
};

// Register a custom provider example
const registerCustomProvider = () => {
  const customProvider: AnnotationProviderOptions = {
    name: 'Simple Custom Provider',
    description: 'A simple example that shows how to create a basic custom provider',
    
    canHandle: (annotation: OverlayAnnotation) => {
      // Only handle annotations that contain "TEST"
      return annotation.content?.toUpperCase().includes('TEST') || false;
    },
    
    render: (context: AnnotationRenderContext) => {
      const { ctx, annotation, rect } = context;
      const { minX, maxX, minY, maxY, width, height } = rect;
      
      ctx.save();
      
      // Draw a simple blue background
      ctx.fillStyle = 'rgba(0, 100, 255, 0.2)';
      ctx.fillRect(minX, minY, width, height);
      
      // Draw a blue border
      ctx.strokeStyle = 'rgba(0, 100, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(minX, minY, width, height);
      
      // Draw simple text
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.fillStyle = 'rgba(0, 100, 255, 1)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.fillText(
        `CUSTOM: ${annotation.content}`,
        minX + width / 2,
        minY + height / 2
      );
      
      ctx.restore();
    }
  };
  
  registerAnnotationProvider(customProvider);
};

// Clear all custom providers
const clearAllProviders = () => {
  const providersToRemove = allProviders.value
    .filter(p => p.id !== 'default')
    .map(p => p.id);
  
  providersToRemove.forEach(id => {
    unregisterAnnotationProvider(id);
    activeProviders.value.delete(id);
  });
};
</script>


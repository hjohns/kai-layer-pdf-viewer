<template>
  <div>
    <TestPanel 
      heading="PDF 03 Custom Styling with Dropdown" 
      description="HTML overlays with expandable property details"
    >      
      <PDFViewer 
        file="/pdf-tests/pdf-01.pdf" 
        overlays="/pdf-tests/pdf-01-overlay.json"
        ref="pdfViewerRef"
        :htmlAnnotation="createExpandableAnnotation"
      />
    </TestPanel>
  </div>
</template>

<script setup lang="ts">
import type { OverlayAnnotation } from '@/types/annotations';
import type { AnnotationRenderContext } from '@/composables/usePdfAnnotations';

const createExpandableAnnotation = (context: AnnotationRenderContext, annotation: OverlayAnnotation) => {
  // Generate a unique ID for this annotation's dropdown
  const uniqueId = `annotation-${annotation.page}-${annotation.line}-${Date.now()}`;
  
  // Collect all available properties
  const properties = [
    { label: 'Content', value: annotation.content },
    { label: 'Page', value: annotation.page },
    { label: 'Line', value: annotation.line.toString() },
    { label: 'Type', value: annotation.type || 'standard' },
    { label: 'Rect', value: `[${annotation.rect.join(', ')}]` }
  ];
  
  // Add metadata if available
  if (annotation.metadata) {
    Object.entries(annotation.metadata).forEach(([key, value]) => {
      properties.push({ label: `Meta: ${key}`, value: String(value) });
    });
  }
  
  // Add JSON-LD properties if available (using any type for JSON-LD properties)
  const annotationAny = annotation as any;
  if (annotationAny['@context']) properties.push({ label: '@context', value: String(annotationAny['@context']) });
  if (annotationAny['@type']) properties.push({ label: '@type', value: annotationAny['@type'] });
  if (annotationAny['@id']) properties.push({ label: '@id', value: annotationAny['@id'] });
  
  // Ensure the toggle function exists globally
  if (!(window as any).toggleDropdown) {
    (window as any).toggleDropdown = function(id: string) {
      const dropdown = document.getElementById(id);
      const btn = dropdown?.parentElement?.querySelector('.expand-btn');
      
      if (dropdown?.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        if (btn) btn.textContent = '▲';
      } else {
        dropdown?.classList.add('hidden');
        if (btn) btn.textContent = '▼';
      }
    };
  }

  return `
    <div class="annotation-overlay bg-white/95 border border-blue-400 rounded shadow-lg" style="min-width: 120px;">
      <!-- Main content -->
      <div class="flex items-center justify-between p-2">
        <span class="text-blue-800 font-semibold text-sm">${annotation.content}</span>
        <button 
          class="expand-btn ml-2 text-blue-600 hover:text-blue-800 transition-colors" 
          onclick="toggleDropdown('${uniqueId}')"
          style="background: none; border: none; cursor: pointer; font-size: 12px;"
        >
          ▼
        </button>
      </div>
      
      <!-- Expandable details -->
      <div id="${uniqueId}" class="dropdown-content hidden border-t border-blue-200 bg-blue-50/90 p-2" style="max-height: 200px; overflow-y: auto;">
        <div class="text-xs space-y-1">
          ${properties.map(prop => `
            <div class="flex justify-between">
              <span class="text-gray-600 font-medium">${prop.label}:</span>
              <span class="text-gray-800 ml-2 break-all">${prop.value}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
};

</script>

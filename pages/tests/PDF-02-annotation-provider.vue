<template>
  <div class="annotation-provider-test">
    <h1>PDF Annotation Provider Test</h1>
    
    <div class="test-controls">
      <h2>Provider Management</h2>
      
      <div class="provider-list">
        <div 
          v-for="provider in allProviders" 
          :key="provider.id"
          class="provider-item"
          :class="{ active: activeProviders.has(provider.id) }"
        >
          <label>
            <input 
              type="checkbox" 
              :checked="activeProviders.has(provider.id)"
              @change="toggleProvider(provider.id)"
              :disabled="provider.id === 'default'"
            />
            <div class="provider-info">
              <strong>{{ provider.name }}</strong>
              <span class="description">{{ provider.description }}</span>
              <span class="priority">Priority: {{ provider.priority || 0 }}</span>
            </div>
          </label>
        </div>
      </div>
      
      <div class="action-buttons">
        <button @click="registerTestProviders" class="btn btn-primary">
          Register Test Providers
        </button>
        
        <button @click="registerCustomProvider" class="btn btn-secondary">
          Register Custom Provider
        </button>
        
        <button @click="clearAllProviders" class="btn btn-danger">
          Clear All Custom Providers
        </button>
      </div>
    </div>
    
    <div class="pdf-container">
      <PDFViewer 
        :file="pdfFile" 
        :documentId="documentId"
        ref="pdfViewerRef"
      />
    </div>
    
    <div class="test-info">
      <h3>Test Instructions</h3>
      <ul>
        <li><strong>Highlight Provider:</strong> Hover over annotations containing "IMPORTANT", "CRITICAL", "WARNING", or "NOTE"</li>
        <li><strong>Date Provider:</strong> Hover over annotations with date format (MM/DD/YYYY, etc.)</li>
        <li><strong>Icon Provider:</strong> Hover over small annotations (≤3 characters) with symbols</li>
        <li><strong>Custom Provider:</strong> Hover over annotations containing "CUSTOM"</li>
        <li>Toggle providers on/off to see different rendering behaviors</li>
        <li>Check browser console for provider selection logs</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import PDFViewer from '@/components/PDFViewer.vue';
import { usePdfAnnotations } from '@/composables/usePdfAnnotations';
import type { AnnotationProvider, AnnotationRenderContext, DocAnnotation } from '@/composables/usePdfAnnotations';

// PDF file configuration
const pdfFile = ref('/pdf-tests/pdf-01.pdf');
const documentId = ref('/pdf-tests/pdf-01-overlay.json');

// Get annotation management functions
const {
  registerAnnotationProvider,
  unregisterAnnotationProvider,
  getAllProviders,
  findProviderForAnnotation
} = usePdfAnnotations();

// State
const allProviders = ref<AnnotationProvider[]>([]);
const activeProviders = ref(new Set<string>(['default']));

// Load providers on mount
onMounted(() => {
  registerTestProviders();
  updateProviderList();
});

// Update the list of all providers
const updateProviderList = () => {
  allProviders.value = getAllProviders();
};

// Toggle a provider on/off
const toggleProvider = (providerId: string) => {
  if (providerId === 'default') return; // Can't disable default
  
  if (activeProviders.value.has(providerId)) {
    unregisterAnnotationProvider(providerId);
    activeProviders.value.delete(providerId);
  } else {
    // Re-register the provider
    const provider = allProviders.value.find(p => p.id === providerId);
    if (provider) {
      registerAnnotationProvider(provider);
      activeProviders.value.add(providerId);
    }
  }
  updateProviderList();
};

// Register test providers
const registerTestProviders = () => {
  // Clear existing custom providers first
  clearAllProviders();
  
  // Highlight Provider - for important annotations
  registerAnnotationProvider({
    id: 'highlight',
    name: 'Highlight Provider',
    description: 'Highlights important annotations with special styling',
    priority: 10,
    
    canHandle: (annotation: DocAnnotation) => {
      const importantKeywords = ['IMPORTANT', 'CRITICAL', 'WARNING', 'NOTE'];
      return importantKeywords.some(keyword => 
        annotation.content?.toUpperCase().includes(keyword)
      );
    },
    
    render: (context: AnnotationRenderContext) => {
      const { ctx, annotation, rect } = context;
      const { minX, maxX, minY, maxY, width, height } = rect;
      
      ctx.save();
      
      // Draw a bright yellow background
      ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
      ctx.fillRect(minX, minY, width, height);
      
      // Draw a thick orange border
      ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
      ctx.lineWidth = 3;
      ctx.strokeRect(minX, minY, width, height);
      
      // Draw text with special styling
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.fillStyle = 'rgba(255, 0, 0, 1)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Add a white background for text
      const textWidth = ctx.measureText(annotation.content).width;
      const textHeight = 16;
      const padding = 4;
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(
        minX + (width - textWidth) / 2 - padding,
        minY + (height - textHeight) / 2 - padding,
        textWidth + padding * 2,
        textHeight + padding * 2
      );
      
      // Draw the text
      ctx.fillStyle = 'rgba(255, 0, 0, 1)';
      ctx.fillText(
        annotation.content,
        minX + width / 2,
        minY + height / 2
      );
      
      ctx.restore();
    }
  });

  // Date Provider - for date annotations
  registerAnnotationProvider({
    id: 'date',
    name: 'Date Provider',
    description: 'Special formatting for date annotations',
    priority: 5,
    
    canHandle: (annotation: DocAnnotation) => {
      const datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;
      return datePattern.test(annotation.content || '');
    },
    
    render: (context: AnnotationRenderContext) => {
      const { ctx, annotation, rect } = context;
      const { minX, maxX, minY, maxY, width, height } = rect;
      
      ctx.save();
      
      // Draw a blue background
      ctx.fillStyle = 'rgba(0, 100, 255, 0.2)';
      ctx.fillRect(minX, minY, width, height);
      
      // Draw a blue border
      ctx.strokeStyle = 'rgba(0, 100, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(minX, minY, width, height);
      
      // Draw calendar icon (simple representation)
      const iconSize = Math.min(width, height) * 0.6;
      const iconX = minX + width / 2 - iconSize / 2;
      const iconY = minY + height / 2 - iconSize / 2;
      
      ctx.fillStyle = 'rgba(0, 100, 255, 0.8)';
      ctx.fillRect(iconX, iconY, iconSize, iconSize * 0.7);
      
      // Draw date text
      ctx.font = 'bold 10px Arial, sans-serif';
      ctx.fillStyle = 'rgba(0, 100, 255, 1)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.fillText(
        annotation.content,
        minX + width / 2,
        minY + height / 2
      );
      
      ctx.restore();
    }
  });

  // Icon Provider - for small annotations with icons
  registerAnnotationProvider({
    id: 'icon',
    name: 'Icon Provider',
    description: 'Renders small annotations as icons',
    priority: 8,
    
    canHandle: (annotation: DocAnnotation) => {
      return (annotation.content?.length || 0) <= 3 && 
             (annotation.content?.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/) !== null);
    },
    
    render: (context: AnnotationRenderContext) => {
      const { ctx, annotation, rect } = context;
      const { minX, maxX, minY, maxY, width, height } = rect;
      
      ctx.save();
      
      // Draw a circular background
      const centerX = minX + width / 2;
      const centerY = minY + height / 2;
      const radius = Math.min(width, height) / 2 - 2;
      
      ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw border
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw the icon/symbol
      ctx.font = `${Math.min(width, height) * 0.6}px Arial, sans-serif`;
      ctx.fillStyle = 'rgba(100, 100, 100, 1)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.fillText(annotation.content, centerX, centerY);
      
      ctx.restore();
    }
  });

  // Update active providers
  activeProviders.value.add('highlight');
  activeProviders.value.add('date');
  activeProviders.value.add('icon');
  
  updateProviderList();
};

// Register a custom provider example
const registerCustomProvider = () => {
  const customProvider: AnnotationProvider = {
    id: 'custom-example',
    name: 'Custom Example Provider',
    description: 'Example of a custom annotation provider with special effects',
    priority: 15,
    
    canHandle: (annotation: DocAnnotation) => {
      return annotation.content?.toUpperCase().includes('CUSTOM') || false;
    },
    
    render: (context: AnnotationRenderContext) => {
      const { ctx, annotation, rect } = context;
      const { minX, maxX, minY, maxY, width, height } = rect;
      
      ctx.save();
      
      // Draw a gradient background
      const gradient = ctx.createLinearGradient(minX, minY, maxX, maxY);
      gradient.addColorStop(0, 'rgba(255, 0, 255, 0.3)');
      gradient.addColorStop(1, 'rgba(0, 255, 255, 0.3)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(minX, minY, width, height);
      
      // Draw a rainbow border
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
      ctx.lineWidth = 3;
      ctx.strokeRect(minX, minY, width, height);
      
      // Draw custom text with special effects
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillStyle = 'rgba(255, 0, 255, 1)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Add text shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      ctx.fillText(
        `✨ ${annotation.content} ✨`,
        minX + width / 2,
        minY + height / 2
      );
      
      ctx.restore();
    }
  };
  
  registerAnnotationProvider(customProvider);
  activeProviders.value.add(customProvider.id);
  updateProviderList();
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
  
  updateProviderList();
};
</script>

<style scoped>
.annotation-provider-test {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
  font-family: Arial, sans-serif;
}

.annotation-provider-test h1 {
  color: #333;
  margin-bottom: 30px;
  text-align: center;
}

.test-controls {
  background: #f8f9fa;
  padding: 25px;
  border-radius: 10px;
  margin-bottom: 25px;
  border: 1px solid #e9ecef;
}

.test-controls h2 {
  color: #495057;
  margin-bottom: 20px;
  font-size: 1.5em;
}

.provider-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 15px;
  margin-bottom: 25px;
}

.provider-item {
  background: white;
  padding: 20px;
  border-radius: 8px;
  border: 2px solid #e0e0e0;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.provider-item.active {
  border-color: #28a745;
  background: #f8fff8;
  box-shadow: 0 4px 8px rgba(40, 167, 69, 0.2);
}

.provider-item label {
  display: block;
  cursor: pointer;
}

.provider-info {
  margin-left: 25px;
}

.provider-info strong {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-size: 1.1em;
}

.description {
  display: block;
  font-size: 0.9em;
  color: #666;
  margin-bottom: 5px;
  line-height: 1.4;
}

.priority {
  display: block;
  font-size: 0.8em;
  color: #888;
  font-style: italic;
}

.action-buttons {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  margin-top: 20px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover {
  background: #0056b3;
  transform: translateY(-1px);
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #545b62;
  transform: translateY(-1px);
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-danger:hover {
  background: #c82333;
  transform: translateY(-1px);
}

.pdf-container {
  border: 2px solid #dee2e6;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 25px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.test-info {
  background: #e7f3ff;
  padding: 20px;
  border-radius: 8px;
  border-left: 4px solid #007bff;
}

.test-info h3 {
  color: #0056b3;
  margin-bottom: 15px;
  font-size: 1.2em;
}

.test-info ul {
  margin: 0;
  padding-left: 20px;
}

.test-info li {
  margin-bottom: 8px;
  line-height: 1.5;
  color: #495057;
}

.test-info strong {
  color: #0056b3;
}

/* Responsive design */
@media (max-width: 768px) {
  .annotation-provider-test {
    padding: 15px;
  }
  
  .provider-list {
    grid-template-columns: 1fr;
  }
  
  .action-buttons {
    flex-direction: column;
  }
  
  .btn {
    width: 100%;
  }
}
</style>

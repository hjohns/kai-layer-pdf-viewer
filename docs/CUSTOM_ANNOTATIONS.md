# Custom Annotation System

The PDF Viewer supports a flexible custom annotation system that allows you to create your own annotation rendering logic. This system uses a provider-based architecture where you can register custom annotation providers to handle specific types of annotations.

## Overview

The custom annotation system consists of:

- **Annotation Providers**: Custom functions that define how to render specific types of annotations
- **Provider Management**: Functions to register, unregister, and manage providers
- **Fallback System**: Automatic fallback to the default provider if custom providers fail
- **Priority System**: Providers can have priorities to determine which one handles an annotation

## Basic Usage

### 1. Import the Composable

```typescript
import { usePdfAnnotations } from '@/composables/usePdfAnnotations';
import type { AnnotationProvider, AnnotationRenderContext } from '@/composables/usePdfAnnotations';

const { registerAnnotationProvider, unregisterAnnotationProvider } = usePdfAnnotations();
```

### 2. Create a Custom Provider

```typescript
const myCustomProvider: AnnotationProvider = {
  id: 'my-custom-provider',
  name: 'My Custom Provider',
  description: 'Handles special annotations with custom styling',
  priority: 10, // Higher numbers = higher priority
  
  canHandle: (annotation) => {
    // Return true if this provider should handle this annotation
    return annotation.content?.includes('SPECIAL') || false;
  },
  
  render: (context) => {
    const { ctx, annotation, rect } = context;
    const { minX, maxX, minY, maxY, width, height } = rect;
    
    // Your custom rendering logic here
    ctx.save();
    
    // Example: Draw a custom background
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.fillRect(minX, minY, width, height);
    
    // Example: Draw custom text
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillStyle = 'red';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(annotation.content, minX + width / 2, minY + height / 2);
    
    ctx.restore();
  }
};
```

### 3. Register the Provider

```typescript
registerAnnotationProvider(myCustomProvider);
```

## API Reference

### AnnotationRenderContext

The context object passed to your render function contains:

```typescript
interface AnnotationRenderContext {
  ctx: CanvasRenderingContext2D;        // Canvas 2D context for drawing
  annotation: DocAnnotation;            // The annotation data
  effectiveDpi: number;                 // Effective DPI for coordinate conversion
  pageNumber: number;                   // Current page number
  rect: {                              // Rectangle bounds in canvas coordinates
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };
}
```

### AnnotationProvider Interface

```typescript
interface AnnotationProvider {
  id: string;                          // Unique identifier
  name: string;                        // Human-readable name
  description?: string;                // Optional description
  canHandle: (annotation: DocAnnotation) => boolean;  // Determines if this provider handles the annotation
  render: (context: AnnotationRenderContext) => void; // Renders the annotation
  priority?: number;                   // Priority (higher = more important)
}
```

### Provider Management Functions

```typescript
// Register a new provider
registerAnnotationProvider(options: AnnotationProviderOptions): void

// Unregister a provider
unregisterAnnotationProvider(id: string): void

// Get a specific provider
getAnnotationProvider(id: string): AnnotationProvider | undefined

// Get all registered providers
getAllProviders(): AnnotationProvider[]

// Find the best provider for an annotation
findProviderForAnnotation(annotation: DocAnnotation): AnnotationProvider
```

## Examples

### Example 1: Highlight Important Annotations

```typescript
const highlightProvider = {
  id: 'highlight',
  name: 'Highlight Provider',
  priority: 10,
  
  canHandle: (annotation) => {
    return annotation.content?.toUpperCase().includes('IMPORTANT') || false;
  },
  
  render: (context) => {
    const { ctx, rect } = context;
    const { minX, minY, width, height } = rect;
    
    ctx.save();
    
    // Yellow highlight background
    ctx.fillStyle = 'rgba(255, 255, 0, 0.4)';
    ctx.fillRect(minX, minY, width, height);
    
    // Orange border
    ctx.strokeStyle = 'orange';
    ctx.lineWidth = 2;
    ctx.strokeRect(minX, minY, width, height);
    
    ctx.restore();
  }
};
```

### Example 2: Date Annotations with Icons

```typescript
const dateProvider = {
  id: 'date',
  name: 'Date Provider',
  priority: 5,
  
  canHandle: (annotation) => {
    const datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;
    return datePattern.test(annotation.content || '');
  },
  
  render: (context) => {
    const { ctx, annotation, rect } = context;
    const { minX, minY, width, height } = rect;
    
    ctx.save();
    
    // Draw calendar icon
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;
    const iconSize = Math.min(width, height) * 0.8;
    
    ctx.fillStyle = 'rgba(0, 100, 255, 0.2)';
    ctx.fillRect(centerX - iconSize/2, centerY - iconSize/2, iconSize, iconSize);
    
    // Draw date text
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.fillStyle = 'blue';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(annotation.content, centerX, centerY);
    
    ctx.restore();
  }
};
```

### Example 3: Small Icon Annotations

```typescript
const iconProvider = {
  id: 'icon',
  name: 'Icon Provider',
  priority: 8,
  
  canHandle: (annotation) => {
    return (annotation.content?.length || 0) <= 2;
  },
  
  render: (context) => {
    const { ctx, annotation, rect } = context;
    const { minX, minY, width, height } = rect;
    
    ctx.save();
    
    // Draw circular background
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;
    const radius = Math.min(width, height) / 2 - 2;
    
    ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw icon
    ctx.font = `${radius}px Arial, sans-serif`;
    ctx.fillStyle = 'gray';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(annotation.content, centerX, centerY);
    
    ctx.restore();
  }
};
```

## Best Practices

### 1. Error Handling

Always wrap your rendering logic in try-catch blocks:

```typescript
render: (context) => {
  try {
    // Your rendering logic
  } catch (error) {
    console.error('Error in custom provider:', error);
    // The system will automatically fall back to the default provider
  }
}
```

### 2. Performance

- Keep your `canHandle` functions fast - they're called for every annotation
- Avoid heavy computations in the render function
- Use `ctx.save()` and `ctx.restore()` to preserve canvas state

### 3. Coordinate System

- All coordinates in the context are in canvas pixel coordinates
- The `rect` object provides the annotation bounds
- Use `ctx.textAlign` and `ctx.textBaseline` for proper text positioning

### 4. Provider Priority

- Higher priority numbers = higher priority
- The first provider that returns `true` for `canHandle` will be used
- Default provider has priority 0

## Integration with PDFViewer Component

The custom annotation system is automatically integrated with the PDFViewer component. When you register providers, they will be used immediately for all hover effects and annotation rendering.

### Test Page

A comprehensive test page is available at `/tests/PDF-02-annotation-provider.vue` that demonstrates:

- Multiple example providers (Highlight, Date, Icon, Custom)
- Provider management (register/unregister)
- Real-time provider toggling
- Visual feedback for active providers
- Test instructions for each provider type

### Basic Integration

```vue
<template>
  <PDFViewer :file="pdfFile" :documentId="documentId" />
</template>

<script setup>
import { onMounted } from 'vue';
import { usePdfAnnotations } from '@/composables/usePdfAnnotations';

const { registerAnnotationProvider } = usePdfAnnotations();

onMounted(() => {
  // Register your custom providers
  registerAnnotationProvider(myCustomProvider);
});
</script>
```

## Debugging

The system includes built-in logging to help debug provider issues:

- Provider registration/unregistration is logged
- Provider selection for annotations is logged
- Errors in custom providers are logged with fallback information

Check the browser console for debugging information.

## Migration from Default System

The custom annotation system is fully backward compatible. If you don't register any custom providers, the system will use the default text rendering provider for all annotations.

To migrate existing code:

1. Keep your existing annotation data unchanged
2. Register custom providers as needed
3. The system will automatically use the appropriate provider for each annotation

# Consumer Guide: Implementing PDF-20 Features

This guide explains how apps consuming `kai-layer-pdf-viewer` as a Nuxt layer can implement the advanced features demonstrated in PDF-20 (Enhanced Controls Test).

## Overview

PDF-20 demonstrates two key features:
1. **Horizontal/Vertical Line Intersections** - Interactive guide lines that detect and display overlapping annotations
2. **Coloured Confidence Annotations** - Visual representation of confidence scores using color-coded overlays with word-level granularity

## Feature 1: Horizontal/Vertical Line Intersections

### What It Does
- Displays a vertical or horizontal guide line that follows the mouse cursor
- Detects annotations that intersect with the guide line
- Shows tooltips for intersected annotations
- Emits intersection events for custom handling

### Implementation

#### Basic Setup

```vue
<script setup lang="ts">
import type { MouseLineIntersectionContext } from '@/composables/useMouseGuide';
import type { OverlayAnnotation } from '@/types/annotations';

const intersectingOverlays = ref<OverlayAnnotation[]>([]);

const handleMouseLineIntersections = (context: MouseLineIntersectionContext) => {
  intersectingOverlays.value = context.overlays;
  
  // Access intersection data:
  // - context.x, context.y: Mouse coordinates
  // - context.pageNumber: Current page
  // - context.overlays: Array of intersecting annotations
  // - context.orientation: 'vertical' or 'horizontal'
};
</script>

<template>
  <PDFViewer
    file="/path/to/document.pdf"
    :annotation-fetcher="fetchAnnotations"
    :mouse-line="{
      enabled: true,
      color: 'rgba(249, 115, 22, 0.8)',
      width: 2,
      orientation: 'vertical',
      tooltips: true
    }"
    @mouse-line-intersections="handleMouseLineIntersections"
  />
</template>
```

#### Advanced: Toggle Between Modes

For a more sophisticated UI, use the `useMouseLineMode` composable:

```vue
<script setup lang="ts">
import { useMouseLineMode } from '@/composables/useMouseLineMode';
import type { MouseLineIntersectionContext } from '@/composables/useMouseGuide';

const { lineMode, mouseLineConfig, toggleLineMode, shouldProcessIntersections } = useMouseLineMode();

const handleMouseLineIntersections = (context: MouseLineIntersectionContext) => {
  // Only process if the orientation matches the current mode
  if (!shouldProcessIntersections(context.orientation)) {
    return;
  }
  
  // Your custom logic here
  console.log(`${lineMode.value} line intersects ${context.overlays.length} annotations`);
};
</script>

<template>
  <div>
    <!-- Toggle button cycles through: vertical → horizontal → none -->
    <Button @click="toggleLineMode">
      {{ lineMode === 'vertical' ? '│ Vertical' : 
         lineMode === 'horizontal' ? '── Horizontal' : 
         '✕ No Line' }}
    </Button>
    
    <PDFViewer
      file="/path/to/document.pdf"
      :mouse-line="mouseLineConfig"
      @mouse-line-intersections="handleMouseLineIntersections"
    />
  </div>
</template>
```

### Configuration Options

The `:mouse-line` prop accepts the following options:

```typescript
interface MouseLinePropConfig {
  enabled?: boolean;              // Enable/disable the guide line
  color?: string;                 // Line color (CSS color value)
  width?: number;                 // Line width in pixels
  orientation?: 'vertical' | 'horizontal';  // Line direction
  tooltips?: boolean | {          // Tooltip configuration
    enabled?: boolean;
    offset?: number;              // Pixels from annotation edge
    verticalGap?: number;         // Spacing between stacked tooltips
    estimatedHeight?: number;     // For collision detection
  };
}
```

### What You Get From PDF-20

PDF-20 provides:
- ✅ Full implementation examples for both modes
- ✅ `useMouseLineMode` composable for easy mode switching
- ✅ Intersection detection logic
- ✅ Tooltip rendering system
- ✅ Event emission for custom handling

### What Consumers Need to Know

1. **Data Format**: Annotations must have `rect` property (array of coordinates defining the polygon)
2. **Performance**: Intersection checks are optimized using RAF throttling
3. **Tooltips**: Automatically positioned to avoid overlaps; styled with semantic metadata if available
4. **Orientation**: Only one orientation active at a time (vertical or horizontal)

---

## Feature 2: Coloured Confidence Annotations

### What It Does
- Visualizes confidence scores using color gradients (red = low, yellow = medium, green = high)
- Supports both cell-level and word-level confidence visualization
- Displays confidence values in tooltips
- Automatically styles annotation borders and fills based on confidence

### Implementation

#### Basic Cell-Level Confidence

This is **automatically enabled** when your annotations include `confidence` in `semanticProperties`:

```vue
<script setup lang="ts">
const fetchAnnotations = async (pageNumber) => {
  // Return annotations with confidence values
  return {
    overlay: [
      {
        page: "1",
        line: 0,
        content: "Sample Text",
        rect: [100, 100, 200, 100, 200, 150, 100, 150],
        '@id': 'annotation-1',
        '@type': 'Cell',
        semanticProperties: {
          confidence: 0.95,  // Value between 0 and 1
          rowIndex: 0,
          columnIndex: 0
        }
      }
    ]
  };
};
</script>

<template>
  <PDFViewer
    file="/path/to/document.pdf"
    :annotation-fetcher="fetchAnnotations"
  />
</template>
```

**No additional code needed** - the PDF viewer automatically:
- Parses the `confidence` value
- Calculates appropriate colors (0.0 = red, 0.5 = yellow, 1.0 = green)
- Applies colors to annotation borders and fills
- Shows confidence in hover tooltips

#### Advanced: Word-Level Confidence

For fine-grained confidence visualization at the word level, include `confidenceSpans`:

```vue
<script setup lang="ts">
const fetchAnnotations = async (pageNumber) => {
  return {
    overlay: [
      {
        page: "1",
        line: 0,
        content: "Hello World",
        rect: [100, 100, 200, 100, 200, 150, 100, 150],
        '@id': 'annotation-1',
        '@type': 'Cell',
        semanticProperties: {
          confidence: 0.85,  // Overall confidence
          confidenceSpans: [  // Word-level breakdown
            {
              offset: 0,
              length: 5,
              confidence: 0.95,
              text: "Hello"
            },
            {
              offset: 6,
              length: 5,
              confidence: 0.75,
              text: "World"
            }
          ],
          rowIndex: 0,
          columnIndex: 0
        }
      }
    ]
  };
};
</script>

<template>
  <PDFViewer
    file="/path/to/document.pdf"
    :annotation-fetcher="fetchAnnotations"
  />
</template>
```

When hovering over an annotation with `confidenceSpans`, the viewer automatically displays a detailed overlay showing each word/span colored by its individual confidence score.

### Confidence Color Mapping

The library uses an optimized color algorithm:

```typescript
// Simplified algorithm (actual is more sophisticated)
confidence = 0.0  →  Red (low confidence)
confidence = 0.5  →  Yellow (medium confidence)  
confidence = 1.0  →  Green (high confidence)

// Colors are calculated using HSL:
// - Hue: 0 (red) to 120 (green) based on confidence
// - Saturation: 90% (vibrant colors)
// - Lightness: Adjusted for visibility
// - Alpha: Increases with confidence for emphasis
```

### What You Get From PDF-20

PDF-20 provides:
- ✅ `useAnnotationStyling` composable for color calculations
- ✅ `useWordConfidenceVisualization` for word-level display
- ✅ Automatic confidence parsing from `semanticProperties`
- ✅ Optimized color gradients using power curves
- ✅ Hover effects that reveal word-level details

### What Consumers Need to Know

1. **Data Format Requirements**:
   ```typescript
   semanticProperties: {
     confidence: number,        // Required: 0.0 to 1.0
     confidenceSpans?: [        // Optional: word-level details
       {
         offset: number,        // Character offset in content
         length: number,        // Length of span
         confidence: number,    // Confidence for this span (0.0 to 1.0)
         text?: string         // Optional: explicit text (defaults to substring)
       }
     ]
   }
   ```

2. **Confidence Range**: Values must be between 0.0 and 1.0 (will be clamped)

3. **Automatic Styling**: No additional code needed - just provide the data

4. **Word-Level Visualization**: 
   - Triggered on hover when `confidenceSpans` is present
   - Displays colored spans with tooltips
   - Handles text wrapping automatically

---

## Complete Example: PDF-20 Style Implementation

Here's a minimal example combining both features:

```vue
<script setup lang="ts">
import { useMouseLineMode } from '@/composables/useMouseLineMode';
import type { MouseLineIntersectionContext } from '@/composables/useMouseGuide';
import type { AnnotationFetcher } from '@/composables/usePdf';

const { lineMode, mouseLineConfig, toggleLineMode } = useMouseLineMode();

const fetchAnnotations: AnnotationFetcher = async (pageNumber) => {
  // Fetch from your SPARQL endpoint, REST API, etc.
  const response = await fetch(`/api/annotations?page=${pageNumber}`);
  const data = await response.json();
  
  return data; // Can return JSON-LD, { overlay: [...] }, or annotation array
};

const handleMouseLineIntersections = (context: MouseLineIntersectionContext) => {
  console.log(`${context.overlays.length} annotations at line`);
  
  // Access annotation data including confidence
  context.overlays.forEach(overlay => {
    console.log(overlay.content, 'confidence:', overlay.semanticProperties?.confidence);
  });
};

const handleOverlayClick = (overlay, context) => {
  console.log('Clicked annotation:', overlay.content);
  console.log('Confidence:', overlay.semanticProperties?.confidence);
  console.log('Position:', overlay.semanticProperties?.rowIndex, overlay.semanticProperties?.columnIndex);
};
</script>

<template>
  <div>
    <!-- Controls -->
    <Button @click="toggleLineMode">
      {{ lineMode === 'vertical' ? '│ Vertical' : 
         lineMode === 'horizontal' ? '── Horizontal' : 
         '✕ No Line' }}
    </Button>
    
    <!-- PDF Viewer with both features enabled -->
    <PDFViewer
      file="/documents/sample.pdf"
      :annotation-fetcher="fetchAnnotations"
      :mouse-line="mouseLineConfig"
      @mouse-line-intersections="handleMouseLineIntersections"
      @overlay-click="handleOverlayClick"
    />
  </div>
</template>
```

---

## Additional Information for Consumers

### Dependencies

Both features are built into `kai-layer-pdf-viewer` - no additional dependencies needed when consuming as a Nuxt layer.

### TypeScript Support

Full TypeScript definitions are provided:
- `OverlayAnnotation` - Annotation data structure
- `MouseLineIntersectionContext` - Intersection event data
- `MouseLinePropConfig` - Configuration options
- `AnnotationFetcher` - Function signature for fetching annotations

### Performance Considerations

1. **Line Intersections**: 
   - Uses requestAnimationFrame for throttling
   - Implements dirty region tracking for efficient redraws
   - Optimized for 60fps even with hundreds of annotations

2. **Confidence Visualization**:
   - Colors calculated once and cached
   - Word-level overlays only rendered on hover
   - Uses hardware-accelerated CSS transforms

### Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires Canvas API and Web Workers
- Tested on desktop and tablet devices

### Troubleshooting

**Line intersections not working?**
- Ensure annotations have valid `rect` arrays (polygon coordinates)
- Check that `@mouse-line-intersections` event is properly bound
- Verify orientation matches your mode ('vertical' or 'horizontal')

**Confidence colors not showing?**
- Ensure `semanticProperties.confidence` is a number between 0 and 1
- Check browser console for parsing errors
- Verify annotation data structure matches the format above

**Word-level confidence not appearing?**
- Requires `confidenceSpans` array in `semanticProperties`
- Each span must have valid `offset`, `length`, and `confidence`
- Hover over the annotation to trigger the detailed view

### Reference Implementation

See `pages/tests/PDF-20-enhanced-controls.vue` in this repository for a complete working example that demonstrates:
- Dynamic annotation loading from SPARQL
- Line mode toggling
- Cell editing with revision tracking
- Full confidence visualization
- Intersection handling

---

## Summary

**For Line Intersections:**
1. Pass `:mouse-line` config to `<PDFViewer>`
2. Handle `@mouse-line-intersections` events
3. Use `useMouseLineMode()` for advanced toggle UI

**For Confidence Annotations:**
1. Include `confidence` (0.0-1.0) in `semanticProperties`
2. Optionally add `confidenceSpans` for word-level detail
3. Colors and styling are automatic

Both features work together seamlessly and require minimal code - the heavy lifting is done by the layer!

# Plan: Extend PDF Viewer to Support JSONLD Annotations

## Understanding of Current System:
- PDF viewer uses `OverlayAnnotation` interface from `types/annotations.ts`
- Annotations loaded via `loadAnnotations()` in `composables/usePdfAnnotations.ts`
- Current format expects `{overlay: [...]}` JSON structure with `page`, `content`, `rect`, `line` properties
- `PDFViewer.vue` component accepts `overlays` prop (path to annotation file)
- Click handlers emit overlay click events with annotation data including IRIs when available

## New JSONLD Format Analysis:
- Your JSONLD file contains table cell annotations with `@id`, `@type`, semantic properties
- Each cell has: `@id` (IRI), `doc:content`, `geom:hasGeometry` (coordinates), `doc:row`/`doc:column`, etc.
- Geometry format: "x1,y1 x2,y2 x3,y3 x4,y4" (4 corner coordinates)
- No explicit page numbers - will need to infer or add

## Implementation Plan:

### 1. **Extend Type System** (`types/annotations.ts`)
   - Add optional JSONLD properties to `OverlayAnnotation` interface
   - Include `@id`, `@type`, and semantic metadata fields
   - Maintain backward compatibility

### 2. **Enhance Annotation Loading** (`composables/usePdfAnnotations.ts`)
   - Detect JSONLD format (presence of `@graph` or `@context`)
   - Transform JSONLD table cells to `OverlayAnnotation` format
   - Map `geom:hasGeometry` coordinates to `rect` format
   - Extract `doc:content` as annotation content
   - Preserve `@id` IRIs for click event emission
   - Set page number (default to "1" or make configurable)
   - Generate line numbers for compatibility

### 3. **Create Test Page** (`pages/tests/PDF-09-jsonld-table.vue`)
   - New test component demonstrating JSONLD annotation loading
   - Use table PDF file that corresponds to the JSONLD overlay
   - Handle click events to show IRI information
   - Display semantic metadata (row, column, confidence, etc.)

### 4. **JSONLD Processing Logic**
   - Parse `@graph` array to extract table cells
   - Convert coordinate format: "x1,y1 x2,y2 x3,y3 x4,y4" → `[x1,y1,x2,y2,x3,y3,x4,y4]`
   - Map semantic properties (`doc:row`, `doc:column`, `doc:confidence`) to metadata
   - Ensure click events include IRI (`@id`) so UI knows which cell was clicked

### 5. **Backward Compatibility**
   - Keep existing JSON format working unchanged
   - Auto-detect format based on file structure
   - No breaking changes to existing components or interfaces

## Key Files to Create/Modify:
- **Modify**: `types/annotations.ts` - extend interface
- **Modify**: `composables/usePdfAnnotations.ts` - add JSONLD parsing
- **Create**: `pages/tests/PDF-09-jsonld-table.vue` - test page
- **Optional**: Add coordinate conversion utilities

## Benefits:
- IRIs available in click events for semantic identification
- Rich metadata preserved (confidence, row/column info, etc.)
- Seamless integration with existing annotation system
- No disruption to current functionality
# JSON-LD Annotation Adapter

## Overview

This document outlines the design and implementation requirements for extending the PDF viewer to support loading annotations from JSON-LD format while maintaining backward compatibility with existing JSON annotation files.

## Current JSON Annotation Format

The system currently loads annotations from simple JSON files with the following structure:

```json
{
  "overlay": [
    {
      "page": "1",
      "line": 0,
      "content": "CHAIN OF CUSTODY RECORD",
      "rect": [1.2296, 0.6163, 3.1505, 0.6129, 3.1508, 0.7734, 1.2299, 0.7767]
    }
  ]
}
```

## Proposed JSON-LD Extension

### Enhanced Annotation Interface

The `OverlayAnnotation` interface will be extended to support semantic metadata:

```typescript
export interface OverlayAnnotation extends BaseAnnotation {
  // Existing properties
  line: number;
  type?: string;
  metadata?: Record<string, any>;
  
  // New JSON-LD properties
  '@context'?: string | Record<string, any>;
  '@type'?: string | string[];
  '@id'?: string;
  semanticProperties?: Record<string, any>;
  linkedData?: {
    subject?: string;
    predicate?: string;
    object?: string;
    graph?: string;
  };
  vocabulary?: {
    namespace?: string;
    term?: string;
    definition?: string;
  };
}
```

### Example JSON-LD Annotation Format

```json
{
  "@context": {
    "@vocab": "http://www.w3.org/ns/oa#",
    "dc": "http://purl.org/dc/terms/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "schema": "http://schema.org/"
  },
  "overlay": [
    {
      "@type": "Annotation",
      "@id": "http://example.org/annotations/1",
      "page": "1",
      "line": 0,
      "content": "CHAIN OF CUSTODY RECORD",
      "rect": [1.2296, 0.6163, 3.1505, 0.6129, 3.1508, 0.7734, 1.2299, 0.7767],
      "type": "document-header",
      "dc:creator": "System Generator",
      "dc:created": "2024-01-15T10:30:00Z",
      "schema:category": "legal-document",
      "semanticProperties": {
        "documentType": "chain-of-custody",
        "importance": "high",
        "legalStatus": "official"
      },
      "linkedData": {
        "subject": "http://example.org/documents/coc-001",
        "predicate": "http://purl.org/dc/terms/title",
        "object": "CHAIN OF CUSTODY RECORD"
      },
      "vocabulary": {
        "namespace": "http://example.org/legal-vocab#",
        "term": "ChainOfCustodyHeader",
        "definition": "The main header identifying a chain of custody document"
      }
    }
  ]
}
```

## Implementation Plan

### 1. Type System Extensions

**Files to modify:**
- `types/annotations.ts` - Extend `OverlayAnnotation` interface
- Add new interfaces for JSON-LD specific structures

### 2. Annotation Loading System

**Files to modify:**
- `composables/usePdfAnnotations.ts` - Extend `loadAnnotations` function
- Add JSON-LD detection and parsing logic
- Maintain backward compatibility with existing JSON format

**New functions needed:**
```typescript
import jsonld from 'jsonld';

// Detect if the loaded data is JSON-LD format
const isJsonLD = (data: any): boolean => {
  return data['@context'] !== undefined || data['@type'] !== undefined;
};

// Transform JSON-LD to internal format using jsonld library
const transformJsonLD = async (jsonLDData: any): Promise<OverlayAnnotation[]> => {
  try {
    // Expand the JSON-LD to get full URIs
    const expanded = await jsonld.expand(jsonLDData);
    
    // Frame the data to get a consistent structure
    const frame = {
      '@context': jsonLDData['@context'],
      '@type': 'Annotation',
      'overlay': {}
    };
    const framed = await jsonld.frame(expanded, frame);
    
    // Extract overlay annotations and map to OverlayAnnotation format
    const overlayData = framed['overlay'] || framed['@graph'] || [];
    return overlayData.map((item: any) => ({
      // Map standard properties
      page: item.page || item['http://example.org/page'] || '1',
      line: item.line || item['http://example.org/line'] || 0,
      content: item.content || item['http://www.w3.org/2000/01/rdf-schema#label'] || '',
      rect: item.rect || item['http://example.org/rect'] || [],
      
      // Preserve JSON-LD properties
      '@context': item['@context'],
      '@type': item['@type'],
      '@id': item['@id'],
      
      // Extract semantic properties
      semanticProperties: extractSemanticProperties(item),
      linkedData: extractLinkedData(item),
      vocabulary: extractVocabulary(item)
    }));
  } catch (error) {
    console.error('Error processing JSON-LD:', error);
    throw new Error('Failed to process JSON-LD annotation data');
  }
};

// Enhanced loadAnnotations with JSON-LD library integration
const loadAnnotations = async (docId: string) => {
  try {
    const response = await fetch(docId);
    const data = await response.json();
    
    if (isJsonLD(data)) {
      pageAnnotations.value = await transformJsonLD(data);
      console.log('Loaded JSON-LD annotations:', pageAnnotations.value.length);
    } else {
      // Existing JSON format
      pageAnnotations.value = data?.overlay || [];
      console.log('Loaded JSON annotations:', pageAnnotations.value.length);
    }
  } catch (error) {
    console.error('Error loading annotations:', error);
    pageAnnotations.value = [];
  }
};
```

### 3. Annotation Provider System Enhancement

**Files to modify:**
- `composables/usePdfAnnotations.ts` - Enhance provider system to use semantic metadata

**Enhanced provider capabilities:**
```typescript
export interface AnnotationProvider {
  id: string;
  name: string;
  description?: string;
  canHandle: (annotation: OverlayAnnotation) => boolean;
  render: (context: AnnotationRenderContext) => void | Promise<void>;
  createOverlay?: (context: AnnotationRenderContext, containerElement: HTMLElement) => HTMLElement | null;
  
  // New JSON-LD capabilities
  handleSemanticData?: (annotation: OverlayAnnotation) => void;
  supportedVocabularies?: string[];
  supportedTypes?: string[];
}
```

### 4. Worker Integration

**Files to modify:**
- `workers/mupdf.worker.ts` - Pass through enhanced annotation data
- `composables/useMuPdf.ts` - Handle extended annotation properties

### 5. Component Integration

**Files to modify:**
- `components/PDFViewer.vue` - No changes needed (interface compatible)
- Test files - Create new test files for JSON-LD examples

### 6. Utility Functions

**New files to create:**
- `utils/jsonld-helpers.ts` - JSON-LD processing helper functions
- `utils/vocabularies.ts` - Common vocabulary definitions and contexts

```typescript
// utils/jsonld-helpers.ts
import jsonld from 'jsonld';

export class JsonLDHelpers {
  /**
   * Extract semantic properties from expanded JSON-LD object
   */
  static extractSemanticProperties(expandedItem: any): Record<string, any> {
    const semanticProps: Record<string, any> = {};
    
    // Extract common semantic properties
    Object.keys(expandedItem).forEach(key => {
      if (key.startsWith('http://') && !key.includes('#page') && !key.includes('#line')) {
        const shortKey = key.split('/').pop() || key.split('#').pop() || key;
        semanticProps[shortKey] = expandedItem[key];
      }
    });
    
    return semanticProps;
  }
  
  /**
   * Extract linked data relationships
   */
  static extractLinkedData(expandedItem: any): any {
    return {
      subject: expandedItem['@id'],
      // Extract predicates and objects from the expanded form
      relations: Object.keys(expandedItem)
        .filter(key => key.startsWith('http://'))
        .map(predicate => ({
          predicate,
          object: expandedItem[predicate]
        }))
    };
  }
  
  /**
   * Extract vocabulary information
   */
  static extractVocabulary(expandedItem: any): any {
    const vocabularies = new Set<string>();
    
    Object.keys(expandedItem).forEach(key => {
      if (key.startsWith('http://')) {
        const baseUri = key.substring(0, key.lastIndexOf('/') + 1);
        vocabularies.add(baseUri);
      }
    });
    
    return {
      namespaces: Array.from(vocabularies),
      terms: Object.keys(expandedItem).filter(key => key.startsWith('http://'))
    };
  }
  
  /**
   * Validate JSON-LD document
   */
  static async validateJsonLD(document: any): Promise<boolean> {
    try {
      await jsonld.expand(document);
      return true;
    } catch (error) {
      console.warn('Invalid JSON-LD document:', error);
      return false;
    }
  }
  
  /**
   * Normalize JSON-LD document to a consistent format
   */
  static async normalizeJsonLD(document: any): Promise<any> {
    try {
      const expanded = await jsonld.expand(document);
      return await jsonld.compact(expanded, document['@context'] || {});
    } catch (error) {
      console.error('Error normalizing JSON-LD:', error);
      throw error;
    }
  }
}

// utils/vocabularies.ts
export const COMMON_VOCABULARIES = {
  OA: 'http://www.w3.org/ns/oa#',
  DC: 'http://purl.org/dc/terms/',
  DCMI: 'http://purl.org/dc/dcmitype/',
  SCHEMA: 'http://schema.org/',
  FOAF: 'http://xmlns.com/foaf/0.1/',
  SKOS: 'http://www.w3.org/2004/02/skos/core#',
  RDFS: 'http://www.w3.org/2000/01/rdf-schema#',
  RDF: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
};

export const ANNOTATION_CONTEXTS = {
  // Web Annotation Ontology context
  WEB_ANNOTATION: {
    '@context': {
      '@vocab': 'http://www.w3.org/ns/oa#',
      'dc': 'http://purl.org/dc/terms/',
      'foaf': 'http://xmlns.com/foaf/0.1/',
      'schema': 'http://schema.org/',
      'page': 'http://example.org/page',
      'line': 'http://example.org/line',
      'rect': 'http://example.org/rect'
    }
  },
  
  // Document-specific context
  DOCUMENT_ANNOTATION: {
    '@context': {
      '@vocab': 'http://example.org/document-vocab#',
      'oa': 'http://www.w3.org/ns/oa#',
      'dc': 'http://purl.org/dc/terms/',
      'page': 'page',
      'line': 'line',
      'content': 'content',
      'rect': 'coordinates'
    }
  }
};
```

## Enhanced Annotation Provider Examples

### Semantic-Aware Provider

```typescript
const semanticProvider: AnnotationProviderOptions = {
  name: 'Semantic Annotation Provider',
  description: 'Handles annotations with semantic metadata',
  supportedVocabularies: ['http://schema.org/', 'http://purl.org/dc/terms/'],
  supportedTypes: ['schema:Person', 'dc:Title'],
  
  canHandle: (annotation: OverlayAnnotation) => {
    return annotation['@type'] !== undefined || 
           annotation.semanticProperties !== undefined;
  },
  
  render: (context: AnnotationRenderContext) => {
    const { annotation } = context;
    
    // Use semantic properties for enhanced rendering
    if (annotation.semanticProperties?.importance === 'high') {
      // Render with high importance styling
    }
    
    if (annotation['@type'] === 'schema:Person') {
      // Render person-specific annotation
    }
  },
  
  handleSemanticData: (annotation: OverlayAnnotation) => {
    // Process linked data relationships
    if (annotation.linkedData) {
      console.log(`Triple: ${annotation.linkedData.subject} ${annotation.linkedData.predicate} ${annotation.linkedData.object}`);
    }
  }
};
```

## Migration Strategy

### Phase 1: Type System Extension
- Extend `OverlayAnnotation` interface
- Add optional JSON-LD properties
- Ensure backward compatibility

### Phase 2: Loading System Enhancement
- Implement format detection
- Add JSON-LD parsing
- Maintain existing JSON support

### Phase 3: Provider System Enhancement
- Extend provider interface
- Add semantic-aware providers
- Create vocabulary utilities

### Phase 4: Testing & Documentation
- Create JSON-LD test files
- Update documentation
- Add usage examples

## Backward Compatibility

The implementation will maintain full backward compatibility:

1. **Existing JSON files** continue to work without changes
2. **Current annotation providers** continue to function normally
3. **Component interfaces** remain unchanged
4. **JSON-LD properties** are optional extensions

## Benefits of JSON-LD Integration

1. **Semantic Richness**: Annotations can carry structured semantic metadata
2. **Interoperability**: Standard JSON-LD format enables data exchange
3. **Linked Data**: Annotations can reference external knowledge graphs
4. **Vocabulary Support**: Use of standard vocabularies (Schema.org, Dublin Core, etc.)
5. **Enhanced Providers**: Annotation providers can leverage semantic information
6. **Future-Proofing**: Foundation for advanced semantic features

## Dependencies

### Required Libraries

**Primary JSON-LD Library:**
```bash
npm install jsonld
npm install --save-dev @types/jsonld
```

**Recommended:** Use the `jsonld` library by Digital Bazaar, which is the reference implementation:
- **Features**: Full JSON-LD 1.1 support, expansion, compaction, framing, normalization
- **Browser Support**: Works in both Node.js and browsers
- **Standards Compliant**: Official W3C JSON-LD specification implementation
- **Well Maintained**: Active development and community support

### Library Integration Benefits

Using the established `jsonld` library provides:

1. **Robust Processing**: Battle-tested JSON-LD algorithms
2. **Standards Compliance**: Full W3C JSON-LD 1.1 specification support
3. **Error Handling**: Comprehensive validation and error reporting
4. **Performance**: Optimized algorithms for JSON-LD operations
5. **Maintenance**: No need to maintain custom JSON-LD processing code
6. **Future-Proofing**: Automatic updates for specification changes

### Installation and Setup

```bash
# Install the JSON-LD library
npm install jsonld

# Install TypeScript definitions
npm install --save-dev @types/jsonld

# Optional: Install additional RDF libraries if needed
npm install rdf-ext  # For advanced RDF operations
npm install sparqljs # For SPARQL query parsing
```

### Bundle Size Considerations

The `jsonld` library is approximately:
- **Minified**: ~85KB
- **Gzipped**: ~25KB

For applications where bundle size is critical, consider:
- **Dynamic imports**: Load JSON-LD processing only when needed
- **Web Workers**: Process JSON-LD in background threads
- **CDN loading**: Load from CDN for better caching

### Alternative Libraries (if needed)

If the main `jsonld` library doesn't fit requirements:

1. **@digitalbazaar/jsonld** - Same library, different package name
2. **jsonld-streaming-parser** - For streaming large JSON-LD documents
3. **rdf-parse** - Lightweight RDF parsing with JSON-LD support

### Optional Enhancements
- `rdf-ext` - Extended RDF operations and data structures
- `sparqljs` - SPARQL query parsing and manipulation
- `@tpluscode/rdf-ns-builders` - Common vocabulary builders
- `rdf-validate-shacl` - SHACL validation for RDF data

## Example Use Cases

1. **Legal Documents**: Annotations with legal vocabulary and case references
2. **Scientific Papers**: Annotations linking to research databases and ontologies
3. **Educational Content**: Annotations with learning objectives and competency mappings
4. **Cultural Heritage**: Annotations with museum and archival metadata standards
5. **Business Documents**: Annotations with enterprise vocabularies and process links

This JSON-LD extension will transform the PDF annotation system from simple overlays to a rich, semantic annotation framework while maintaining the simplicity and performance of the current implementation.

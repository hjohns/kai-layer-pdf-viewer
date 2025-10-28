# Annotation Highlighting Guide

This guide explains how to highlight annotations in the PDF viewer, including using query parameters and custom annotation fetchers.

## Basic Highlighting with `highlightPredicate`

The PDF viewer supports highlighting specific annotations using the `highlightPredicate` prop. This prop accepts a function that determines whether an annotation should be highlighted.

When highlighting by IRI, you typically want to disable confidence-based coloring to make the highlighted annotation stand out more clearly. Use the `disableConfidenceColors` prop for this.

### Example: Highlight by IRI

```vue
<script setup lang="ts">
import type { OverlayAnnotation } from '@/types/annotations';

const route = useRoute();
const highlightIri = computed(() => route.query.highlightIri as string | undefined);

// Predicate to determine if an annotation should be highlighted
const shouldHighlight = (annotation: OverlayAnnotation): boolean => {
  if (!highlightIri.value) return false;
  return annotation['@id'] === highlightIri.value;
};

// Disable confidence colors when highlighting by IRI
const disableConfidenceColors = computed(() => !!highlightIri.value);
</script>

<template>
  <PDFViewer
    file="/path/to/pdf.pdf"
    overlays="/path/to/annotations.jsonld"
    :highlight-predicate="shouldHighlight"
    :disable-confidence-colors="disableConfidenceColors"
  />
</template>
```

## Query Parameter Integration

You can use query parameters to control which annotations are highlighted:

### `?highlightIri=<iri>`

Highlight a specific annotation by its IRI:

```
/viewer?highlightIri=https://example.com/cell/123
```

### Implementation Example

See `pages/tests/PDF-24-highlight-iri.vue` for a complete example.

## Custom Annotation Fetchers with Queries

The `annotationFetcher` prop allows you to dynamically fetch annotations for each page, including support for custom SPARQL queries or API endpoints.

### Basic Usage

```vue
<script setup lang="ts">
import type { AnnotationFetcher } from '@/composables/usePdf';

const fetchAnnotations: AnnotationFetcher = async (pageNumber) => {
  // Fetch annotations for the given page
  const response = await fetch(`/api/annotations?page=${pageNumber}`);
  const data = await response.json();
  return data; // Can return OverlayAnnotation[], JSON-LD, or { overlay: [...] }
};
</script>

<template>
  <PDFViewer
    file="/path/to/pdf.pdf"
    :annotation-fetcher="fetchAnnotations"
  />
</template>
```

### SPARQL Example

```vue
<script setup lang="ts">
import type { AnnotationFetcher } from '@/composables/usePdf';

const SPARQL_ENDPOINT = 'https://your-sparql-endpoint.com/query';

const fetchAnnotations: AnnotationFetcher = async (pageNumber) => {
  const sparqlQuery = `
    PREFIX sdo: <https://schema.org/>
    PREFIX di: <https://document-intelligence/ontology/>

    SELECT * WHERE {
      ?cell a di:Cell ;
            sdo:isPartOf/sdo:isPartOf/di:page ${pageNumber} .
    }
  `;

  const url = `${SPARQL_ENDPOINT}?${new URLSearchParams({ query: sparqlQuery })}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/ld+json' }
  });

  return response.json();
};
</script>

<template>
  <PDFViewer
    file="/path/to/pdf.pdf"
    :annotation-fetcher="fetchAnnotations"
  />
</template>
```

## Using as a Nuxt Layer

When using this library as a Nuxt layer in your application, you have full flexibility to customize queries and highlighting behavior.

### Layer Setup

1. **Add the layer to your `nuxt.config.ts`:**

```typescript
export default defineNuxtConfig({
  extends: [
    'kai-layer-pdf-viewer' // or path to local layer
  ]
})
```

2. **Create a custom page in your app:**

```vue
<!-- pages/pdf-viewer.vue in YOUR app -->
<script setup lang="ts">
import type { OverlayAnnotation } from 'kai-layer-pdf-viewer/types/annotations';
import type { AnnotationFetcher } from 'kai-layer-pdf-viewer/composables/usePdf';

const route = useRoute();

// Your custom SPARQL endpoint
const SPARQL_ENDPOINT = process.env.NUXT_PUBLIC_SPARQL_ENDPOINT;

// Your custom annotation fetcher
const fetchAnnotations: AnnotationFetcher = async (pageNumber) => {
  // Load your custom SPARQL template
  const templateResponse = await fetch('/queries/my-custom-query.rq');
  const template = await templateResponse.text();

  // Replace placeholders
  const query = template.replace('UNDEF', pageNumber.toString());

  // Execute query
  const url = `${SPARQL_ENDPOINT}?${new URLSearchParams({ query })}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/ld+json' }
  });

  return response.json();
};

// Custom highlighting logic
const highlightIri = computed(() => route.query.highlightIri as string);

const shouldHighlight = (annotation: OverlayAnnotation): boolean => {
  return annotation['@id'] === highlightIri.value;
};
</script>

<template>
  <PDFViewer
    :file="route.query.pdf as string"
    :annotation-fetcher="fetchAnnotations"
    :highlight-predicate="shouldHighlight"
  />
</template>
```

### Environment Variables

Define your SPARQL endpoint in `.env`:

```env
NUXT_PUBLIC_SPARQL_ENDPOINT=https://your-fuseki-server.com/dataset/query
```

### Custom Query Templates

Store your SPARQL queries in `public/queries/`:

```sparql
# public/queries/my-custom-query.rq
PREFIX sdo: <https://schema.org/>
PREFIX di: <https://document-intelligence/ontology/>

CONSTRUCT {
  ?cell a di:Cell ;
        di:content ?content ;
        geo:hasGeometry ?geometry ;
        di:confidence ?confidence ;
        di:rowIndex ?row ;
        di:columnIndex ?col .

  ?geometry geo:asWKT ?wkt .
} WHERE {
  ?cell a di:Cell ;
        sdo:isPartOf ?row_node ;
        di:content ?content .

  ?row_node sdo:isPartOf ?table .
  ?table di:page UNDEF .

  OPTIONAL { ?cell geo:hasGeometry ?geometry .
             ?geometry geo:asWKT ?wkt . }
  OPTIONAL { ?cell di:confidence ?confidence . }
  OPTIONAL { ?cell di:rowIndex ?row . }
  OPTIONAL { ?cell di:columnIndex ?col . }
}
```

## Highlighting Styles

The highlighting system supports two modes:

### With Confidence Colors (default)
When `disableConfidenceColors` is `false` (default):
- **Normal state**: Moderate fill opacity, confidence-based coloring (green for high confidence, red for low)
- **Highlighted state**: Higher fill opacity, stronger stroke, confidence-based coloring

### Without Confidence Colors (IRI highlighting mode)
When `disableConfidenceColors` is `true`:
- **Normal state**: Subtle gray fill and stroke (neutral appearance)
- **Highlighted state**: Bright fluorescent yellow fill and stroke (stands out clearly)

This mode is recommended when highlighting by IRI as it provides better visual contrast and makes the highlighted cell immediately obvious.

The highlighting is implemented in `composables/useAnnotationStyling.ts` using the `getConfidenceColors` function with options `{ highlight: true, disableConfidenceColors: true }`.

## Complete Working Example

See the test page at `pages/tests/PDF-24-highlight-iri.vue` for a complete, working example that demonstrates:

- Query parameter integration (`?highlightIri=<iri>`)
- Custom highlight predicate
- Event handling for clicked annotations
- Usage instructions in the UI

## Best Practices

1. **Performance**: The `annotationFetcher` is called once per page. Cache results when possible.
2. **Error Handling**: Always handle fetch errors gracefully and return empty arrays on failure.
3. **Type Safety**: Use TypeScript types from the layer for better IDE support.
4. **Query Parameters**: Use computed properties to react to query parameter changes.
5. **SPARQL Queries**: Test your queries directly against your endpoint before integrating.

## Troubleshooting

### Annotations not highlighting

- Check that your `highlightPredicate` is returning `true` for the expected annotations
- Verify that the IRI in the query parameter matches the annotation's `@id` field exactly
- Inspect annotations using the overlay-click event to see their IRIs

### Custom queries not working

- Verify your SPARQL endpoint is accessible
- Check the query syntax directly in your SPARQL endpoint's web interface
- Ensure the response format is JSON-LD or matches the expected annotation format
- Check browser console for fetch errors

### Layer not found

- Ensure the layer is properly installed or the path in `nuxt.config.ts` is correct
- Run `npm install` or `pnpm install` after adding the layer
- Check that you're importing types/composables with the correct paths

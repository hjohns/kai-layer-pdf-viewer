import { ref, computed, watch, onMounted, type Ref } from 'vue';
import { useRoute, useRouter } from '#app';
import type { OverlayAnnotation } from '@/types/annotations';

/**
 * Options for useHighlightCell composable
 */
export interface UseHighlightCellOptions {
  /**
   * Default IRI to highlight if no query parameter is set
   */
  defaultIri?: string;

  /**
   * Whether to automatically sync with route.query.highlightIri
   * @default true
   */
  syncWithRoute?: boolean;

  /**
   * Custom query parameter name
   * @default 'highlightIri'
   */
  queryParam?: string;

  /**
   * Manual control over confidence colors
   * - 'auto': Automatically disable confidence colors when highlighting (default)
   * - 'manual': Manual control via toggleConfidenceColors()
   * - boolean: Fixed value (true = disabled, false = enabled)
   * @default 'auto'
   */
  confidenceColorsMode?: 'auto' | 'manual' | boolean;
}

/**
 * Cell information extracted from an annotation
 */
export interface CellInfo {
  /** The annotation's IRI */
  iri: string;
  /** The cell's content/text */
  content: string;
  /** Row index (if available) */
  rowIndex?: number | string;
  /** Column index (if available) */
  columnIndex?: number | string;
  /** Confidence value (if available) */
  confidence?: number;
  /** Kind/type of cell (if available) */
  kind?: string;
  /** Full semantic properties object */
  semanticProperties?: Record<string, any>;
  /** Raw annotation object */
  annotation: OverlayAnnotation;
}

/**
 * Composable for highlighting a specific cell/annotation by IRI
 *
 * Provides utilities for:
 * - Syncing highlight IRI with route query parameters
 * - Creating highlight predicates for PDFViewer
 * - Auto-disabling confidence colors when highlighting
 * - Extracting semantic cell information
 * - Toggling between highlight modes
 *
 * @example
 * ```vue
 * <script setup>
 * const {
 *   shouldHighlight,
 *   disableConfidenceColors,
 *   isHighlightMode,
 *   getCellInfo
 * } = useHighlightCell({
 *   defaultIri: 'https://example.com/cell/1'
 * })
 *
 * const handleClick = (overlay) => {
 *   const info = getCellInfo(overlay)
 *   console.log(info.iri, info.rowIndex, info.columnIndex)
 * }
 * </script>
 *
 * <template>
 *   <PDFViewer
 *     :highlight-predicate="shouldHighlight"
 *     :disable-confidence-colors="disableConfidenceColors"
 *     :mouse-line="{ enabled: !isHighlightMode }"
 *     @overlay-click="handleClick"
 *   />
 * </template>
 * ```
 */
export function useHighlightCell(options: UseHighlightCellOptions = {}) {
  const {
    defaultIri,
    syncWithRoute = true,
    queryParam = 'highlightIri',
    confidenceColorsMode = 'auto'
  } = options;

  const route = useRoute();
  const router = useRouter();

  // Internal reactive state for the highlight IRI
  const highlightIri: Ref<string | undefined> = ref(undefined);

  // Manual confidence colors state (only used when confidenceColorsMode is 'manual')
  const manualConfidenceColorsDisabled = ref(true);

  // Initialize from route query param or default
  if (syncWithRoute) {
    const queryValue = route.query[queryParam] as string | undefined;
    highlightIri.value = queryValue || defaultIri;
  } else {
    highlightIri.value = defaultIri;
  }

  // Watch route changes and update highlightIri
  if (syncWithRoute) {
    watch(
      () => route.query[queryParam],
      (newValue) => {
        highlightIri.value = (newValue as string | undefined) || defaultIri;
      }
    );
  }

  // Set default IRI in route on mount if not already set
  onMounted(() => {
    if (syncWithRoute && !route.query[queryParam] && defaultIri) {
      router.replace({
        query: { ...route.query, [queryParam]: defaultIri }
      });
    }
  });

  /**
   * Predicate function to determine if an annotation should be highlighted
   * Pass this to PDFViewer's highlight-predicate prop
   *
   * Note: This is a computed that returns a function to ensure reactivity.
   * When highlightIri changes, the computed re-evaluates and Vue knows to update.
   */
  const shouldHighlight = computed(() => {
    const currentIri = highlightIri.value;
    return (annotation: OverlayAnnotation): boolean => {
      if (!currentIri) return false;
      return annotation['@id'] === currentIri;
    };
  });

  /**
   * Whether to disable confidence-based coloring
   * Behavior depends on confidenceColorsMode option:
   * - 'auto': Auto-disable when highlighting
   * - 'manual': Use manual toggle value
   * - boolean: Fixed value
   */
  const disableConfidenceColors = computed(() => {
    if (typeof confidenceColorsMode === 'boolean') {
      return confidenceColorsMode;
    }
    if (confidenceColorsMode === 'manual') {
      return manualConfidenceColorsDisabled.value;
    }
    // Default 'auto' mode: disable when highlighting
    return !!highlightIri.value;
  });

  /**
   * Whether we're currently in highlight mode (IRI is set)
   * Useful for toggling features like mouse line
   */
  const isHighlightMode = computed(() => !!highlightIri.value);

  /**
   * Extract semantic cell information from an annotation
   * Handles both old (doc:) and new (di:) formats
   *
   * @param annotation The annotation to extract info from
   * @returns Cell information object
   */
  const getCellInfo = (annotation: OverlayAnnotation): CellInfo => {
    const props = annotation.semanticProperties || {};

    return {
      iri: annotation['@id'] || 'No IRI',
      content: annotation.content || '',
      rowIndex: props.rowIndex ?? props.row,
      columnIndex: props.columnIndex ?? props.column,
      confidence: typeof props.confidence === 'number'
        ? props.confidence
        : undefined,
      kind: props.kind,
      semanticProperties: props,
      annotation
    };
  };

  /**
   * Update the highlight IRI
   * If syncWithRoute is true, also updates the route query parameter
   *
   * @param iri The new IRI to highlight (undefined to clear)
   */
  const setHighlightIri = (iri: string | undefined) => {
    highlightIri.value = iri;

    if (syncWithRoute) {
      const query = { ...route.query };
      if (iri) {
        query[queryParam] = iri;
      } else {
        delete query[queryParam];
      }
      router.replace({ query });
    }
  };

  /**
   * Clear the highlight (sets IRI to undefined)
   */
  const clearHighlight = () => {
    setHighlightIri(undefined);
  };

  /**
   * Toggle confidence colors on/off (only works in 'manual' mode)
   */
  const toggleConfidenceColors = () => {
    if (confidenceColorsMode === 'manual') {
      manualConfidenceColorsDisabled.value = !manualConfidenceColorsDisabled.value;
    }
  };

  /**
   * Set confidence colors state (only works in 'manual' mode)
   * @param disabled true to disable confidence colors, false to enable
   */
  const setConfidenceColorsDisabled = (disabled: boolean) => {
    if (confidenceColorsMode === 'manual') {
      manualConfidenceColorsDisabled.value = disabled;
    }
  };

  return {
    // State
    highlightIri,

    // Computed
    shouldHighlight,
    disableConfidenceColors,
    isHighlightMode,

    // Methods
    getCellInfo,
    setHighlightIri,
    clearHighlight,
    toggleConfidenceColors,
    setConfidenceColorsDisabled
  };
}
/**
 * Core annotation interfaces for the PDF viewer system
 */

/**
 * Base annotation interface with common properties
 */
export interface BaseAnnotation {
  /** Page number as string (1-based) */
  page: string;
  /** Content/text of the annotation */
  content: string;
  /** Rectangular coordinates defining the annotation area */
  rect: number[];
}

/**
 * External overlay annotation (loaded from JSON files)
 * These are not embedded in the PDF but rendered as overlays
 */
export interface OverlayAnnotation extends BaseAnnotation {
  /** Line number for ordering/identification */
  line: number;
  /** Optional annotation type/category for custom providers */
  type?: string;
  /** Optional metadata for custom providers */
  metadata?: Record<string, any>;

  // JSON-LD support properties
  /** JSON-LD identifier/IRI for semantic annotations */
  '@id'?: string;
  /** JSON-LD type(s) for semantic annotations */
  '@type'?: string | string[];
  /** JSON-LD context for semantic annotations */
  '@context'?: string | Record<string, any>;
  /** Semantic properties extracted from JSON-LD */
  semanticProperties?: Record<string, any>;
}

/**
 * Embedded PDF annotation (from the actual PDF document)
 * These are annotations that exist within the PDF file itself
 */
export interface EmbeddedAnnotation extends BaseAnnotation {
  /** MuPDF annotation type */
  type: string;
  /** Optional annotation ID from the PDF */
  id?: string;
  /** Optional annotation properties from PDF */
  properties?: Record<string, any>;
}

/**
 * Legacy DocAnnotation interface - deprecated, use OverlayAnnotation instead
 * @deprecated Use OverlayAnnotation for external annotations
 */
export interface DocAnnotation {
  page: string;
  line: number;
  content: string;
  rect: number[];
}

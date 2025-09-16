/// <reference lib="webworker" />
console.log('Worker script starting...');
import * as Comlink from 'comlink';
import * as mupdfjs from 'mupdf';
import type { PDFDocument, PDFPage } from 'mupdf';
console.log('Imports completed');

export const MUPDF_LOADED = 'MUPDF_LOADED';

export interface MupdfWorker {
  loadDocument(arrayBuffer: ArrayBuffer): Promise<void>;
  renderPageAsImage(pageIndex: number, scale: number, annotations?: Array<{ type: string; rect: [number, number, number, number]; color: [number, number, number] }>): Promise<Uint8Array>;
  getPageCount(): Promise<number>;
  getAnnotations(pageIndex: number): Promise<Array<{ type: string }>>;
  addAnnotation(page: PDFPage, rect: [number, number, number, number], options?: { color?: [number, number, number], borderWidth?: number }): Promise<void>;
  getMetadata(name: string): Promise<string | undefined>;
}

export interface DocAnnotation {
    page: string,
    line: number, 
    content: string, 
    rect: number[]
}

export class MupdfWorker {
  private document?: PDFDocument;
  private docAnnotations: DocAnnotation[] = [];

  constructor() {
    console.log('MupdfWorker constructor called');
    this.initializeMupdf();
  }

  private async initializeMupdf() {
    console.log('initializeMupdf started');
    try {
      console.log('Available mupdfjs methods:', Object.keys(mupdfjs));
      console.log('mupdfjs object:', mupdfjs);

      // Initialize mupdf with required fonts
      await mupdfjs.installLoadFontFunction(() => {
        // Return null to use default fonts
        return null;
      });

      postMessage(MUPDF_LOADED);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to initialize MuPDF:', error);
      postMessage({ error: errorMessage });
    }
  }

  // ===> Here you can create methods <===
  // ===> that call statics and methods <===
  // ===> from mupdfjs which wraps ./node_modules/mupdf/dist/mupdf.js <===

  async loadDocument(document: ArrayBuffer, annotations?: DocAnnotation[]): Promise<void> {
    console.log('Worker: Loading document, size:', document.byteLength);
    this.document = mupdfjs.Document.openDocument(document, 'application/pdf') as PDFDocument;
    console.log('Worker: Document loaded');
    this.docAnnotations = annotations ?? [];
    console.log("Doc annotations:", this.docAnnotations);
  }

  async renderPageAsImage(pageIndex: number, scale: number, pageAnnotations?: Array<{
    rect: number[];
    color?: [number, number, number];
  }>): Promise<Uint8Array> {
    console.log('Worker: Rendering page', pageIndex, 'at scale', scale);
    if (!this.document) throw new Error('Document not loaded');
    const page = this.document.loadPage(pageIndex);
    console.log("Page loaded:", page);

    // Create transform matrix
    const matrix = mupdfjs.Matrix.scale(scale, scale);
    console.log("Matrix:", matrix);

    const currentAnnotations = await page.getAnnotations();
    for(const annotation of currentAnnotations) {
      console.log("Destroying annotation:", annotation);
      page.deleteAnnotation(annotation);
      annotation.destroy();
    }

    const annotations = pageAnnotations || this.docAnnotations.filter(annotation => annotation.page === (pageIndex + 1).toString()) || [];
    console.log("Doc for page", pageIndex, "annotations:", annotations);

    if(annotations.length > 0) {
      for(const annotation of annotations) {
        const { rect } = annotation;
        const color: [number, number, number] = [0.8, 0.8, 1];

        const ann = page.createAnnotation("Polygon");
        const points: [number, number][] = [];
        console.log("PDF Points:", rect);

        const PDF_POINTS_PER_INCH = 72;
        const BROWSER_DPI = 96;
        const SCALE_FACTOR = 0.375; // (27/72) empirically determined
        const dpi = scale * PDF_POINTS_PER_INCH * SCALE_FACTOR;
        console.log("Effective DPI:", dpi);

        for (let i = 0; i < rect.length; i += 2) {
          // Convert inches to pixels using DPI
          const x = rect[i] * dpi;
          const y = rect[i + 1] * dpi;
          points.push([x, y] as [number, number]);
        }
        ann.setVertices(points);
        ann.setColor([0.7, 0.7, 1]);
        ann.setBorderWidth(2);
        ann.update();
      }
    }
    
    console.log("Page to pixmap");    
    const pixmap = page.toPixmap(matrix, mupdfjs.ColorSpace.DeviceRGB);    
    console.log("Pixmap:", pixmap);
    
    return await pixmap.asPNG();
  }

  async getPageCount(): Promise<number> {
    if (!this.document) throw new Error('Document not loaded');
    return await this.document.countPages();
  }

  async getAnnotations(pageIndex: number): Promise<Array<{ type: string }>> {
    if (!this.document) throw new Error('Document not loaded');
    const page = this.document.loadPage(pageIndex);

    const annotations = await page.getAnnotations();
    console.log("Annotations:", annotations);
    
    // Get existing annotations
    return await page.getAnnotations().map(() => ({ type: 'annotation' }));
  }

  async getMetadata(name: string): Promise<string | undefined> {
    if (!this.document) throw new Error('Document not loaded');
    return await this.document.getMetaData(name);
  }

  async addAnnotation(page: PDFPage, rect: [number, number, number, number], options: { color?: [number, number, number], borderWidth?: number } = {}): Promise<void> {
    
    try {
      const annotation = page.createAnnotation("Square");
      annotation.setRect(rect);
      annotation.setColor(options.color ?? [0.8, 0.8, 1]);
      annotation.setBorderWidth(options.borderWidth ?? 1);
      annotation.update();
    } catch (error) {
      console.error('Error adding test annotation:', error);
      throw error;
    }
  }
}

Comlink.expose(new MupdfWorker());
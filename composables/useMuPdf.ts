import { MUPDF_LOADED, type MupdfWorker } from '@/workers/mupdf.worker';
import type { OverlayAnnotation } from '@/types/annotations';
import * as Comlink from 'comlink';
import { ref, shallowRef } from 'vue';
import * as mupdfjs from 'mupdf';
import type { PDFPage } from 'mupdf';


const baseURL = window?.location?.origin || 'http://localhost:3000'
console.log('Worker base URL:', baseURL)

const workerPath = new URL('../workers/mupdf.worker.ts', import.meta.url).href

const worker = new Worker(
  workerPath,
  { type: 'module' }
);
console.log('Worker created with URL:', workerPath);

const mupdfWorker = Comlink.wrap<MupdfWorker>(worker);
const workerInitialized = ref(false);

let initializationTimeout: NodeJS.Timeout
worker.addEventListener('error', (error) => {
  console.error('Worker error:', error)
})

worker.addEventListener('message', (event) => {
  console.log('Worker message:', event.data)
  if (event.data?.error) {
    console.error('Worker initialization error:', event.data.error);
    clearTimeout(initializationTimeout);
  } else if (event.data === MUPDF_LOADED) {
    workerInitialized.value = true;
    clearTimeout(initializationTimeout)
  }
});

// Set timeout for worker initialization
initializationTimeout = setTimeout(() => {
  if (!workerInitialized.value) {
    console.error('Worker failed to initialize after 5 seconds')
  }
}, 5000)

// Log any worker errors
worker.onerror = (error) => {
  console.error('Worker creation error:', error);
};

export function useMuPdf() {
  const document = shallowRef<ArrayBuffer | null>(null);
  const currentPage = ref(0);
  const annotations = ref<Array<{
    type: string;
    rect: [number, number, number, number];
    color: [number, number, number];
  }>>([]);

  const addSquareAnnotation = (pageIndex: number) => {
    if (pageIndex === 0) {
      annotations.value.push({
        type: 'square',
        rect: [0.4, 0.4, 0.6, 0.6], // Normalized coordinates
        color: [1, 0, 0]
      });
    }
  };

  // ===> Here you can create functions <===
  // ===> that use the methods of the worker. <===

  const loadDocument = (arrayBuffer: ArrayBuffer, annotations: OverlayAnnotation[]) => {
    document.value = arrayBuffer;
    return mupdfWorker.loadDocument(arrayBuffer, annotations);
  };

  const renderPage = (pageIndex: number, annotations?: Array<{
    rect: [number, number, number, number];
    color?: [number, number, number];
  }>) => {
    if (!document.value) throw new Error('Document not loaded');    
    currentPage.value = pageIndex;
    return mupdfWorker.renderPageAsImage(pageIndex, (window.devicePixelRatio * 96) / 72, annotations);
  };

  const getPageCount = () => {
    return mupdfWorker.getPageCount();
  };

  const getMetadata = (name: string) => {
    return mupdfWorker.getMetadata(name);
  };

  const getAnnotations = (pageIndex: number) => {
    return mupdfWorker.getAnnotations(pageIndex);
  };

  const addAnnotation = (page: PDFPage, rect: [number, number, number, number], options: { color: [number, number, number], borderWidth: number }) => {
    return mupdfWorker.addAnnotation(page, rect, options);
  };

  return {
    workerInitialized,
    loadDocument,
    renderPage,
    currentPage,
    getPageCount,
    annotations,
    getMetadata,
    addSquareAnnotation,
    getAnnotations,
    addAnnotation
  };
}
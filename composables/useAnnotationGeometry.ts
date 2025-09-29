import type { OverlayAnnotation } from '@/types/annotations';

export interface AnnotationPathBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface SpatialGrid {
  cellSize: number;
  canvasWidth: number;
  canvasHeight: number;
  grid: Map<string, AnnotationPathData[]>;
}

export interface AnnotationSpatialIndex {
  spatialGrid: SpatialGrid;
  allAnnotations: Map<string, AnnotationPathData>;
}

export interface AnnotationPathData {
  path: Path2D;
  annotation: OverlayAnnotation;
  points: [number, number][];
  bounds: AnnotationPathBounds;
}

export const useAnnotationGeometry = () => {
  const convertCoordinates = (rect: number[], effectiveDpi: number) => {
    const points: [number, number][] = [];
    for (let i = 0; i < rect.length; i += 2) {
      const x = rect[i] * effectiveDpi;
      const y = rect[i + 1] * effectiveDpi;
      points.push([x, y]);
    }
    return points;
  };

  const buildPathFromPoints = (points: [number, number][]) => {
    const path = new Path2D();
    points.forEach(([x, y], index) => {
      if (index === 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    });
    path.closePath();
    return path;
  };

  const calculateBounds = (points: [number, number][]): AnnotationPathBounds => {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  };

  const createAnnotationPath = (
    annotation: OverlayAnnotation,
    effectiveDpi: number
  ): AnnotationPathData | null => {
    const points = convertCoordinates(annotation.rect, effectiveDpi);
    if (!points.length) {
      return null;
    }
    const path = buildPathFromPoints(points);
    const bounds = calculateBounds(points);
    return { path, annotation, points, bounds };
  };

  const createSpatialGrid = (canvasWidth: number, canvasHeight: number, cellSize: number = 50): SpatialGrid => {
    return {
      cellSize,
      canvasWidth,
      canvasHeight,
      grid: new Map()
    };
  };

  const getCellKey = (x: number, y: number, cellSize: number): string => {
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    return `${cellX},${cellY}`;
  };

  const addAnnotationToGrid = (grid: SpatialGrid, annotation: AnnotationPathData) => {
    const { bounds } = annotation;
    const { cellSize } = grid;

    // Add annotation to all cells it overlaps
    const startCellX = Math.floor(bounds.minX / cellSize);
    const endCellX = Math.floor(bounds.maxX / cellSize);
    const startCellY = Math.floor(bounds.minY / cellSize);
    const endCellY = Math.floor(bounds.maxY / cellSize);

    for (let cellX = startCellX; cellX <= endCellX; cellX++) {
      for (let cellY = startCellY; cellY <= endCellY; cellY++) {
        const key = `${cellX},${cellY}`;
        if (!grid.grid.has(key)) {
          grid.grid.set(key, []);
        }
        grid.grid.get(key)!.push(annotation);
      }
    }
  };

  const buildSpatialIndex = (annotations: AnnotationPathData[], canvasWidth: number, canvasHeight: number): AnnotationSpatialIndex => {
    const spatialGrid = createSpatialGrid(canvasWidth, canvasHeight);
    const allAnnotations = new Map<string, AnnotationPathData>();

    for (const annotation of annotations) {
      const id = annotation.annotation['@id'] || `${annotation.annotation.page}-${annotation.annotation.line}`;
      allAnnotations.set(id, annotation);
      addAnnotationToGrid(spatialGrid, annotation);
    }

    return { spatialGrid, allAnnotations };
  };

  const getCandidateAnnotationsFromGrid = (grid: SpatialGrid, x: number, y: number): AnnotationPathData[] => {
    const key = getCellKey(x, y, grid.cellSize);
    return grid.grid.get(key) || [];
  };

  const getAnnotationsIntersectingVerticalLine = (
    annotationPathValues: Iterable<AnnotationPathData>,
    x: number,
    ctx: CanvasRenderingContext2D
  ) => {
    const intersections: OverlayAnnotation[] = [];

    for (const { path, annotation, bounds } of annotationPathValues) {
      if (x < bounds.minX || x > bounds.maxX) {
        continue;
      }

      const sampleCount = Math.max(1, Math.ceil(bounds.height / 8));
      const step = bounds.height / sampleCount;
      let intersects = false;

      for (let i = 0; i <= sampleCount; i++) {
        const y = bounds.minY + step * i;
        if (ctx.isPointInPath(path, x, y)) {
          intersects = true;
          break;
        }
      }

      if (intersects) {
        intersections.push(annotation);
      }
    }

    return intersections;
  };

  const getAnnotationsIntersectingVerticalLineOptimized = (
    spatialIndex: AnnotationSpatialIndex,
    x: number,
    y: number,
    canvasHeight: number,
    ctx: CanvasRenderingContext2D
  ) => {
    const intersections: OverlayAnnotation[] = [];
    const processedIds = new Set<string>();

    // Sample points along the vertical line to get candidate annotations
    const sampleCount = Math.max(5, Math.ceil(canvasHeight / spatialIndex.spatialGrid.cellSize));
    const step = canvasHeight / sampleCount;

    for (let i = 0; i <= sampleCount; i++) {
      const sampleY = step * i;
      const candidates = getCandidateAnnotationsFromGrid(spatialIndex.spatialGrid, x, sampleY);

      for (const { path, annotation, bounds } of candidates) {
        const id = annotation['@id'] || `${annotation.page}-${annotation.line}`;

        // Skip if already processed
        if (processedIds.has(id)) {
          continue;
        }
        processedIds.add(id);

        // Quick bounds check
        if (x < bounds.minX || x > bounds.maxX) {
          continue;
        }

        // Detailed intersection test
        const detailSampleCount = Math.max(1, Math.ceil(bounds.height / 8));
        const detailStep = bounds.height / detailSampleCount;
        let intersects = false;

        for (let j = 0; j <= detailSampleCount; j++) {
          const testY = bounds.minY + detailStep * j;
          if (ctx.isPointInPath(path, x, testY)) {
            intersects = true;
            break;
          }
        }

        if (intersects) {
          intersections.push(annotation);
        }
      }
    }

    return intersections;
  };

  const getAnnotationsIntersectingHorizontalLine = (
    annotationPathValues: Iterable<AnnotationPathData>,
    y: number,
    ctx: CanvasRenderingContext2D
  ) => {
    const intersections: OverlayAnnotation[] = [];

    for (const { path, annotation, bounds } of annotationPathValues) {
      if (y < bounds.minY || y > bounds.maxY) {
        continue;
      }

      const sampleCount = Math.max(1, Math.ceil(bounds.width / 8));
      const step = bounds.width / sampleCount;
      let intersects = false;

      for (let i = 0; i <= sampleCount; i++) {
        const x = bounds.minX + step * i;
        if (ctx.isPointInPath(path, x, y)) {
          intersects = true;
          break;
        }
      }

      if (intersects) {
        intersections.push(annotation);
      }
    }

    return intersections;
  };

  const getAnnotationsIntersectingHorizontalLineOptimized = (
    spatialIndex: AnnotationSpatialIndex,
    x: number,
    y: number,
    canvasWidth: number,
    ctx: CanvasRenderingContext2D
  ) => {
    const intersections: OverlayAnnotation[] = [];
    const processedIds = new Set<string>();

    // Sample points along the horizontal line to get candidate annotations
    const sampleCount = Math.max(5, Math.ceil(canvasWidth / spatialIndex.spatialGrid.cellSize));
    const step = canvasWidth / sampleCount;

    for (let i = 0; i <= sampleCount; i++) {
      const sampleX = step * i;
      const candidates = getCandidateAnnotationsFromGrid(spatialIndex.spatialGrid, sampleX, y);

      for (const { path, annotation, bounds } of candidates) {
        const id = annotation['@id'] || `${annotation.page}-${annotation.line}`;

        // Skip if already processed
        if (processedIds.has(id)) {
          continue;
        }
        processedIds.add(id);

        // Quick bounds check
        if (y < bounds.minY || y > bounds.maxY) {
          continue;
        }

        // Detailed intersection test
        const detailSampleCount = Math.max(1, Math.ceil(bounds.width / 8));
        const detailStep = bounds.width / detailSampleCount;
        let intersects = false;

        for (let j = 0; j <= detailSampleCount; j++) {
          const testX = bounds.minX + detailStep * j;
          if (ctx.isPointInPath(path, testX, y)) {
            intersects = true;
            break;
          }
        }

        if (intersects) {
          intersections.push(annotation);
        }
      }
    }

    return intersections;
  };

  return {
    convertCoordinates,
    buildPathFromPoints,
    calculateBounds,
    createAnnotationPath,
    createSpatialGrid,
    buildSpatialIndex,
    getAnnotationsIntersectingVerticalLine,
    getAnnotationsIntersectingVerticalLineOptimized,
    getAnnotationsIntersectingHorizontalLine,
    getAnnotationsIntersectingHorizontalLineOptimized
  };
};

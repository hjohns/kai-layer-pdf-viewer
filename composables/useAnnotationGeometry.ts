import type { OverlayAnnotation } from '@/types/annotations';

export interface AnnotationPathBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface AnnotationPathData {
  path: Path2D;
  annotation: OverlayAnnotation;
  points: [number, number][];
  bounds: AnnotationPathBounds;
}

export const convertCoordinates = (rect: number[], effectiveDpi: number) => {
  const points: [number, number][] = [];
  for (let i = 0; i < rect.length; i += 2) {
    const x = rect[i] * effectiveDpi;
    const y = rect[i + 1] * effectiveDpi;
    points.push([x, y]);
  }
  return points;
};

export const buildPathFromPoints = (points: [number, number][]) => {
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

export const calculateBounds = (points: [number, number][]): AnnotationPathBounds => {
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

export const createAnnotationPath = (
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

export const getAnnotationsIntersectingVerticalLine = (
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

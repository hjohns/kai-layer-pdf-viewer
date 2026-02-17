import { ref, computed, shallowRef } from 'vue';
import type { Ref } from 'vue';
import type { OverlayAnnotation } from '@/types/annotations';
import { useAnnotationGeometry } from '@/composables/useAnnotationGeometry';

export type MouseLineOrientation = 'vertical' | 'horizontal';

export interface MouseLineIntersectionContext {
  x: number;
  y: number;
  pageNumber: number;
  overlays: OverlayAnnotation[];
  orientation: MouseLineOrientation;
}

export interface MouseLineTooltipOptions {
  enabled: boolean;
  offset?: number;
  verticalGap?: number;
  estimatedHeight?: number;
}

export interface MouseLineOptions {
  enableMouseLine: boolean;
  mouseLineColor: string;
  mouseLineWidth: number;
  orientation: MouseLineOrientation;
  onMouseLineIntersections?: (context: MouseLineIntersectionContext) => void;
  tooltip: MouseLineTooltipOptions;
}

interface MouseGuideDependencies {
  canvasRef: Ref<HTMLCanvasElement | null>;
  overlayCanvasRef: Ref<HTMLCanvasElement | null>;
  annotationCanvasRef?: Ref<HTMLCanvasElement | null>;
  htmlOverlayContainer: Ref<HTMLElement | null>;
  currentPage: Ref<number>;
  handleAnnotationHover: (x: number, y: number, ctx: CanvasRenderingContext2D) => boolean;
  getAnnotationAtPoint: (x: number, y: number, ctx: CanvasRenderingContext2D) => OverlayAnnotation | null;
  drawHoverEffect: (ctx: CanvasRenderingContext2D, x: number, y: number, effectiveDpi: number) => Promise<void>;
  clearHtmlOverlays: (reason?: string) => void;
  getAnnotationsIntersectingVerticalLine: (x: number, ctx: CanvasRenderingContext2D) => OverlayAnnotation[];
  getAnnotationsIntersectingHorizontalLine: (y: number, ctx: CanvasRenderingContext2D) => OverlayAnnotation[];
}

const DEFAULT_MOUSE_LINE_COLOR = 'rgba(59, 130, 246, 0.65)';
const DEFAULT_MOUSE_LINE_WIDTH = 1.5;
const DEFAULT_TOOLTIP_OFFSET = 14;
const DEFAULT_TOOLTIP_VERTICAL_GAP = 28;
const DEFAULT_TOOLTIP_ESTIMATED_HEIGHT = 32;
const DEFAULT_TOOLTIP_OPTIONS: MouseLineTooltipOptions = {
  enabled: false,
  offset: DEFAULT_TOOLTIP_OFFSET,
  verticalGap: DEFAULT_TOOLTIP_VERTICAL_GAP,
  estimatedHeight: DEFAULT_TOOLTIP_ESTIMATED_HEIGHT
};
const TOOLTIP_LAYER_CLASS = 'pdf-mouse-line-tooltips';
const TOOLTIP_ITEM_CLASS = 'pdf-mouse-line-tooltip';

interface TooltipEntry {
  id: string;
  overlay: OverlayAnnotation;
  orientation: MouseLineOrientation;
  left: number;
  top: number;
  rightEdge?: number;
  leftEdge?: number;
  maxWidth?: number;
  showOnLeft?: boolean;
  showOnTop?: boolean;
}

export function useMouseGuide(
  deps: MouseGuideDependencies,
  initialOptions?: Partial<MouseLineOptions>
) {
  // Get geometry functions from composable
  const { convertCoordinates } = useAnnotationGeometry();

  const initialTooltipOptions: MouseLineTooltipOptions = {
    ...DEFAULT_TOOLTIP_OPTIONS,
    ...(initialOptions?.tooltip ?? {})
  };

  const options = ref<MouseLineOptions>({
    enableMouseLine: initialOptions?.enableMouseLine ?? false,
    mouseLineColor: initialOptions?.mouseLineColor ?? DEFAULT_MOUSE_LINE_COLOR,
    mouseLineWidth: initialOptions?.mouseLineWidth ?? DEFAULT_MOUSE_LINE_WIDTH,
    orientation: initialOptions?.orientation ?? 'vertical',
    onMouseLineIntersections: initialOptions?.onMouseLineIntersections,
    tooltip: initialTooltipOptions
  });

  const previousHoverState = ref(false);
  const previousHoveredAnnotation = ref<OverlayAnnotation | null>(null);
  const previousMouseLinePayload = ref<{
    pageNumber: number;
    x: number;
    y: number;
    orientation: MouseLineOrientation;
    overlayIds: string[];
  } | null>(null);
  const tooltipHost = shallowRef<HTMLElement | null>(null);
  const currentMousePosition = ref<{ x: number; y: number } | null>(null);

  // Performance optimization: throttle mouse events using RAF
  let rafId: number | null = null;
  let pendingMouseEvent: MouseEvent | null = null;

  // Dirty region tracking for optimized canvas redraws
  interface DirtyRegion {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }

  let dirtyRegion: DirtyRegion | null = null;
  let previousMouseLinePosition: { x: number; y: number; orientation: MouseLineOrientation } | null = null;
  let previousHoverAnnotation: OverlayAnnotation | null = null;

  // Dirty region management
  const expandDirtyRegion = (minX: number, minY: number, maxX: number, maxY: number) => {
    if (!dirtyRegion) {
      dirtyRegion = { minX, minY, maxX, maxY };
    } else {
      dirtyRegion.minX = Math.min(dirtyRegion.minX, minX);
      dirtyRegion.minY = Math.min(dirtyRegion.minY, minY);
      dirtyRegion.maxX = Math.max(dirtyRegion.maxX, maxX);
      dirtyRegion.maxY = Math.max(dirtyRegion.maxY, maxY);
    }
  };

  const addMouseLineToDirtyRegion = (x: number, y: number, orientation: MouseLineOrientation, canvas: HTMLCanvasElement) => {
    const lineWidth = options.value.mouseLineWidth;
    const margin = Math.ceil(lineWidth / 2) + 1; // Extra pixel for anti-aliasing

    if (orientation === 'vertical') {
      expandDirtyRegion(x - margin, 0, x + margin, canvas.height);
    } else {
      expandDirtyRegion(0, y - margin, canvas.width, y + margin);
    }
  };

  const addAnnotationToDirtyRegion = (annotation: OverlayAnnotation, effectiveDpi: number) => {
    if (!annotation.rect || annotation.rect.length < 4) return;

    const points = convertCoordinates(annotation.rect, effectiveDpi);
    if (points.length === 0) return;

    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Add small margin for text and borders
    const margin = 5;
    expandDirtyRegion(minX - margin, minY - margin, maxX + margin, maxY + margin);
  };

  const clearDirtyRegion = (ctx: CanvasRenderingContext2D) => {
    if (!dirtyRegion) return;

    const { minX, minY, maxX, maxY } = dirtyRegion;
    const width = maxX - minX;
    const height = maxY - minY;

    if (width > 0 && height > 0) {
      ctx.clearRect(minX, minY, width, height);
    }

    dirtyRegion = null;
  };

  const mouseLineEnabled = computed(() => options.value.enableMouseLine);
  const mouseLineOrientation = computed<MouseLineOrientation>(() => options.value.orientation ?? 'vertical');
  const tooltipOptions = computed<MouseLineTooltipOptions>(() => ({
    ...DEFAULT_TOOLTIP_OPTIONS,
    ...(options.value.tooltip ?? DEFAULT_TOOLTIP_OPTIONS)
  }));

  function clearTooltipHost(removeHost = false) {
    const host = tooltipHost.value;
    if (!host) {
      return;
    }

    host.innerHTML = '';

    if (removeHost) {
      host.remove();
      tooltipHost.value = null;
    }
  }

  const ensureTooltipHost = () => {
    if (typeof document === 'undefined') {
      return null;
    }

    const container = deps.htmlOverlayContainer.value;
    const overlayCanvas = deps.overlayCanvasRef.value;
    if (!container || !overlayCanvas) {
      return null;
    }

    const existingHost = tooltipHost.value;
    if (existingHost && existingHost.parentElement !== container) {
      clearTooltipHost(true);
    }

    if (!tooltipHost.value) {
      const host = document.createElement('div');
      host.className = TOOLTIP_LAYER_CLASS;
      host.style.position = 'absolute';
      host.style.top = '0';
      host.style.left = '0';
      host.style.pointerEvents = 'none';
      host.style.zIndex = '2000';
      container.appendChild(host);
      tooltipHost.value = host;
    }

    return tooltipHost.value;
  };

  const updateMouseGuideOptions = (nextOptions: Partial<MouseLineOptions>) => {
    const nextTooltip = nextOptions.tooltip
      ? {
          ...tooltipOptions.value,
          ...nextOptions.tooltip
        }
      : options.value.tooltip;

    const nextOrientation = nextOptions.orientation ?? options.value.orientation;
    const orientationChanged = nextOrientation !== options.value.orientation;

    options.value = {
      ...options.value,
      ...nextOptions,
      orientation: nextOrientation,
      tooltip: nextTooltip
    };

    if (orientationChanged) {
      previousMouseLinePayload.value = null;
      clearTooltipHost(true);
    }

    if (!options.value.tooltip.enabled) {
      clearTooltipHost(true);
    }
  };

  const emitMouseLineIntersections = (payload: { x: number; y: number; overlays: OverlayAnnotation[] }) => {
    const handler = options.value.onMouseLineIntersections;
    if (!handler) {
      return;
    }

    const overlayIds = payload.overlays.map(annotation => annotation['@id'] || `${annotation.page}-${annotation.line}`);
    const normalizedX = Number.isFinite(payload.x) ? Number(payload.x.toFixed(2)) : Number.NaN;
    const normalizedY = Number.isFinite(payload.y) ? Number(payload.y.toFixed(2)) : Number.NaN;
    const orientation = mouseLineOrientation.value;
    const previousPayload = previousMouseLinePayload.value;

    const hasChanged = !previousPayload ||
      previousPayload.pageNumber !== deps.currentPage.value ||
      previousPayload.overlayIds.length !== overlayIds.length ||
      overlayIds.some((id, index) => id !== previousPayload.overlayIds[index]) ||
      previousPayload.x !== normalizedX ||
      previousPayload.y !== normalizedY ||
      previousPayload.orientation !== orientation;

    if (hasChanged) {
      previousMouseLinePayload.value = {
        pageNumber: deps.currentPage.value,
        x: normalizedX,
        y: normalizedY,
        orientation,
        overlayIds
      };

      handler({
        x: payload.x,
        y: payload.y,
        pageNumber: deps.currentPage.value,
        overlays: payload.overlays,
        orientation
      });
    }
  };

  const resetMouseLinePayload = () => {
    previousMouseLinePayload.value = null;
    clearTooltipHost(true);
  };

  const formatTooltipMeta = (overlay: OverlayAnnotation) => {
    const row = overlay.semanticProperties?.row;
    const column = overlay.semanticProperties?.column;

    if (row === undefined && column === undefined) {
      return '';
    }

    const rowValue = row ?? '?';
    const columnValue = column ?? '?';
    return `Row ${rowValue}, Col ${columnValue}`;
  };

  const computeTooltipEntries = (overlays: OverlayAnnotation[], mouseX?: number, mouseY?: number): TooltipEntry[] => {
    if (!overlays.length) {
      return [];
    }

    const overlayCanvas = deps.overlayCanvasRef.value;
    if (!overlayCanvas) {
      return [];
    }

    const overlayBounds = overlayCanvas.getBoundingClientRect();
    if (!overlayBounds.width || !overlayBounds.height || !overlayCanvas.width || !overlayCanvas.height) {
      return [];
    }

    const effectiveDpi = (typeof window === 'undefined' ? 1 : window.devicePixelRatio) * 96;
    const scaleX = !Number.isFinite(overlayBounds.width / overlayCanvas.width)
      ? 1
      : overlayBounds.width / overlayCanvas.width;
    const scaleY = !Number.isFinite(overlayBounds.height / overlayCanvas.height)
      ? 1
      : overlayBounds.height / overlayCanvas.height;

    const tooltipOffset = tooltipOptions.value.offset ?? DEFAULT_TOOLTIP_OFFSET;
    const tooltipGap = tooltipOptions.value.verticalGap ?? DEFAULT_TOOLTIP_VERTICAL_GAP;
    const tooltipHalfHeight = (tooltipOptions.value.estimatedHeight ?? DEFAULT_TOOLTIP_ESTIMATED_HEIGHT) / 2;

    const entries: TooltipEntry[] = [];
    const orientation = mouseLineOrientation.value;

    // Determine which side to show tooltips based on cursor position
    // For vertical: if mouse is on right 50%, show tooltips on left
    // For horizontal: if mouse is on bottom 50%, show tooltips on top
    const showOnLeft = orientation === 'vertical' && mouseX !== undefined && (mouseX / overlayCanvas.width) > 0.5;
    const showOnTop = orientation === 'horizontal' && mouseY !== undefined && (mouseY / overlayCanvas.height) > 0.5;

    for (const overlay of overlays) {
      const rect = overlay.rect || [];
      if (!rect.length) {
        continue;
      }

      const points = convertCoordinates(rect, effectiveDpi);
      if (!points.length) {
        continue;
      }

      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);

      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
        continue;
      }

      const id = overlay['@id'] || `${overlay.page}-${overlay.line}`;

      if (orientation === 'vertical') {
        const displayLeftEdge = minX * scaleX;
        const displayRightEdge = maxX * scaleX;
        const displayCenterY = (minY + (maxY - minY) / 2) * scaleY;

        // Use left edge if showing on left side, otherwise use right edge
        const displayEdge = showOnLeft ? displayLeftEdge : displayRightEdge;

        entries.push({
          id,
          overlay,
          orientation,
          left: displayEdge,
          top: displayCenterY,
          rightEdge: displayRightEdge,
          leftEdge: displayLeftEdge,
          showOnLeft
        });
      } else {
        const displayTopEdge = minY * scaleY;
        const displayBottomEdge = maxY * scaleY;
        const displayCenterX = (minX + (maxX - minX) / 2) * scaleX;
        const overlayWidth = (maxX - minX) * scaleX;

        if (!Number.isFinite(displayCenterX) || !Number.isFinite(displayBottomEdge) || overlayWidth <= 0) {
          continue;
        }

        const halfWidth = overlayWidth / 2;
        const clampedCenter = (() => {
          const minCenter = halfWidth;
          const maxCenter = Math.max(minCenter, overlayBounds.width - halfWidth);
          return Math.min(Math.max(displayCenterX, minCenter), maxCenter);
        })();

        // Use top edge if showing on top, otherwise use bottom edge + offset
        const displayYPosition = showOnTop ? displayTopEdge - tooltipOffset : displayBottomEdge + tooltipOffset;

        entries.push({
          id,
          overlay,
          orientation,
          left: clampedCenter,
          top: displayYPosition,
          maxWidth: overlayWidth,
          showOnTop
        });
      }
    }

    if (!entries.length) {
      return [];
    }

    if (orientation === 'vertical') {
      // Determine the positioning edge based on whether we're showing on left or right
      const isShowingOnLeft = entries.length > 0 && entries[0].showOnLeft;
      const minLeftEdge = isShowingOnLeft ? Math.min(...entries.map(entry => entry.leftEdge!)) : 0;
      const maxRightEdge = !isShowingOnLeft ? Math.max(...entries.map(entry => entry.rightEdge!)) : 0;

      entries.sort((a, b) => a.top - b.top);

      const minCenter = tooltipHalfHeight;
      const maxCenter = Math.max(minCenter, overlayBounds.height - tooltipHalfHeight);

      const adjustedCenters: number[] = [];

      entries.forEach((entry, index) => {
        const desired = Math.min(Math.max(entry.top, minCenter), maxCenter);
        if (index === 0) {
          adjustedCenters.push(desired);
          return;
        }

        const previousCenter = adjustedCenters[index - 1];
        const minimumAllowed = previousCenter + tooltipGap;
        adjustedCenters.push(Math.max(desired, minimumAllowed));
      });

      const lastCenter = adjustedCenters[adjustedCenters.length - 1];
      if (lastCenter > maxCenter) {
        const shiftDown = lastCenter - maxCenter;
        for (let i = 0; i < adjustedCenters.length; i++) {
          adjustedCenters[i] = Math.max(minCenter, adjustedCenters[i] - shiftDown);
        }
      }

      const firstCenter = adjustedCenters[0];
      if (firstCenter < minCenter) {
        const shiftUp = minCenter - firstCenter;
        for (let i = 0; i < adjustedCenters.length; i++) {
          adjustedCenters[i] = Math.min(maxCenter, adjustedCenters[i] + shiftUp);
        }
      }

      entries.forEach((entry, index) => {
        entry.top = adjustedCenters[index];
        // Position tooltips on left side (leftEdge - offset) or right side (rightEdge + offset)
        entry.left = isShowingOnLeft ? minLeftEdge - tooltipOffset : maxRightEdge + tooltipOffset;
      });
    }

    return entries;
  };

  const renderTooltipEntries = (overlays: OverlayAnnotation[]) => {
    if (!tooltipOptions.value.enabled) {
      clearTooltipHost(true);
      return;
    }

    const host = ensureTooltipHost();
    const overlayCanvas = deps.overlayCanvasRef.value;
    if (!host || !overlayCanvas) {
      return;
    }

    host.style.width = '100%';
    host.style.height = '100%';
    host.style.transform = '';
    host.style.transformOrigin = '';

    const mousePos = currentMousePosition.value;
    const entries = computeTooltipEntries(overlays, mousePos?.x, mousePos?.y);

    if (!entries.length) {
      host.innerHTML = '';
      return;
    }

    host.innerHTML = '';

    const labelClass = `${TOOLTIP_ITEM_CLASS}__label`;
    const metaClass = `${TOOLTIP_ITEM_CLASS}__meta`;
    const contentClass = `${TOOLTIP_ITEM_CLASS}__content`;

    entries.forEach(entry => {
      const wrapper = document.createElement('div');
      wrapper.className = TOOLTIP_ITEM_CLASS;
      wrapper.style.position = 'absolute';
      wrapper.style.pointerEvents = 'none';
      wrapper.style.left = `${entry.left}px`;
      wrapper.style.top = `${entry.top}px`;
      if (entry.orientation === 'vertical') {
        // For vertical: translateX(-100%) when showing on left, no horizontal translation when showing on right
        // Always center vertically with translateY(-50%)
        wrapper.style.transform = entry.showOnLeft ? 'translate(-100%, -50%)' : 'translateY(-50%)';
      } else {
        // For horizontal: translateY(-100%) when showing on top, no vertical translation when showing on bottom
        // Always center horizontally with translateX(-50%)
        wrapper.style.transform = entry.showOnTop ? 'translate(-50%, -100%)' : 'translate(-50%, 0)';
      }

      const content = document.createElement('div');
      content.className = contentClass;
      content.style.padding = '8px 16px';
      content.style.borderRadius = '8px';
      content.style.background = 'rgba(15, 23, 42, 0.85)';
      content.style.color = 'white';
      content.style.fontSize = '12px';
      content.style.fontWeight = '600';
      content.style.border = '1px solid rgba(255, 255, 255, 0.1)';
      content.style.boxShadow = '0 8px 20px rgba(15, 23, 42, 0.3)';

      if (entry.orientation === 'vertical') {
        content.style.display = 'inline-flex';
        content.style.alignItems = 'center';
        content.style.flexDirection = 'row';
        content.style.gap = '12px';
        content.style.whiteSpace = 'nowrap';
      } else {
        content.style.display = 'flex';
        content.style.alignItems = 'flex-start';
        content.style.flexDirection = 'column';
        content.style.gap = '8px';
        content.style.whiteSpace = 'normal';
        content.style.wordBreak = 'break-word';
        content.style.boxSizing = 'border-box';
        const maxWidth = entry.maxWidth ?? 0;
        content.style.maxWidth = maxWidth > 0 ? `${maxWidth}px` : '200px';
      }

      const label = document.createElement('span');
      label.className = labelClass;
      label.style.whiteSpace = entry.orientation === 'vertical' ? 'nowrap' : 'normal';
      if (entry.orientation === 'horizontal') {
        label.style.display = 'block';
      }
      label.textContent = entry.overlay.content || '';
      content.appendChild(label);

      const metaText = formatTooltipMeta(entry.overlay);
      if (metaText) {
        const meta = document.createElement('span');
        meta.className = metaClass;
        meta.style.fontSize = '10px';
        meta.style.fontWeight = '400';
        meta.style.letterSpacing = '0.08em';
        meta.style.textTransform = 'uppercase';
        meta.style.opacity = '0.75';
        meta.style.whiteSpace = entry.orientation === 'vertical' ? 'nowrap' : 'normal';
        if (entry.orientation === 'horizontal') {
          meta.style.display = 'block';
          meta.style.marginTop = '-2px';
        }
        meta.textContent = metaText;
        content.appendChild(meta);
      }

      wrapper.appendChild(content);
      host.appendChild(wrapper);
    });
  };

  // Core mouse move processing logic (extracted for throttling)
  const processMouseMove = async (event: MouseEvent) => {
    const canvas = deps.canvasRef.value;
    const overlayCanvas = deps.overlayCanvasRef.value;
    const annotationCanvas = deps.annotationCanvasRef?.value;
    if (!canvas || !overlayCanvas) {
      return;
    }

    if (!mouseLineEnabled.value) {
      clearTooltipHost(true);
    }

    const overlayCtx = overlayCanvas.getContext('2d');
    if (!overlayCtx) {
      return;
    }

    // Use annotation canvas context for annotation detection if available
    const annotationCtx = annotationCanvas?.getContext('2d') || overlayCtx;
    console.log('[Mouse Guide] Using annotation canvas:', !!annotationCanvas, 'for annotation detection');

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const orientation = mouseLineOrientation.value;

    // Store current mouse position for tooltip rendering
    currentMousePosition.value = { x, y };

    const isOverAnnotation = deps.handleAnnotationHover(x, y, annotationCtx);
    const currentAnnotation = isOverAnnotation ? deps.getAnnotationAtPoint(x, y, annotationCtx) : null;
    console.log('[Mouse Guide] Annotation detection - isOverAnnotation:', isOverAnnotation, 'currentAnnotation:', currentAnnotation?.content);
    const annotationChanged = previousHoveredAnnotation.value !== currentAnnotation;
    const hoverStateChanged = previousHoverState.value !== isOverAnnotation;
    const shouldRedraw = mouseLineEnabled.value || hoverStateChanged || annotationChanged;

    let intersections: OverlayAnnotation[] = [];

    if (shouldRedraw) {
      // Build dirty region based on what needs to be redrawn

      // Add previous mouse line position to dirty region if it exists
      if (previousMouseLinePosition && mouseLineEnabled.value) {
        addMouseLineToDirtyRegion(
          previousMouseLinePosition.x,
          previousMouseLinePosition.y,
          previousMouseLinePosition.orientation,
          overlayCanvas
        );
      }

      // Add previous hover annotation to dirty region if it changed
      if (previousHoverAnnotation && annotationChanged) {
        const baseScale = (window.devicePixelRatio * 96) / 72;
        const PDF_POINTS_PER_INCH = 72;
        const SCALE_FACTOR = 1;
        const effectiveDpi = baseScale * PDF_POINTS_PER_INCH * SCALE_FACTOR;
        addAnnotationToDirtyRegion(previousHoverAnnotation, effectiveDpi);
      }

      // Add current mouse line position to dirty region
      if (mouseLineEnabled.value) {
        addMouseLineToDirtyRegion(x, y, orientation, overlayCanvas);
      }

      // Add current hover annotation to dirty region
      if (currentAnnotation) {
        const baseScale = (window.devicePixelRatio * 96) / 72;
        const PDF_POINTS_PER_INCH = 72;
        const SCALE_FACTOR = 1;
        const effectiveDpi = baseScale * PDF_POINTS_PER_INCH * SCALE_FACTOR;
        addAnnotationToDirtyRegion(currentAnnotation, effectiveDpi);
      }

      // Clear only the dirty region instead of the entire canvas
      clearDirtyRegion(overlayCtx);

      if (!isOverAnnotation || annotationChanged) {
        console.log('[Mouse Guide] Clearing HTML overlays - isOverAnnotation:', isOverAnnotation, 'annotationChanged:', annotationChanged);
        deps.clearHtmlOverlays('mouse-guide-annotation-change');
      }

      if (isOverAnnotation) {
        const baseScale = (window.devicePixelRatio * 96) / 72;
        const PDF_POINTS_PER_INCH = 72;
        const SCALE_FACTOR = 1;
        const effectiveDpi = baseScale * PDF_POINTS_PER_INCH * SCALE_FACTOR;

        await deps.drawHoverEffect(overlayCtx, x, y, effectiveDpi);
      }

      if (mouseLineEnabled.value) {
        intersections = orientation === 'vertical'
          ? deps.getAnnotationsIntersectingVerticalLine(x, annotationCtx)
          : deps.getAnnotationsIntersectingHorizontalLine(y, annotationCtx);

        overlayCtx.save();
        overlayCtx.strokeStyle = options.value.mouseLineColor;
        overlayCtx.lineWidth = options.value.mouseLineWidth;
        overlayCtx.beginPath();
        if (orientation === 'vertical') {
          overlayCtx.moveTo(x, 0);
          overlayCtx.lineTo(x, overlayCanvas.height);
        } else {
          overlayCtx.moveTo(0, y);
          overlayCtx.lineTo(overlayCanvas.width, y);
        }
        overlayCtx.stroke();
        overlayCtx.restore();
      }

      // Update tracking variables
      previousMouseLinePosition = mouseLineEnabled.value ? { x, y, orientation } : null;
      previousHoverAnnotation = currentAnnotation;
    } else if (mouseLineEnabled.value) {
      intersections = orientation === 'vertical'
        ? deps.getAnnotationsIntersectingVerticalLine(x, annotationCtx)
        : deps.getAnnotationsIntersectingHorizontalLine(y, annotationCtx);
    }

    previousHoverState.value = isOverAnnotation;
    previousHoveredAnnotation.value = currentAnnotation;

    canvas.style.cursor = isOverAnnotation ? 'pointer' : 'default';

    if (!mouseLineEnabled.value) {
      clearTooltipHost(true);
      return;
    }

    if (!shouldRedraw && !intersections.length) {
      intersections = orientation === 'vertical'
        ? deps.getAnnotationsIntersectingVerticalLine(x, overlayCtx)
        : deps.getAnnotationsIntersectingHorizontalLine(y, overlayCtx);
    }

    if (tooltipOptions.value.enabled) {
      if (intersections.length) {
        renderTooltipEntries(intersections);
      } else {
        clearTooltipHost();
      }
    }

    emitMouseLineIntersections({ x, y, overlays: intersections });
  };

  // Throttled mouse move handler using requestAnimationFrame
  const handleMouseMove = (event: MouseEvent) => {
    // Store the latest mouse event
    pendingMouseEvent = event;

    // If there's already a pending RAF, don't schedule another
    if (rafId !== null) {
      return;
    }

    // Schedule processing for next frame
    rafId = requestAnimationFrame(async () => {
      rafId = null;

      if (pendingMouseEvent) {
        await processMouseMove(pendingMouseEvent);
        pendingMouseEvent = null;
      }
    });
  };

  const handleMouseLeave = (event: MouseEvent) => {
    // Cancel any pending RAF when mouse leaves
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      pendingMouseEvent = null;
    }

    const canvas = deps.canvasRef.value;
    const overlayCanvas = deps.overlayCanvasRef.value;
    if (!canvas || !overlayCanvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX;
    const mouseY = event.clientY;

    const isOutsideCanvas = (
      mouseX < rect.left ||
      mouseX > rect.right ||
      mouseY < rect.top ||
      mouseY > rect.bottom
    );

    if (!isOutsideCanvas) {
      return;
    }

    const overlayCtx = overlayCanvas.getContext('2d');
    if (overlayCtx) {
      // For mouse leave, we do a full clear since we're resetting everything
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }

    // Reset dirty region tracking when mouse leaves
    dirtyRegion = null;
    previousMouseLinePosition = null;
    previousHoverAnnotation = null;

    deps.clearHtmlOverlays();
    previousHoverState.value = false;
    previousHoveredAnnotation.value = null;
    canvas.style.cursor = 'default';
    clearTooltipHost(true);

    if (mouseLineEnabled.value) {
      resetMouseLinePayload();
      options.value.onMouseLineIntersections?.({
        x: Number.NaN,
        y: Number.NaN,
        pageNumber: deps.currentPage.value,
        overlays: [],
        orientation: mouseLineOrientation.value
      });
    }
  };

  // Cleanup function for RAF resources and dirty region tracking
  const cleanup = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      pendingMouseEvent = null;
    }

    // Reset dirty region tracking
    dirtyRegion = null;
    previousMouseLinePosition = null;
    previousHoverAnnotation = null;
  };

  return {
    handleMouseMove,
    handleMouseLeave,
    updateMouseGuideOptions,
    resetMouseLinePayload,
    cleanup
  };
}

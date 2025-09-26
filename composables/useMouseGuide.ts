import { ref, computed, shallowRef } from 'vue';
import type { Ref } from 'vue';
import type { OverlayAnnotation } from '@/types/annotations';
import { convertCoordinates } from './useAnnotationGeometry';

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
  onMouseLineIntersections?: (context: { x: number; pageNumber: number; overlays: OverlayAnnotation[] }) => void;
  tooltip: MouseLineTooltipOptions;
}

interface MouseGuideDependencies {
  canvasRef: Ref<HTMLCanvasElement | null>;
  overlayCanvasRef: Ref<HTMLCanvasElement | null>;
  htmlOverlayContainer: Ref<HTMLElement | null>;
  currentPage: Ref<number>;
  handleAnnotationHover: (x: number, y: number, ctx: CanvasRenderingContext2D) => boolean;
  getAnnotationAtPoint: (x: number, y: number, ctx: CanvasRenderingContext2D) => OverlayAnnotation | null;
  drawHoverEffect: (ctx: CanvasRenderingContext2D, x: number, y: number, effectiveDpi: number) => Promise<void>;
  clearHtmlOverlays: () => void;
  getAnnotationsIntersectingVerticalLine: (x: number, ctx: CanvasRenderingContext2D) => OverlayAnnotation[];
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
  left: number;
  top: number;
  rightEdge: number;
}

export function useMouseGuide(
  deps: MouseGuideDependencies,
  initialOptions?: Partial<MouseLineOptions>
) {
  const initialTooltipOptions: MouseLineTooltipOptions = {
    ...DEFAULT_TOOLTIP_OPTIONS,
    ...(initialOptions?.tooltip ?? {})
  };

  const options = ref<MouseLineOptions>({
    enableMouseLine: initialOptions?.enableMouseLine ?? false,
    mouseLineColor: initialOptions?.mouseLineColor ?? DEFAULT_MOUSE_LINE_COLOR,
    mouseLineWidth: initialOptions?.mouseLineWidth ?? DEFAULT_MOUSE_LINE_WIDTH,
    onMouseLineIntersections: initialOptions?.onMouseLineIntersections,
    tooltip: initialTooltipOptions
  });

  const previousHoverState = ref(false);
  const previousHoveredAnnotation = ref<OverlayAnnotation | null>(null);
  const previousMouseLinePayload = ref<{ pageNumber: number; x: number; overlayIds: string[] } | null>(null);
  const tooltipHost = shallowRef<HTMLElement | null>(null);

  const mouseLineEnabled = computed(() => options.value.enableMouseLine);
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

    options.value = {
      ...options.value,
      ...nextOptions,
      tooltip: nextTooltip
    };

    if (!options.value.tooltip.enabled) {
      clearTooltipHost(true);
    }
  };

  const emitMouseLineIntersections = (payload: { x: number; overlays: OverlayAnnotation[] }) => {
    const handler = options.value.onMouseLineIntersections;
    if (!handler) {
      return;
    }

    const overlayIds = payload.overlays.map(annotation => annotation['@id'] || `${annotation.page}-${annotation.line}`);
    const roundedX = Number(payload.x.toFixed(2));
    const previousPayload = previousMouseLinePayload.value;

    const hasChanged = !previousPayload ||
      previousPayload.pageNumber !== deps.currentPage.value ||
      previousPayload.overlayIds.length !== overlayIds.length ||
      overlayIds.some((id, index) => id !== previousPayload.overlayIds[index]) ||
      previousPayload.x !== roundedX;

    if (hasChanged) {
      previousMouseLinePayload.value = {
        pageNumber: deps.currentPage.value,
        x: roundedX,
        overlayIds
      };

      handler({
        x: payload.x,
        pageNumber: deps.currentPage.value,
        overlays: payload.overlays
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

  const computeTooltipEntries = (overlays: OverlayAnnotation[]): TooltipEntry[] => {
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

      const displayRightEdge = maxX * scaleX;
      const displayCenterY = (minY + (maxY - minY) / 2) * scaleY;

      entries.push({
        id,
        overlay,
        left: displayRightEdge,
        top: displayCenterY,
        rightEdge: displayRightEdge
      });
    }

    if (!entries.length) {
      return [];
    }

    const maxRightEdge = Math.max(...entries.map(entry => entry.rightEdge));

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
      entry.left = maxRightEdge + tooltipOffset;
    });

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

    const entries = computeTooltipEntries(overlays);

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
      wrapper.style.transform = 'translateY(-50%)';

      const content = document.createElement('div');
      content.className = contentClass;
      content.style.display = 'inline-flex';
      content.style.alignItems = 'center';
      content.style.gap = '12px';
      content.style.padding = '8px 16px';
      content.style.borderRadius = '8px';
      content.style.background = 'rgba(15, 23, 42, 0.85)';
      content.style.color = 'white';
      content.style.fontSize = '12px';
      content.style.fontWeight = '600';
      content.style.border = '1px solid rgba(255, 255, 255, 0.1)';
      content.style.boxShadow = '0 8px 20px rgba(15, 23, 42, 0.3)';
      content.style.whiteSpace = 'nowrap';

      const label = document.createElement('span');
      label.className = labelClass;
      label.style.whiteSpace = 'nowrap';
      label.textContent = entry.overlay.content || '';
      content.appendChild(label);

      const metaText = formatTooltipMeta(entry.overlay);
      if (metaText) {
        const meta = document.createElement('span');
        meta.className = metaClass;
        meta.style.whiteSpace = 'nowrap';
        meta.style.fontSize = '10px';
        meta.style.fontWeight = '400';
        meta.style.letterSpacing = '0.08em';
        meta.style.textTransform = 'uppercase';
        meta.style.opacity = '0.75';
        meta.textContent = metaText;
        content.appendChild(meta);
      }

      wrapper.appendChild(content);
      host.appendChild(wrapper);
    });
  };

  const handleMouseMove = async (event: MouseEvent) => {
    const canvas = deps.canvasRef.value;
    const overlayCanvas = deps.overlayCanvasRef.value;
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

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const isOverAnnotation = deps.handleAnnotationHover(x, y, overlayCtx);
    const currentAnnotation = isOverAnnotation ? deps.getAnnotationAtPoint(x, y, overlayCtx) : null;
    const annotationChanged = previousHoveredAnnotation.value !== currentAnnotation;
    const hoverStateChanged = previousHoverState.value !== isOverAnnotation;
    const shouldRedraw = mouseLineEnabled.value || hoverStateChanged || annotationChanged;

    let intersections: OverlayAnnotation[] = [];

    if (shouldRedraw) {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      if (!isOverAnnotation || annotationChanged) {
        deps.clearHtmlOverlays();
      }

      if (isOverAnnotation) {
        const baseScale = (window.devicePixelRatio * 96) / 72;
        const PDF_POINTS_PER_INCH = 72;
        const SCALE_FACTOR = 1;
        const effectiveDpi = baseScale * PDF_POINTS_PER_INCH * SCALE_FACTOR;

        await deps.drawHoverEffect(overlayCtx, x, y, effectiveDpi);
      }

      if (mouseLineEnabled.value) {
        intersections = deps.getAnnotationsIntersectingVerticalLine(x, overlayCtx);

        overlayCtx.save();
        overlayCtx.strokeStyle = options.value.mouseLineColor;
        overlayCtx.lineWidth = options.value.mouseLineWidth;
        overlayCtx.beginPath();
        overlayCtx.moveTo(x, 0);
        overlayCtx.lineTo(x, overlayCanvas.height);
        overlayCtx.stroke();
        overlayCtx.restore();
      }
    } else if (mouseLineEnabled.value) {
      intersections = deps.getAnnotationsIntersectingVerticalLine(x, overlayCtx);
    }

    previousHoverState.value = isOverAnnotation;
    previousHoveredAnnotation.value = currentAnnotation;

    canvas.style.cursor = isOverAnnotation ? 'pointer' : 'default';

    if (!mouseLineEnabled.value) {
      clearTooltipHost(true);
      return;
    }

    if (!shouldRedraw && !intersections.length) {
      intersections = deps.getAnnotationsIntersectingVerticalLine(x, overlayCtx);
    }

    if (tooltipOptions.value.enabled) {
      if (intersections.length) {
        renderTooltipEntries(intersections);
      } else {
        clearTooltipHost();
      }
    }

    emitMouseLineIntersections({ x, overlays: intersections });
  };

  const handleMouseLeave = (event: MouseEvent) => {
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
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }

    deps.clearHtmlOverlays();
    previousHoverState.value = false;
    previousHoveredAnnotation.value = null;
    canvas.style.cursor = 'default';
    clearTooltipHost(true);

    if (mouseLineEnabled.value) {
      resetMouseLinePayload();
      options.value.onMouseLineIntersections?.({
        x: Number.NaN,
        pageNumber: deps.currentPage.value,
        overlays: []
      });
    }
  };

  return {
    handleMouseMove,
    handleMouseLeave,
    updateMouseGuideOptions,
    resetMouseLinePayload
  };
}

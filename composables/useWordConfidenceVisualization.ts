import { ref, type Ref } from 'vue';
import type { OverlayAnnotation } from '@/types/annotations';
import { useAnnotationStyling } from './useAnnotationStyling';

interface ConfidenceSpan {
  offset: number;
  length: number;
  confidence: number;
  text?: string;
}

export function useWordConfidenceVisualization() {
  const { getConfidenceColors, clamp } = useAnnotationStyling();

  const activeWordVisualization = ref<HTMLElement | null>(null);

  const getConfidenceColorForValue = (confidence: number, highlight = false): string => {
    const normalized = Math.pow(clamp(confidence, 0, 1), 6);
    const hue = Math.min(120, Math.max(0, normalized * 120));
    const baseLightness = highlight ? 50 - normalized * 10 : 60 - normalized * 12;
    const alpha = clamp((highlight ? 0.5 : 0.3) + normalized * 0.4, 0, 1);

    return `hsla(${hue}, 90%, ${baseLightness}%, ${alpha})`;
  };

  const createWordConfidenceVisualization = (
    annotation: OverlayAnnotation,
    containerElement: HTMLElement,
    rect: DOMRect
  ): HTMLElement | null => {
    const confidenceSpans = annotation.semanticProperties?.confidenceSpans as ConfidenceSpan[] | undefined;
    const content = annotation.content || '';

    if (!confidenceSpans || confidenceSpans.length === 0 || !content) {
      return null;
    }

    // Create the visualization container
    const container = document.createElement('div');
    container.className = 'word-confidence-visualization';
    container.style.position = 'absolute';
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.top}px`;
    container.style.minWidth = `${rect.width}px`;
    container.style.minHeight = `${rect.height}px`;
    container.style.pointerEvents = 'none';
    container.style.zIndex = '3000';
    container.style.display = 'flex';
    container.style.alignItems = 'flex-start';
    container.style.justifyContent = 'flex-start';
    container.style.padding = '4px';
    container.style.boxSizing = 'border-box';
    container.style.overflow = 'visible';

    // Create text container with spans for each confidence region
    const textContainer = document.createElement('div');
    textContainer.style.fontSize = Math.min(14, Math.max(10, rect.height / 2.5)) + 'px';
    textContainer.style.fontWeight = '600';
    textContainer.style.color = '#1f2937';
    textContainer.style.textAlign = 'left';
    textContainer.style.lineHeight = '1.3';
    textContainer.style.wordBreak = 'break-word';
    textContainer.style.width = `${rect.width - 8}px`; // Constrain to cell width (account for padding)
    textContainer.style.overflow = 'visible';
    textContainer.style.display = 'flex';
    textContainer.style.flexWrap = 'wrap';
    textContainer.style.justifyContent = 'flex-start';
    textContainer.style.alignItems = 'flex-start';
    textContainer.style.gap = '1px';

    // Sort spans by offset to ensure proper text reconstruction
    const sortedSpans = [...confidenceSpans].sort((a, b) => a.offset - b.offset);

    let currentOffset = 0;

    sortedSpans.forEach((span) => {
      // Add any text before this span (if there are gaps)
      if (span.offset > currentOffset) {
        const gapText = content.substring(currentOffset, span.offset);
        if (gapText) {
          const gapSpan = document.createElement('span');
          gapSpan.textContent = gapText;
          gapSpan.style.backgroundColor = 'rgba(148, 163, 184, 0.3)'; // Default gray for unconfidenced text
          gapSpan.style.padding = '2px 3px';
          gapSpan.style.borderRadius = '3px';
          gapSpan.style.margin = '1px';
          gapSpan.style.display = 'inline-block';
          gapSpan.style.whiteSpace = gapText.length > 15 ? 'normal' : 'nowrap';
          gapSpan.style.wordBreak = gapText.length > 15 ? 'break-word' : 'normal';
          gapSpan.style.border = '1px solid rgba(148, 163, 184, 0.4)';
          gapSpan.title = `"${gapText}" - No confidence data`;
          textContainer.appendChild(gapSpan);
        }
      }

      // Add the span with confidence coloring
      const spanElement = document.createElement('span');
      const spanText = span.text || content.substring(span.offset, span.offset + span.length);
      spanElement.textContent = spanText;
      spanElement.style.backgroundColor = getConfidenceColorForValue(span.confidence, true);
      spanElement.style.padding = '2px 3px';
      spanElement.style.borderRadius = '3px';
      spanElement.style.margin = '1px';
      spanElement.style.border = '1px solid rgba(0, 0, 0, 0.15)';
      spanElement.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.12)';
      spanElement.style.display = 'inline-block';
      // Allow wrapping for long words, but prefer keeping words together
      spanElement.style.whiteSpace = spanText.length > 15 ? 'normal' : 'nowrap';
      spanElement.style.wordBreak = spanText.length > 15 ? 'break-word' : 'normal';

      // Add confidence value as a tooltip
      spanElement.title = `"${spanElement.textContent}" - Confidence: ${(span.confidence * 100).toFixed(1)}%`;

      textContainer.appendChild(spanElement);

      currentOffset = span.offset + span.length;
    });

    // Add any remaining text after the last span
    if (currentOffset < content.length) {
      const remainingText = content.substring(currentOffset);
      if (remainingText) {
        const remainingSpan = document.createElement('span');
        remainingSpan.textContent = remainingText;
        remainingSpan.style.backgroundColor = 'rgba(148, 163, 184, 0.3)';
        remainingSpan.style.padding = '2px 3px';
        remainingSpan.style.borderRadius = '3px';
        remainingSpan.style.margin = '1px';
        remainingSpan.style.display = 'inline-block';
        remainingSpan.style.whiteSpace = remainingText.length > 15 ? 'normal' : 'nowrap';
        remainingSpan.style.wordBreak = remainingText.length > 15 ? 'break-word' : 'normal';
        remainingSpan.style.border = '1px solid rgba(148, 163, 184, 0.4)';
        remainingSpan.title = `"${remainingText}" - No confidence data`;
        textContainer.appendChild(remainingSpan);
      }
    }

    container.appendChild(textContainer);

    // Add a subtle background to make the visualization stand out
    container.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
    container.style.border = '2px solid rgba(59, 130, 246, 0.5)';
    container.style.borderRadius = '4px';
    container.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';

    return container;
  };

  const showWordConfidenceVisualization = (
    annotation: OverlayAnnotation,
    containerElement: HTMLElement,
    rect: DOMRect
  ): void => {
    clearWordConfidenceVisualization();

    const visualization = createWordConfidenceVisualization(annotation, containerElement, rect);
    if (visualization) {
      containerElement.appendChild(visualization);
      activeWordVisualization.value = visualization;
    }
  };

  const clearWordConfidenceVisualization = (): void => {
    if (activeWordVisualization.value) {
      activeWordVisualization.value.remove();
      activeWordVisualization.value = null;
    }
  };

  const hasWordLevelConfidence = (annotation: OverlayAnnotation): boolean => {
    const confidenceSpans = annotation.semanticProperties?.confidenceSpans as ConfidenceSpan[] | undefined;
    return !!(confidenceSpans && confidenceSpans.length > 0);
  };

  return {
    showWordConfidenceVisualization,
    clearWordConfidenceVisualization,
    hasWordLevelConfidence,
    activeWordVisualization: activeWordVisualization as Ref<HTMLElement | null>
  };
}
import type { OverlayAnnotation } from '@/types/annotations';

export const useAnnotationStyling = () => {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const parseConfidenceValue = (annotation: OverlayAnnotation): number | null => {
    const rawConfidence = annotation.semanticProperties?.confidence;
    if (rawConfidence === undefined || rawConfidence === null) {
      return null;
    }

    const numericConfidence = typeof rawConfidence === 'number'
      ? rawConfidence
      : parseFloat(String(rawConfidence));

    if (!Number.isFinite(numericConfidence)) {
      return null;
    }

    return clamp(numericConfidence, 0, 1);
  };

  const getConfidenceColors = (
    annotation: OverlayAnnotation,
    options: { highlight?: boolean; disableConfidenceColors?: boolean } = {}
  ) => {
    const confidence = parseConfidenceValue(annotation);
    const highlight = options.highlight ?? false;
    const disableConfidenceColors = options.disableConfidenceColors ?? false;

    // When confidence colors are disabled, use neutral gray colors
    if (disableConfidenceColors) {
      if (highlight) {
        // Highlighted: fluorescent yellow
        return {
          fill: 'rgba(255, 255, 0, 0.5)',
          stroke: 'rgba(255, 255, 0, 1.0)'
        };
      } else {
        // Normal: subtle gray
        return {
          fill: 'rgba(200, 200, 200, 0.15)',
          stroke: 'rgba(148, 163, 184, 0.45)'
        };
      }
    }

    if (confidence === null) {
      const strokeAlpha = highlight ? 0.7 : 0.45;
      return {
        fill: 'rgba(255, 255, 255, 0)',
        stroke: `rgba(148, 163, 184, ${strokeAlpha})`
      };
    }

    const normalized = Math.pow(confidence, 6);
    const hue = Math.min(120, Math.max(0, normalized * 120));
    const baseLightness = highlight ? 50 - normalized * 10 : 60 - normalized * 12;
    const fillAlpha = clamp((highlight ? 0.35 : 0.22) + normalized * 0.25, 0, 1);
    const strokeAlpha = clamp((highlight ? 0.7 : 0.55) + normalized * 0.35, 0, 1);

    return {
      fill: `hsla(${hue}, 90%, ${baseLightness}%, ${fillAlpha})`,
      stroke: `hsla(${hue}, 92%, 32%, ${strokeAlpha})`
    };
  };

  return {
    getConfidenceColors,
    parseConfidenceValue,
    clamp
  };
};

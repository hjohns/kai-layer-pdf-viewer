import { ref, computed } from 'vue';
import type { MouseLineConfig } from '@/composables/usePdf';

export type LineMode = 'vertical' | 'horizontal' | 'none';

export interface UseMouseLineModeOptions {
  /**
   * Initial line mode
   * @default 'vertical'
   */
  initialMode?: LineMode;

  /**
   * Throttle delay in milliseconds for toggle operations
   * @default 150
   */
  throttleMs?: number;

  /**
   * Custom configuration for vertical line
   */
  verticalConfig?: Partial<MouseLineConfig>;

  /**
   * Custom configuration for horizontal line
   */
  horizontalConfig?: Partial<MouseLineConfig>;
}

/**
 * Composable for managing mouse line mode (vertical/horizontal/none) with cycling toggle
 * and pre-configured mouse line settings.
 *
 * @example
 * ```vue
 * <script setup>
 * const { lineMode, toggleLineMode, mouseLineConfig } = useMouseLineMode();
 * </script>
 *
 * <template>
 *   <button @click="toggleLineMode">
 *     {{ lineMode === 'vertical' ? '│ Vertical' : lineMode === 'horizontal' ? '── Horizontal' : '✕ No Line' }}
 *   </button>
 *   <PDFViewer :mouse-line="mouseLineConfig" />
 * </template>
 * ```
 */
export function useMouseLineMode(options: UseMouseLineModeOptions = {}) {
  const {
    initialMode = 'vertical',
    throttleMs = 150,
    verticalConfig = {},
    horizontalConfig = {}
  } = options;

  // State
  const lineMode = ref<LineMode>(initialMode);
  let lastToggleTime = 0;

  // Default configurations with user overrides
  const mouseLineConfigs = {
    none: { enabled: false },
    vertical: {
      enabled: true,
      color: 'rgba(249, 115, 22, 0.8)',
      width: 2,
      tooltips: true,
      orientation: 'vertical',
      ...verticalConfig
    },
    horizontal: {
      enabled: true,
      color: 'rgba(249, 115, 22, 0.8)',
      width: 2,
      tooltips: true,
      orientation: 'horizontal',
      ...horizontalConfig
    }
  } as const;

  // Computed mouse line configuration based on current mode
  const mouseLineConfig = computed(() => mouseLineConfigs[lineMode.value]);

  /**
   * Cycles through line modes: vertical -> horizontal -> none -> vertical
   * Includes throttling to prevent rapid toggling
   */
  const toggleLineMode = () => {
    const now = Date.now();
    if (now - lastToggleTime < throttleMs) return;
    lastToggleTime = now;

    const modes: LineMode[] = ['vertical', 'horizontal', 'none'];
    const currentIndex = modes.indexOf(lineMode.value);
    lineMode.value = modes[(currentIndex + 1) % modes.length];
  };

  /**
   * Sets the line mode directly
   */
  const setLineMode = (mode: LineMode) => {
    lineMode.value = mode;
  };

  /**
   * Helper to check if mouse line intersections should be processed
   * based on current mode and orientation
   */
  const shouldProcessIntersections = (orientation: 'vertical' | 'horizontal'): boolean => {
    if (lineMode.value === 'none') return false;
    if (lineMode.value === 'vertical' && orientation !== 'vertical') return false;
    if (lineMode.value === 'horizontal' && orientation !== 'horizontal') return false;
    return true;
  };

  return {
    lineMode,
    mouseLineConfig,
    toggleLineMode,
    setLineMode,
    shouldProcessIntersections
  };
}
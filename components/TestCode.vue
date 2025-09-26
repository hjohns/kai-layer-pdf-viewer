<template>
  <pre class="bg-gray-100 p-4 rounded-lg overflow-x-auto">
    <code ref="codeBlock" :class="`language-${language}`">{{ code }}</code>
  </pre>
</template>

<script setup lang="ts">
const props = defineProps({
  code: {
    type: String,
    required: true
  },
  language: {
    type: String,
    default: 'markup'
  }
});

const codeBlock = ref<HTMLElement | null>(null);

onMounted(async () => {
  if (!codeBlock.value) {
    console.warn('[TestCode] codeBlock ref missing, skipping highlight');
    return;
  }

  try {
    const language = props.language?.toLowerCase() || 'markup';
    console.log('[TestCode] Initializing Prism highlight', { language });

    await import('prismjs/themes/prism.css');
    console.log('[TestCode] Prism CSS loaded');

    const prismModule = await import('prismjs');
    const Prism = prismModule.default || prismModule;
    console.log('[TestCode] Prism core loaded', { hasHighlightElement: typeof Prism?.highlightElement === 'function' });

    if (language && language !== 'markup') {
      try {
        console.log('[TestCode] Loading Prism language component', { language });
        await import(/* @vite-ignore */ `prismjs/components/prism-${language}`);
        console.log('[TestCode] Prism language component loaded', { language });
      } catch (componentError) {
        console.warn(`[TestCode] Prism language component not found, falling back to markup`, { language, componentError });
      }
    }

    Prism.highlightElement(codeBlock.value);
    console.log('[TestCode] Highlight applied');
  } catch (error) {
    console.error('[TestCode] Failed to load PrismJS', error);
  }
});
</script>

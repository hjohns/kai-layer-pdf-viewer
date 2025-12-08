<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';

interface Point {
  x: number;
  y: number;
}

interface PolygonInput {
  id: number;
  wkt: string;
  color: string;
  error: string;
}

const polygons = ref<PolygonInput[]>([
  {
    id: 1,
    wkt: 'POLYGON((1.0218 0.3714, 2.3187 0.363, 2.3187 0.6681, 1.0213 0.6681, 1.0218 0.3714))',
    color: '#ff0000',
    error: ''
  }
]);
let nextId = 2;

const scale = ref(96);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const showLabels = ref(true);

const pageWidth = 8.27; // inches (A4: 210mm)
const pageHeight = 11.69; // inches (A4: 297mm)

// Color palette for polygons
const colors = [
  '#ff0000', // red
  '#00ff00', // green
  '#0000ff', // blue
  '#ff00ff', // magenta
  '#ffff00', // yellow
  '#00ffff', // cyan
  '#ff8800', // orange
  '#8800ff', // purple
  '#00ff88', // mint
  '#ff0088', // pink
];

function parsePolygon(polyStr: string): Point[] {
  try {
    const match = polyStr.match(/\(\((.*?)\)\)/);
    if (!match) {
      throw new Error('Invalid polygon format');
    }
    const coordStr = match[1];
    const pairs = coordStr.split(',');
    return pairs.map(pair => {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      if (isNaN(x) || isNaN(y)) {
        throw new Error('Invalid coordinate values');
      }
      return { x, y };
    });
  } catch (e) {
    throw new Error('Invalid polygon format. Expected: POLYGON((x1 y1, x2 y2, ...))');
  }
}

function addPolygon() {
  const colorIndex = (polygons.value.length) % colors.length;
  polygons.value.push({
    id: nextId++,
    wkt: '',
    color: colors[colorIndex],
    error: ''
  });
}

function removePolygon(id: number) {
  polygons.value = polygons.value.filter(p => p.id !== id);
  updateVisualization();
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function updateVisualization() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set canvas size based on page dimensions
  canvas.width = pageWidth * scale.value;
  canvas.height = pageHeight * scale.value;

  // Draw page background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid lines (every inch)
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;

  // Vertical lines
  for (let i = 0; i <= pageWidth; i++) {
    ctx.beginPath();
    ctx.moveTo(i * scale.value, 0);
    ctx.lineTo(i * scale.value, canvas.height);
    ctx.stroke();
  }

  // Horizontal lines
  for (let i = 0; i <= pageHeight; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * scale.value);
    ctx.lineTo(canvas.width, i * scale.value);
    ctx.stroke();
  }

  // Draw inch markers
  ctx.fillStyle = '#666';
  ctx.font = '10px Arial';
  for (let i = 1; i <= pageWidth; i++) {
    ctx.fillText(i + '"', i * scale.value - 8, 12);
  }
  for (let i = 1; i <= pageHeight; i++) {
    ctx.fillText(i + '"', 5, i * scale.value + 4);
  }

  // Draw all polygons
  polygons.value.forEach((polygon) => {
    polygon.error = '';

    if (!polygon.wkt.trim()) {
      return; // Skip empty polygons
    }

    let polygonCoords: Point[];
    try {
      polygonCoords = parsePolygon(polygon.wkt);
    } catch (e) {
      polygon.error = 'Error: ' + (e as Error).message;
      return;
    }

    // Draw the polygon
    ctx.beginPath();
    polygonCoords.forEach((point, index) => {
      const x = point.x * scale.value;
      const y = point.y * scale.value;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();

    // Fill the polygon with transparency
    ctx.fillStyle = hexToRgba(polygon.color, 0.3);
    ctx.fill();

    // Stroke the polygon
    ctx.strokeStyle = polygon.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw corner points
    polygonCoords.forEach(point => {
      const x = point.x * scale.value;
      const y = point.y * scale.value;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = polygon.color;
      ctx.fill();
    });

    // Calculate and display dimensions (for rectangular polygons)
    if (showLabels.value && polygonCoords.length >= 4) {
      const width = Math.abs(polygonCoords[1].x - polygonCoords[0].x);
      const height = Math.abs(polygonCoords[2].y - polygonCoords[1].y);

      // Draw dimension labels
      const centerX = (polygonCoords[0].x + polygonCoords[1].x) / 2 * scale.value;
      const centerY = (polygonCoords[0].y + polygonCoords[2].y) / 2 * scale.value;

      ctx.fillStyle = polygon.color;
      ctx.font = 'bold 14px Arial';
      ctx.fillText(`${width.toFixed(3)}" × ${height.toFixed(3)}"`, centerX - 40, centerY);

      // Draw position label
      ctx.fillText(
        `Position: (${polygonCoords[0].x.toFixed(3)}", ${polygonCoords[0].y.toFixed(3)}")`,
        polygonCoords[0].x * scale.value,
        polygonCoords[0].y * scale.value - 10
      );
    }
  });
}

onMounted(() => {
  updateVisualization();
});

// Watch for changes with debouncing on polygon inputs
let timeout: ReturnType<typeof setTimeout>;
watch(polygons, () => {
  clearTimeout(timeout);
  timeout = setTimeout(updateVisualization, 500);
}, { deep: true });

// Watch for immediate updates on scale changes
watch(scale, () => {
  updateVisualization();
});

// Watch for immediate updates on label visibility changes
watch(showLabels, () => {
  updateVisualization();
});
</script>

<template>
  <TestPanel
    heading="PDF Region Visualiser"
    description="Utility to visualize WKT POLYGON coordinates on an A4 page (8.27&quot; × 11.69&quot;)"
  >
    <div class="visualiser-container">
      <div class="info-panel">
        <div class="polygons-section">
          <div class="section-header">
            <strong>Polygon coordinates (in inches):</strong>
            <button @click="addPolygon" class="add-btn">
              + Add Polygon
            </button>
          </div>

          <div
            v-for="(polygon, index) in polygons"
            :key="polygon.id"
            class="polygon-item"
          >
            <div class="polygon-header">
              <span class="polygon-label">
                <span
                  class="color-indicator"
                  :style="{ backgroundColor: polygon.color }"
                ></span>
                Polygon {{ index + 1 }}
              </span>
              <button
                v-if="polygons.length > 1"
                @click="removePolygon(polygon.id)"
                class="remove-btn"
              >
                Remove
              </button>
            </div>
            <textarea
              v-model="polygon.wkt"
              rows="3"
              class="polygon-input"
              placeholder="POLYGON((x1 y1, x2 y2, ...))"
            />
            <div v-if="polygon.error" class="error-message">{{ polygon.error }}</div>
          </div>
        </div>

        <div class="info-section">
          <strong>Origin:</strong> Top-left corner (0, 0)<br>
          <strong>Page size:</strong> 8.27" × 11.69" (A4)
        </div>

        <div class="controls">
          <label>
            Scale (pixels per inch):
            <input
              v-model.number="scale"
              type="number"
              min="50"
              max="200"
              step="10"
              class="scale-input"
            >
          </label>
          <button @click="showLabels = !showLabels" class="toggle-btn">
            {{ showLabels ? 'Hide Labels' : 'Show Labels' }}
          </button>
          <button @click="updateVisualization" class="update-btn">
            Update Visualization
          </button>
        </div>
      </div>

      <div class="canvas-container">
        <canvas ref="canvasRef" class="visualization-canvas"></canvas>
      </div>
    </div>
  </TestPanel>
</template>

<style scoped>
.visualiser-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

.info-panel {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.info-section {
  padding: 15px;
  background: #f0f0f0;
  border-radius: 5px;
}

.polygons-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.polygon-item {
  padding: 15px;
  background: #f0f0f0;
  border-radius: 5px;
  border-left: 4px solid #ccc;
}

.polygon-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.polygon-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.color-indicator {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: 2px solid #333;
}

.polygon-input {
  width: 100%;
  padding: 8px;
  font-family: monospace;
  font-size: 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  resize: vertical;
}

.add-btn {
  padding: 6px 12px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
  transition: background 0.2s;
}

.add-btn:hover {
  background: #218838;
}

.remove-btn {
  padding: 4px 10px;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.remove-btn:hover {
  background: #c82333;
}

.error-message {
  color: #d32f2f;
  margin-top: 8px;
  font-weight: 500;
}

.controls {
  display: flex;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
}

.scale-input {
  width: 80px;
  padding: 5px;
  margin-left: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.toggle-btn {
  padding: 8px 15px;
  background: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.toggle-btn:hover {
  background: #5a6268;
}

.update-btn {
  padding: 8px 15px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.update-btn:hover {
  background: #0056b3;
}

.canvas-container {
  display: flex;
  justify-content: center;
  overflow: auto;
}

.visualization-canvas {
  border: 2px solid #333;
  background: white;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}
</style>
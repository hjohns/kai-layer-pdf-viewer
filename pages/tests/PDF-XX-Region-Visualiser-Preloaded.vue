<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';

definePageMeta({
  middleware: [
    (route) => {
      if (!route.query.page) {
        return navigateTo({ ...route, query: { ...route.query, page: '8' } });
      }
    }
  ]
});

interface Point {
  x: number;
  y: number;
}

interface PolygonInput {
  id: number;
  wkt: string;
  color: string;
  error: string;
  text?: string;
}

// Parse CSV data and extract polygons with text
function loadPolygonsFromCSV(): PolygonInput[] {
  const csvData = `rowBandWkt,wordWkt,text
"POLYGON((0 1.5473770833333333333333335,8.27 1.5473770833333333333333335,8.27 1.75768875,0 1.75768875,0 1.5473770833333333333333335))","POLYGON((0.5171 1.5933,0.9191 1.5933,0.9185 1.7271,0.5166 1.7277,0.5171 1.5933))",Sample
"POLYGON((0 1.75768875,8.27 1.75768875,8.27 1.95163875,0 1.95163875,0 1.75768875))","POLYGON((6.0605 1.7855,6.7562 1.7854,6.7555 1.9091,6.0604 1.9095,6.0605 1.7855))",S17-Se32069
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((5.4442 1.981,5.591 1.9806,5.5906 2.1128,5.4438 2.1128,5.4442 1.981))","26,"
"POLYGON((0 1.3220562500000000000000005,8.27 1.3220562500000000000000005,8.27 1.5473770833333333333333335,0 1.5473770833333333333333335,0 1.3220562500000000000000005))","POLYGON((6.0616 1.313,6.8643 1.3165,6.8639 1.437,6.0616 1.4315,6.0616 1.313))",0382_SW024_1
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((0.7994 1.9792,1.2679 1.9789,1.2679 2.1174,0.7987 2.1178,0.7994 1.9792))",Sampled
"POLYGON((0 1.75768875,8.27 1.75768875,8.27 1.95163875,0 1.95163875,0 1.75768875))","POLYGON((1.306 1.785,1.6832 1.7836,1.6826 1.9255,1.3056 1.9269,1.306 1.785))",Sample
"POLYGON((0 1.3220562500000000000000005,8.27 1.3220562500000000000000005,8.27 1.5473770833333333333333335,0 1.5473770833333333333333335,0 1.3220562500000000000000005))","POLYGON((0.8667 1.3692,1.2574 1.3674,1.2564 1.5018,0.8658 1.5018,0.8667 1.3692))",Sample
"POLYGON((0 1.3220562500000000000000005,8.27 1.3220562500000000000000005,8.27 1.5473770833333333333333335,0 1.5473770833333333333333335,0 1.3220562500000000000000005))","POLYGON((4.3417 1.431,4.6659 1.4309,4.6659 1.5442,4.3412 1.5431,4.3417 1.431))",70925
"POLYGON((0 1.75768875,8.27 1.75768875,8.27 1.95163875,0 1.95163875,0 1.75768875))","POLYGON((0.5169 1.7842,0.9612 1.7851,0.961 1.927,0.5166 1.9247,0.5169 1.7842))",Eurofins
"POLYGON((0 1.3220562500000000000000005,8.27 1.3220562500000000000000005,8.27 1.5473770833333333333333335,0 1.5473770833333333333333335,0 1.3220562500000000000000005))","POLYGON((5.2025 1.4319,5.5283 1.4313,5.5283 1.5438,5.2022 1.5425,5.2025 1.4319))",70925
"POLYGON((0 1.5473770833333333333333335,8.27 1.5473770833333333333333335,8.27 1.75768875,0 1.75768875,0 1.5473770833333333333333335))","POLYGON((6.0568 1.5987,6.385 1.5982,6.385 1.7114,6.056 1.7106,6.0568 1.5987))",Water
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((4.7703 1.9818,5.0246 1.9801,5.0239 2.1113,4.7698 2.1116,4.7703 1.9818))",2017
"POLYGON((0 1.3220562500000000000000005,8.27 1.3220562500000000000000005,8.27 1.5473770833333333333333335,0 1.5473770833333333333333335,0 1.3220562500000000000000005))","POLYGON((6.9216 1.311,7.7269 1.3143,7.7263 1.439,6.9215 1.4323,6.9216 1.311))",0382_SW025_1
"POLYGON((0 1.3220562500000000000000005,8.27 1.3220562500000000000000005,8.27 1.5473770833333333333333335,0 1.5473770833333333333333335,0 1.3220562500000000000000005))","POLYGON((4.3413 1.3135,5.1457 1.3167,5.1457 1.4359,4.3409 1.4312,4.3413 1.3135))",0382_SW022_1
"POLYGON((0 1.5473770833333333333333335,8.27 1.5473770833333333333333335,8.27 1.75768875,0 1.75768875,0 1.5473770833333333333333335))","POLYGON((0.9564 1.5929,1.2903 1.5926,1.2896 1.7258,0.9559 1.7276,0.9564 1.5929))",Matrix
"POLYGON((0 1.3220562500000000000000005,8.27 1.3220562500000000000000005,8.27 1.5473770833333333333333335,0 1.5473770833333333333333335,0 1.3220562500000000000000005))","POLYGON((5.1987 1.3135,6.0023 1.3159,6.0023 1.4384,5.1987 1.432,5.1987 1.3135))",0382_SW023_1
"POLYGON((0 1.75768875,8.27 1.75768875,8.27 1.95163875,0 1.95163875,0 1.75768875))","POLYGON((4.3415 1.7854,5.0371 1.786,5.037 1.9101,4.3413 1.9099,4.3415 1.7854))",S17-Se32067
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((0.5172 1.9776,0.7656 1.9788,0.7648 2.1175,0.5168 2.1163,0.5172 1.9776))",Date
"POLYGON((0 1.75768875,8.27 1.75768875,8.27 1.95163875,0 1.95163875,0 1.75768875))","POLYGON((6.9196 1.7849,7.6185 1.7851,7.6185 1.9115,6.9192 1.9102,6.9196 1.7849))",S17-Se32070
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((5.6283 1.9803,5.8824 1.9795,5.8824 2.1128,5.6279 2.1128,5.6283 1.9803))",2017
"POLYGON((0 1.3220562500000000000000005,8.27 1.3220562500000000000000005,8.27 1.5473770833333333333333335,0 1.5473770833333333333333335,0 1.3220562500000000000000005))","POLYGON((6.9231 1.433,7.2473 1.4326,7.2473 1.5457,6.9227 1.5434,6.9231 1.433))",70926
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((6.4886 1.9799,6.7448 1.9789,6.7448 2.1128,6.4881 2.1128,6.4886 1.9799))",2017
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((7.3487 1.9809,7.607 1.9793,7.6061 2.1128,7.348 2.1128,7.3487 1.9809))",2017
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((6.9211 1.9805,7.1316 1.9816,7.1309 2.1128,6.9205 2.1128,6.9211 1.9805))",Sep
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((6.0601 1.9797,6.271 1.9807,6.2705 2.1128,6.0595 2.1128,6.0601 1.9797))",Sep
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((5.201 1.9809,5.4092 1.981,5.4088 2.1128,5.2006 2.1128,5.201 1.9809))",Sep
"POLYGON((0 1.3220562500000000000000005,8.27 1.3220562500000000000000005,8.27 1.5473770833333333333333335,0 1.5473770833333333333333335,0 1.3220562500000000000000005))","POLYGON((0.5177 1.3665,0.8338 1.3692,0.833 1.5018,0.5174 1.5012,0.5177 1.3665))",Client
"POLYGON((0 1.5473770833333333333333335,8.27 1.5473770833333333333333335,8.27 1.75768875,0 1.75768875,0 1.5473770833333333333333335))","POLYGON((6.9187 1.5984,7.2473 1.5986,7.2473 1.7119,6.9179 1.7102,6.9187 1.5984))",Water
"POLYGON((0 1.5473770833333333333333335,8.27 1.5473770833333333333333335,8.27 1.75768875,0 1.75768875,0 1.5473770833333333333333335))","POLYGON((4.3396 1.5966,4.6659 1.598,4.6659 1.7128,4.3389 1.7104,4.3396 1.5966))",Water
"POLYGON((0 1.75768875,8.27 1.75768875,8.27 1.95163875,0 1.95163875,0 1.75768875))","POLYGON((1.0723 1.7851,1.2736 1.7853,1.2732 1.9268,1.0721 1.927,1.0723 1.7851))",mgt
"POLYGON((0 1.75768875,8.27 1.75768875,8.27 1.95163875,0 1.95163875,0 1.75768875))","POLYGON((1.711 1.7834,1.9132 1.7843,1.9132 1.9233,1.7103 1.9252,1.711 1.7834))",No.
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((6.304 1.9811,6.4534 1.9801,6.4529 2.1128,6.3035 2.1128,6.304 1.9811))","26,"
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((4.3407 1.9804,4.5501 1.9814,4.5496 2.1116,4.3401 2.1115,4.3407 1.9804))",Sep
"POLYGON((0 1.75768875,8.27 1.75768875,8.27 1.95163875,0 1.95163875,0 1.75768875))","POLYGON((5.2016 1.7852,5.8938 1.7849,5.8938 1.9102,5.2015 1.9101,5.2016 1.7852))",S17-Se32068
"POLYGON((0 1.75768875,8.27 1.75768875,8.27 1.95163875,0 1.95163875,0 1.75768875))","POLYGON((0.989 1.7852,1.0329 1.7852,1.0327 1.927,0.9887 1.927,0.989 1.7852))",|
"POLYGON((0 1.5473770833333333333333335,8.27 1.5473770833333333333333335,8.27 1.75768875,0 1.75768875,0 1.5473770833333333333333335))","POLYGON((5.1988 1.5978,5.5283 1.5978,5.5283 1.7112,5.1981 1.7097,5.1988 1.5978))",Water
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((4.5822 1.9817,4.7318 1.9819,4.7313 2.112,4.5817 2.1116,4.5822 1.9817))","26,"
"POLYGON((0 1.3220562500000000000000005,8.27 1.3220562500000000000000005,8.27 1.5473770833333333333333335,0 1.5473770833333333333333335,0 1.3220562500000000000000005))","POLYGON((1.2947 1.3673,1.4106 1.3673,1.4106 1.5013,1.2937 1.5018,1.2947 1.3673))",ID
"POLYGON((0 1.3220562500000000000000005,8.27 1.3220562500000000000000005,8.27 1.5473770833333333333333335,0 1.5473770833333333333333335,0 1.3220562500000000000000005))","POLYGON((6.0626 1.4326,6.3906 1.4321,6.3902 1.544,6.0622 1.5426,6.0626 1.4326))",70925
"POLYGON((0 1.95163875,8.27 1.95163875,8.27 2.14423625,0 2.14423625,0 1.95163875))","POLYGON((7.1642 1.9821,7.3139 1.9809,7.3132 2.1128,7.1635 2.1126,7.1642 1.9821))","26,"`;

  const lines = csvData.split('\n');
  const polygonMap = new Map<string, { wkt: string; text?: string }>();

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV line - handle quoted values and text field
    const match = line.match(/"([^"]+)","([^"]+)",(.+)/);
    if (match) {
      const rowBandWkt = match[1];
      const wordWkt = match[2];
      const text = match[3].replace(/^"(.*)"$/, '$1'); // Remove quotes if present

      // Add rowBandWkt without text
      if (!polygonMap.has(rowBandWkt)) {
        polygonMap.set(rowBandWkt, { wkt: rowBandWkt });
      }

      // Add wordWkt with text
      if (!polygonMap.has(wordWkt)) {
        polygonMap.set(wordWkt, { wkt: wordWkt, text });
      }
    }
  }

  // Convert to array and create polygon objects
  const polygonArray: PolygonInput[] = [];
  let id = 1;

  // Color palette
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

  Array.from(polygonMap.values()).forEach((item, index) => {
    polygonArray.push({
      id: id++,
      wkt: item.wkt,
      color: colors[index % colors.length],
      error: '',
      text: item.text
    });
  });

  return polygonArray;
}

const polygons = ref<PolygonInput[]>(loadPolygonsFromCSV());
let nextId = polygons.value.length + 1;

const scale = ref(96);
const canvasRef = ref<HTMLCanvasElement | null>(null);

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

  // Clear canvas (transparent background to see PDF underneath)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw grid lines (every inch) - semi-transparent for visibility over PDF
  ctx.strokeStyle = 'rgba(224, 224, 224, 0.5)';
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

  // Draw inch markers with background for visibility over PDF
  ctx.font = '10px Arial';

  // Draw backgrounds for markers first
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let i = 1; i <= pageWidth; i++) {
    const text = i + '"';
    const metrics = ctx.measureText(text);
    ctx.fillRect(i * scale.value - metrics.width / 2 - 2, 2, metrics.width + 4, 12);
  }
  for (let i = 1; i <= pageHeight; i++) {
    ctx.fillRect(3, i * scale.value - 6, 20, 12);
  }

  // Draw text on top of backgrounds
  ctx.fillStyle = '#666';
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

    // Draw text inside polygon if available
    if (polygon.text && polygonCoords.length >= 4) {
      // Calculate center of polygon
      const centerX = (polygonCoords[0].x + polygonCoords[1].x) / 2 * scale.value;
      const centerY = (polygonCoords[0].y + polygonCoords[2].y) / 2 * scale.value;

      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Draw background for text visibility
      const textMetrics = ctx.measureText(polygon.text);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(
        centerX - textMetrics.width / 2 - 2,
        centerY - 8,
        textMetrics.width + 4,
        16
      );

      // Draw text
      ctx.fillStyle = '#000000';
      ctx.fillText(polygon.text, centerX, centerY);
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
</script>

<template>
  <TestPanel
    heading="PDF Region Visualiser (Preloaded)"
    description="Visualizing distinct WKT POLYGON coordinates from poly_debug.csv on an A4 page (8.27&quot; × 11.69&quot;)"
  >
    <div class="visualiser-container">
      <div class="info-panel">
        <div class="polygons-section">
          <div class="section-header">
            <strong>Preloaded Polygons ({{ polygons.length }} total):</strong>
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
          <strong>Page size:</strong> 8.27" × 11.69" (A4)<br>
          <strong>Data source:</strong> public/pdf-tests/poly_debug.csv
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

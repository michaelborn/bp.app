<script setup lang="ts">
import { Line } from 'vue-chartjs';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { weightChartBounds } from '~/composables/useWeightRecords';
import { useWeightUnits } from '~/composables/useWeightUnits';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, Filler, TimeScale);

const props = defineProps<{
  records: { id: string; recordedAt: string; weight: number }[];
}>();

const { unit, toDisplay } = useWeightUnits();

const sorted = computed(() =>
  [...props.records].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()),
);

// Display values (kg or lb); the axis hugs this displayed range so changes
// stay visible in either unit system.
const chartData = computed(() => ({
  labels: sorted.value.map((r) => new Date(r.recordedAt)),
  datasets: [
    {
      label: `Weight (${unit.value})`,
      data: sorted.value.map((r) => toDisplay(r.weight)),
      borderColor: '#047857',
      backgroundColor: '#d1fae5',
      pointRadius: 3,
      tension: 0.25,
    },
  ],
}));

const chartOptions = computed<ChartOptions<'line'>>(() => {
  const displayValues = sorted.value.map((r) => toDisplay(r.weight));
  const margin = unit.value === 'kg' ? 2 : 5;
  const { min, max } = weightChartBounds(
    displayValues.map((weight) => ({ weight })),
    margin,
  );
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest' as const, intersect: false },
    scales: {
      x: {
        type: 'time' as const,
        time: { unit: 'day', tooltipFormat: 'MMM d, HH:mm' },
        axis: 'x' as const,
        title: { display: false },
        grid: { display: false },
      },
      y: {
        min,
        max,
        title: { display: true, text: `Weight (${unit.value})` },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: { parsed: { y: number | null } }) => {
            return `Weight: ${context.parsed.y} ${unit.value}`;
          },
          title: (items: { parsed: { x: number | null } }[]) => {
            const first = items[0];
            if (!first || first.parsed.x === null) {
              return '';
            }
            return new Date(first.parsed.x).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            });
          },
        },
      },
    },
  };
});
</script>

<template>
  <section class="bp-weight-chart" aria-labelledby="bp-weight-chart-heading">
    <div class="bp-weight-chart-heading-row">
      <h2 id="bp-weight-chart-heading" class="bp-weight-chart-h">Weight — last two weeks</h2>
    </div>

    <div v-if="!props.records.length" class="bp-empty">
      <p class="bp-empty-title">No weigh-ins in the last two weeks.</p>
    </div>

    <ClientOnly v-else>
      <div
        class="bp-chart-canvas"
        role="img"
        aria-label="Line chart of weight over the last two weeks"
      >
        <Line :data="chartData" :options="chartOptions" />
      </div>
      <template #fallback>
        <div class="bp-chart-fallback">Chart loads once the app is open.</div>
      </template>
    </ClientOnly>
  </section>
</template>

<style scoped>
.bp-weight-chart {
  background: var(--bp-surface);
  border: 1px solid var(--bp-border);
  border-radius: 0.75rem;
  padding: 1rem;
  margin-top: 1rem;
}

.bp-weight-chart-heading-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  align-items: baseline;
  justify-content: space-between;
}

.bp-weight-chart-h {
  margin: 0;
  font-size: 1rem;
}

.bp-chart-canvas {
  position: relative;
  height: 13rem;
  margin-top: 0.75rem;
}

.bp-chart-fallback {
  height: 13rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--bp-muted);
}

.bp-empty {
  padding: 2.5rem 1rem;
  border: 1px dashed var(--bp-border);
  border-radius: 0.5rem;
  text-align: center;
}

.bp-empty-title {
  margin: 0 0 0.25rem;
  font-weight: 600;
}
</style>

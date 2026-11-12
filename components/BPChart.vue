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
import { bpChartBounds } from '~/composables/useBPRecords';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, Filler, TimeScale);

const props = defineProps<{
  records: { recordedAt: string; systolic: number; diastolic: number }[];
}>();

// Build the dataset once at render time (client only); the chart is
// rendered inside <ClientOnly> so SSR never touches Chart.js.
const chartData = computed(() => {
  const records = props.records;
  const sorted = [...records].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  return {
    labels: sorted.map((r) => new Date(r.recordedAt)),
    datasets: [
      {
        label: 'Systolic',
        data: sorted.map((r) => r.systolic),
        borderColor: '#b91c1c',
        backgroundColor: '#fee2e2',
        pointRadius: 3,
        tension: 0.25,
      },
      {
        label: 'Diastolic',
        data: sorted.map((r) => r.diastolic),
        borderColor: '#0e7490',
        backgroundColor: '#cffafe',
        pointRadius: 3,
        tension: 0.25,
      },
    ],
  };
});

const rangeText = computed(() => {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 13);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(cutoff)} – ${fmt(now)}`;
});

const chartOptions = computed<ChartOptions<'line'>>(() => {
  const { min, max } = bpChartBounds(props.records);
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
        title: { display: true, text: 'Blood pressure (mmHg)' },
      },
    },
    plugins: {
    legend: { display: true },
    tooltip: {
      callbacks: {
        label: (context: { dataset: { label?: string }; parsed: { y: number | null } }) => {
          return `${context.dataset.label ?? 'Reading'}: ${context.parsed.y} mmHg`;
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
  <section class="bp-chart" aria-labelledby="bp-chart-heading">
    <div class="bp-chart-heading-row">
      <h2 id="bp-chart-heading" class="bp-chart-h">Blood pressure — last two weeks</h2>
      <p class="bp-chart-range">{{ rangeText }}</p>
    </div>

    <div v-if="!props.records.length" class="bp-empty">
      <p class="bp-empty-title">No readings in the last two weeks.</p>
      <p class="bp-empty-hint">Record BP to start tracking your blood pressure.</p>
    </div>

    <ClientOnly v-else>
      <div class="bp-chart-canvas" role="img" aria-label="Line chart of systolic and diastolic blood pressure over the last two weeks">
        <Line
          :data="chartData"
          :options="chartOptions"
        />
      </div>
      <template #fallback>
        <div class="bp-chart-fallback">Chart loads once the app is open.</div>
      </template>
    </ClientOnly>
  </section>
</template>

<style scoped>
.bp-chart {
  background: var(--bp-surface);
  border: 1px solid var(--bp-border);
  border-radius: 0.75rem;
  padding: 1rem;
}

.bp-chart-heading-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  align-items: baseline;
  justify-content: space-between;
}

.bp-chart-h {
  margin: 0;
  font-size: 1rem;
}

.bp-chart-range {
  margin: 0;
  color: var(--bp-muted);
  font-size: 0.8125rem;
}

.bp-chart-canvas {
  position: relative;
  height: 16rem;
}

.bp-chart-fallback {
  height: 16rem;
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

.bp-empty-hint {
  margin: 0;
  color: var(--bp-muted);
}
</style>

// Chart.jsヘルパー

const CHART_COLORS = {
  primary: '#4FC3F7',
  secondary: '#81C784',
  accent: '#FFB74D',
  positive: '#66BB6A',
  negative: '#EF5350',
  neutral: '#9E9E9E',
  prevYear: 'rgba(255,255,255,0.25)',
  grid: 'rgba(255,255,255,0.08)',
  text: 'rgba(255,255,255,0.7)',
  palette: ['#4FC3F7', '#81C784', '#FFB74D', '#CE93D8', '#F06292', '#4DD0E1', '#AED581', '#FFD54F', '#FF8A65', '#90A4AE']
};

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: CHART_COLORS.text, font: { size: 12 } }
    },
    tooltip: {
      backgroundColor: 'rgba(30,30,30,0.95)',
      titleColor: '#fff',
      bodyColor: '#ddd',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1
    }
  },
  scales: {
    x: {
      ticks: { color: CHART_COLORS.text },
      grid: { color: CHART_COLORS.grid }
    },
    y: {
      ticks: { color: CHART_COLORS.text },
      grid: { color: CHART_COLORS.grid }
    }
  }
};

// チャートインスタンスを管理するレジストリ
const chartRegistry = {};

function destroyChart(id) {
  if (chartRegistry[id]) {
    chartRegistry[id].destroy();
    delete chartRegistry[id];
  }
}

function createBarChart(canvasId, labels, datasets, options = {}) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const config = {
    type: 'bar',
    data: { labels, datasets },
    options: {
      ...JSON.parse(JSON.stringify(CHART_DEFAULTS)),
      ...options
    }
  };

  chartRegistry[canvasId] = new Chart(ctx, config);
  return chartRegistry[canvasId];
}

function createHorizontalBarChart(canvasId, labels, datasets, options = {}) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const defaults = JSON.parse(JSON.stringify(CHART_DEFAULTS));
  const config = {
    type: 'bar',
    data: { labels, datasets },
    options: {
      ...defaults,
      indexAxis: 'y',
      ...options
    }
  };

  chartRegistry[canvasId] = new Chart(ctx, config);
  return chartRegistry[canvasId];
}

function createDoughnutChart(canvasId, labels, data, colors, options = {}) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const config = {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors || CHART_COLORS.palette.slice(0, data.length),
        borderColor: 'rgba(30,30,30,0.8)',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: CHART_COLORS.text, font: { size: 12 }, padding: 15 }
        },
        tooltip: CHART_DEFAULTS.plugins.tooltip
      },
      ...options
    }
  };

  chartRegistry[canvasId] = new Chart(ctx, config);
  return chartRegistry[canvasId];
}

function createStackedBarChart(canvasId, labels, datasets, options = {}) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const defaults = JSON.parse(JSON.stringify(CHART_DEFAULTS));
  defaults.scales.x.stacked = true;
  defaults.scales.y.stacked = true;

  const config = {
    type: 'bar',
    data: { labels, datasets },
    options: { ...defaults, ...options }
  };

  chartRegistry[canvasId] = new Chart(ctx, config);
  return chartRegistry[canvasId];
}

// YoY比較用のデータセットペアを作成
function yoyDatasetPair(labelCurrent, labelPrevious, dataCurrent, dataPrevious, color) {
  return [
    {
      label: labelCurrent,
      data: dataCurrent,
      backgroundColor: color,
      borderRadius: 4
    },
    {
      label: labelPrevious,
      data: dataPrevious,
      backgroundColor: CHART_COLORS.prevYear,
      borderRadius: 4
    }
  ];
}

// 年次ダッシュボード

const YearlySection = {
  selectedYear: null,
  monthMetricCache: {},

  metricSet: [
    { key: 'cv', label: 'CV数', format: value => formatNumber(value, 1) },
    { key: 'spend', label: '消化金額', format: value => formatCurrency(value) },
    { key: 'cpa', label: 'CPA', format: value => formatCurrency(value), inverse: true },
    { key: 'googleCvr', label: 'Google広告CVR', format: value => formatPercent(value, 2) },
    { key: 'googleClicks', label: 'Google広告クリック数', format: value => formatNumber(value) },
    { key: 'googleImpressions', label: 'Google広告表示回数', format: value => formatNumber(value) },
    { key: 'sessions', label: 'GAセッション数', format: value => formatNumber(value) },
    { key: 'ecommercePurchases', label: 'GA EC購入数', format: value => formatNumber(value) }
  ],

  render(months) {
    const container = document.getElementById('tab-yearly');
    if (!container) return;

    const years = this.getAvailableYears(months);
    if (years.length === 0) {
      container.innerHTML = '<div class="loading">年次データがありません。</div>';
      return;
    }

    if (!this.selectedYear || !years.includes(this.selectedYear)) {
      this.selectedYear = years[0];
    }

    const current = this.buildYearData(this.selectedYear);
    const previous = this.buildComparisonYearData(current);

    const html = `
      <div class="yearly-toolbar">
        <div class="yearly-title">
          <h2>${this.selectedYear}年 年次ダッシュボード</h2>
          <div class="yearly-subtitle">${current.months.length}か月分 / 比較: ${previous.year}年同月</div>
        </div>
        <select id="year-select" class="month-select">
          ${years.map(year => `<option value="${year}" ${year === this.selectedYear ? 'selected' : ''}>${year}年</option>`).join('')}
        </select>
      </div>
      ${this.renderMetricChips()}
      ${this.renderKpis(current.totals, previous.totals)}
      ${this.renderChartsShell()}
      ${this.renderMonthlyTable(current.months)}
    `;

    container.innerHTML = html;
    document.getElementById('year-select').addEventListener('change', event => {
      this.selectedYear = event.target.value;
      this.render(months);
    });

    this.renderCharts(current.months);
  },

  getAvailableYears(months) {
    const monthSet = new Set(months || []);
    if (typeof GOOGLE_ADS_MASTER !== 'undefined') {
      Object.keys(GOOGLE_ADS_MASTER).forEach(month => monthSet.add(month));
    }
    if (typeof EMBEDDED_DATA !== 'undefined') {
      Object.keys(EMBEDDED_DATA).forEach(month => monthSet.add(month));
    }

    return [...new Set([...monthSet]
      .map(month => String(month).split('_')[0])
      .filter(year => /^\d{4}$/.test(year)))]
      .sort()
      .reverse();
  },

  getMonthsForYear(year) {
    const monthSet = new Set();
    if (typeof GOOGLE_ADS_MASTER !== 'undefined') {
      Object.keys(GOOGLE_ADS_MASTER).forEach(month => {
        if (month.startsWith(`${year}_`)) monthSet.add(month);
      });
    }
    if (typeof EMBEDDED_DATA !== 'undefined') {
      Object.keys(EMBEDDED_DATA).forEach(month => {
        if (month.startsWith(`${year}_`)) monthSet.add(month);
      });
    }

    return [...monthSet].sort();
  },

  buildYearData(year, monthNumbers = null) {
    const months = this.getMonthsForYear(year)
      .filter(month => !monthNumbers || monthNumbers.includes(month.split('_')[1]))
      .map(month => this.getMonthMetrics(month));

    return {
      year,
      months,
      totals: this.sumYearMetrics(months)
    };
  },

  buildComparisonYearData(current) {
    const previousYear = String(Number(current.year) - 1);
    const monthNumbers = current.months.map(month => month.month.split('_')[1]);
    return this.buildYearData(previousYear, monthNumbers);
  },

  getMonthMetrics(month) {
    if (this.monthMetricCache[month]) return this.monthMetricCache[month];

    const google = this.getGoogleAdsMetrics(month);
    const facebook = this.getFacebookMetrics(month);
    const ga = this.getGAMetrics(month);
    const spend = google.spend + facebook.spend;
    const cv = google.cv + facebook.cv;

    const metrics = {
      month,
      label: this.formatMonthLabel(month),
      spend,
      cv,
      cpa: cv > 0 ? spend / cv : 0,
      googleSpend: google.spend,
      googleCv: google.cv,
      googleCpa: google.cv > 0 ? google.spend / google.cv : 0,
      googleClicks: google.clicks,
      googleImpressions: google.impressions,
      googleCvr: google.clicks > 0 ? (google.cv / google.clicks) * 100 : 0,
      facebookSpend: facebook.spend,
      facebookCv: facebook.cv,
      facebookCpa: facebook.cv > 0 ? facebook.spend / facebook.cv : 0,
      sessions: ga.sessions,
      keyEvents: ga.keyEvents,
      revenue: ga.revenue,
      ecommercePurchases: ga.ecommercePurchases,
      ecommerceRevenue: ga.ecommerceRevenue,
      stores: this.mergeStoreMetrics(google.stores, facebook.stores)
    };

    this.monthMetricCache[month] = metrics;
    return metrics;
  },

  getGoogleAdsMetrics(month) {
    const emptyStore = () => ({ spend: 0, cv: 0, clicks: 0, impressions: 0 });
    const result = { spend: 0, cv: 0, clicks: 0, impressions: 0, stores: {} };

    STORE_LIST.forEach(store => {
      const storeMetrics = emptyStore();
      const source = (typeof GOOGLE_ADS_MASTER !== 'undefined' && GOOGLE_ADS_MASTER[month])
        ? GOOGLE_ADS_MASTER[month][store]
        : null;

      if (source && source.s) {
        storeMetrics.spend = Number(source.s.co) || 0;
        storeMetrics.cv = Number(source.s.cv) || 0;
        storeMetrics.clicks = Number(source.s.cl) || 0;
        storeMetrics.impressions = Number(source.s.im) || 0;
      } else if (source && source.r) {
        source.r.forEach(row => {
          storeMetrics.spend += Number(row.c) || 0;
          storeMetrics.cv += Number(row.cv) || 0;
          storeMetrics.clicks += Number(row.cl) || 0;
          storeMetrics.impressions += Number(row.im) || 0;
        });
      }

      result.stores[store] = storeMetrics;
      result.spend += storeMetrics.spend;
      result.cv += storeMetrics.cv;
      result.clicks += storeMetrics.clicks;
      result.impressions += storeMetrics.impressions;
    });

    return result;
  },

  getFacebookMetrics(month) {
    const result = { spend: 0, cv: 0, stores: {} };
    STORE_LIST.forEach(store => {
      result.stores[store] = { spend: 0, cv: 0 };
    });

    const rows = this.parseEmbeddedCSV(month, ['faceboo-広告レポート', 'facebook-広告レポート'], '前年');
    const parsed = DataLoader.parseFacebook(rows, []).current;
    const byStore = DataLoader.getFBStoreSummary(parsed);

    STORE_LIST.forEach(store => {
      const metrics = byStore[store] || { spend: 0, conversions: 0 };
      result.stores[store] = { spend: metrics.spend || 0, cv: metrics.conversions || 0 };
      result.spend += metrics.spend || 0;
      result.cv += metrics.conversions || 0;
    });

    return result;
  },

  getGAMetrics(month) {
    const trafficText = this.getEmbeddedText(month, ['トラフィック獲得'], '日別');
    const ecommerceText = this.getEmbeddedText(month, ['コマース購入数', 'e_コマース']);
    const traffic = DataLoader.parseGATraffic(trafficText).current;
    const ecommerce = DataLoader.parseGAEcommerce(ecommerceText).current;

    return {
      sessions: traffic.reduce((sum, row) => sum + (row.sessions || 0), 0),
      keyEvents: traffic.reduce((sum, row) => sum + (row.keyEvents || 0), 0),
      revenue: traffic.reduce((sum, row) => sum + (row.revenue || 0), 0),
      ecommercePurchases: ecommerce.reduce((sum, row) => sum + (row.purchases || 0), 0),
      ecommerceRevenue: ecommerce.reduce((sum, row) => sum + (row.revenue || 0), 0)
    };
  },

  parseEmbeddedCSV(month, patterns, exclude) {
    const text = this.getEmbeddedText(month, patterns, exclude);
    if (!text) return [];
    const result = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
    return result.data || [];
  },

  getEmbeddedText(month, patterns, exclude) {
    if (typeof EMBEDDED_DATA === 'undefined' || !EMBEDDED_DATA[month]) return '';
    const files = Object.keys(EMBEDDED_DATA[month]);
    const filename = DataLoader.findFile(files, patterns, exclude);
    return filename ? EMBEDDED_DATA[month][filename] : '';
  },

  mergeStoreMetrics(googleStores, facebookStores) {
    const stores = {};
    STORE_LIST.forEach(store => {
      const google = googleStores[store] || { spend: 0, cv: 0 };
      const facebook = facebookStores[store] || { spend: 0, cv: 0 };
      const spend = google.spend + facebook.spend;
      const cv = google.cv + facebook.cv;
      stores[store] = {
        spend,
        cv,
        cpa: cv > 0 ? spend / cv : 0,
        googleSpend: google.spend,
        googleCv: google.cv,
        facebookSpend: facebook.spend,
        facebookCv: facebook.cv
      };
    });
    return stores;
  },

  sumYearMetrics(months) {
    const totals = {
      spend: 0,
      cv: 0,
      googleSpend: 0,
      googleCv: 0,
      facebookSpend: 0,
      facebookCv: 0,
      googleClicks: 0,
      googleImpressions: 0,
      sessions: 0,
      keyEvents: 0,
      revenue: 0,
      ecommercePurchases: 0,
      ecommerceRevenue: 0
    };

    months.forEach(month => {
      Object.keys(totals).forEach(key => {
        totals[key] += month[key] || 0;
      });
    });

    totals.cpa = totals.cv > 0 ? totals.spend / totals.cv : 0;
    totals.googleCvr = totals.googleClicks > 0 ? (totals.googleCv / totals.googleClicks) * 100 : 0;
    return totals;
  },

  renderMetricChips() {
    return `
      <div class="metric-chip-row">
        ${this.metricSet.map(metric => `<span class="metric-chip">${metric.label}</span>`).join('')}
      </div>
    `;
  },

  renderKpis(current, previous) {
    const kpis = [
      this.buildYearKpi('年間消化金額', current.spend, previous.spend, { format: formatCurrency }),
      this.buildYearKpi('年間CV数', current.cv, previous.cv, { format: value => formatNumber(value, 1) }),
      this.buildYearKpi('年間CPA', current.cpa, previous.cpa, { format: formatCurrency, inverse: true }),
      this.buildYearKpi('Google広告CVR', current.googleCvr, previous.googleCvr, { format: value => formatPercent(value, 2) }),
      this.buildYearKpi('GAセッション数', current.sessions, previous.sessions, { format: formatNumber }),
      this.buildYearKpi('GA EC購入数', current.ecommercePurchases, previous.ecommercePurchases, { format: formatNumber })
    ];

    return `
      <div class="kpi-grid yearly-kpi-grid">
        ${kpis.map(kpi => {
          const arrow = kpi.change.class === 'positive' ? '&#9650;' : kpi.change.class === 'negative' ? '&#9660;' : '&#9654;';
          return `
            <div class="kpi-card">
              <div class="label">${kpi.label}</div>
              <div class="value">${kpi.current}</div>
              <div class="previous">前年同月: ${kpi.previous}</div>
              <div class="change ${kpi.change.class}">${arrow} ${kpi.change.text}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  buildYearKpi(label, current, previous, options) {
    const change = options.inverse
      ? formatYoYChangeInverse(current, previous)
      : formatYoYChange(current, previous);

    return {
      label,
      current: options.format(current),
      previous: options.format(previous),
      change
    };
  },

  renderChartsShell() {
    return `
      <div class="chart-row">
        <div class="section-card">
          <h3>月次推移: CV数 / 消化金額</h3>
          <div class="chart-container"><canvas id="chart-yearly-cv-spend"></canvas></div>
        </div>
        <div class="section-card">
          <h3>月次推移: CPA / Google広告CVR</h3>
          <div class="chart-container"><canvas id="chart-yearly-efficiency"></canvas></div>
        </div>
      </div>
      <div class="chart-row">
        <div class="section-card">
          <h3>月次推移: Google広告クリック数 / 表示回数</h3>
          <div class="chart-container"><canvas id="chart-yearly-volume"></canvas></div>
        </div>
        <div class="section-card">
          <h3>月次推移: GAセッション数 / EC購入数</h3>
          <div class="chart-container"><canvas id="chart-yearly-site"></canvas></div>
        </div>
      </div>
    `;
  },

  renderCharts(months) {
    const labels = months.map(month => month.label);

    this.createDualAxisLineChart('chart-yearly-cv-spend', labels, [
      { label: 'CV数', data: months.map(month => month.cv), axis: 'y', color: CHART_COLORS.primary, format: value => formatNumber(value, 1) },
      { label: '消化金額', data: months.map(month => month.spend), axis: 'y1', color: CHART_COLORS.accent, format: formatCurrency }
    ], { yTitle: 'CV数', y1Title: '消化金額' });

    this.createDualAxisLineChart('chart-yearly-efficiency', labels, [
      { label: 'CPA', data: months.map(month => month.cpa), axis: 'y', color: CHART_COLORS.negative, format: formatCurrency },
      { label: 'Google広告CVR', data: months.map(month => month.googleCvr), axis: 'y1', color: CHART_COLORS.secondary, format: value => formatPercent(value, 2) }
    ], { yTitle: 'CPA', y1Title: 'CVR' });

    this.createDualAxisLineChart('chart-yearly-volume', labels, [
      { label: 'Google広告クリック数', data: months.map(month => month.googleClicks), axis: 'y', color: CHART_COLORS.primary, format: formatNumber },
      { label: 'Google広告表示回数', data: months.map(month => month.googleImpressions), axis: 'y1', color: CHART_COLORS.neutral, format: formatNumber }
    ], { yTitle: 'クリック数', y1Title: '表示回数' });

    this.createDualAxisLineChart('chart-yearly-site', labels, [
      { label: 'GAセッション数', data: months.map(month => month.sessions), axis: 'y', color: CHART_COLORS.secondary, format: formatNumber },
      { label: 'GA EC購入数', data: months.map(month => month.ecommercePurchases), axis: 'y1', color: CHART_COLORS.accent, format: formatNumber }
    ], { yTitle: 'セッション数', y1Title: 'EC購入数' });
  },

  createDualAxisLineChart(canvasId, labels, series, titles) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    chartRegistry[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: series.map(item => ({
          label: item.label,
          data: item.data,
          yAxisID: item.axis,
          borderColor: item.color,
          backgroundColor: item.color,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
          tension: 0.25
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: CHART_DEFAULTS.plugins.legend,
          tooltip: {
            ...CHART_DEFAULTS.plugins.tooltip,
            callbacks: {
              label: context => {
                const item = series[context.datasetIndex];
                return `${item.label}: ${item.format(context.raw)}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: CHART_COLORS.text },
            grid: { color: CHART_COLORS.grid }
          },
          y: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            title: { display: true, text: titles.yTitle, color: CHART_COLORS.text },
            ticks: { color: CHART_COLORS.text },
            grid: { color: CHART_COLORS.grid }
          },
          y1: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            title: { display: true, text: titles.y1Title, color: CHART_COLORS.text },
            ticks: { color: CHART_COLORS.text },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });

    return chartRegistry[canvasId];
  },

  renderMonthlyTable(months) {
    return `
      <div class="section-card">
        <h3>月次指標一覧</h3>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>月</th>
                <th class="num">消化金額</th>
                <th class="num">CV数</th>
                <th class="num">CPA</th>
                <th class="num">Google広告CVR</th>
                <th class="num">Google広告クリック数</th>
                <th class="num">Google広告表示回数</th>
                <th class="num">GAセッション数</th>
                <th class="num">GA EC購入数</th>
                <th class="num">Google広告費</th>
                <th class="num">Facebook広告費</th>
              </tr>
            </thead>
            <tbody>
              ${months.map(month => `
                <tr>
                  <td>${month.label}</td>
                  <td class="num">${formatCurrency(month.spend)}</td>
                  <td class="num">${formatNumber(month.cv, 1)}</td>
                  <td class="num">${formatCurrency(month.cpa)}</td>
                  <td class="num">${formatPercent(month.googleCvr, 2)}</td>
                  <td class="num">${formatNumber(month.googleClicks)}</td>
                  <td class="num">${formatNumber(month.googleImpressions)}</td>
                  <td class="num">${formatNumber(month.sessions)}</td>
                  <td class="num">${formatNumber(month.ecommercePurchases)}</td>
                  <td class="num">${formatCurrency(month.googleSpend)}</td>
                  <td class="num">${formatCurrency(month.facebookSpend)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  formatMonthLabel(month) {
    const [, monthNumber] = month.split('_');
    return `${Number(monthNumber)}月`;
  }
};

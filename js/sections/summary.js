// サマリータブ

const SummarySection = {
  render(data) {
    const container = document.getElementById('tab-summary');
    const overall = DataLoader.getOverallSummary();
    const d = data;

    // KPIカード
    const kpis = [
      buildKPI('総消化金額', overall.totalSpend, overall.totalSpendPrev, { isCurrency: true }),
      buildKPI('総コンバージョン数', overall.totalCV, overall.totalCVPrev),
      buildKPI('平均CPA', overall.totalCPA, overall.totalCPAPrev, { isCurrency: true, isInverse: true }),
      buildKPI('平均CVR', overall.totalCVR, overall.totalCVRPrev, { decimals: 2, suffix: '%' })
    ];

    let html = '<div class="kpi-grid">';
    kpis.forEach(kpi => {
      const arrow = kpi.changeClass === 'positive' ? '&#9650;' : kpi.changeClass === 'negative' ? '&#9660;' : '&#9654;';
      html += `
        <div class="kpi-card">
          <div class="label">${kpi.label}</div>
          <div class="value">${kpi.formattedCurrent}</div>
          <div class="previous">${compLabel()}: ${kpi.formattedPrevious}</div>
          <div class="change ${kpi.changeClass}">${arrow} ${kpi.changeText}</div>
        </div>`;
    });
    html += '</div>';

    // 店舗別消化金額 vs CV数チャート
    html += `
      <div class="chart-row">
        <div class="section-card">
          <h3>店舗別 消化金額（${compLabel()}比較）</h3>
          <div class="chart-container"><canvas id="chart-store-spend"></canvas></div>
        </div>
        <div class="section-card">
          <h3>店舗別 コンバージョン数（${compLabel()}比較）</h3>
          <div class="chart-container"><canvas id="chart-store-cv"></canvas></div>
        </div>
      </div>`;

    // チャネル別消化金額
    html += `
      <div class="chart-row">
        <div class="section-card">
          <h3>チャネル別 消化金額</h3>
          <div class="chart-container"><canvas id="chart-channel-spend"></canvas></div>
        </div>
        <div class="section-card">
          <h3>チャネル別 コンバージョン数</h3>
          <div class="chart-container"><canvas id="chart-channel-cv"></canvas></div>
        </div>
      </div>`;

    // サマリーテーブル
    html += '<div class="section-card"><h3>店舗別 サマリー</h3><div class="table-scroll">';
    html += this.buildSummaryTable(d, overall);
    html += '</div></div>';

    container.innerHTML = html;
    this.renderCharts(d, overall);
  },

  buildSummaryTable(d, overall) {
    const ga = d.googleAds;
    const fbStore = {
      current: DataLoader.getFBStoreSummary(d.facebook.current),
      previous: DataLoader.getFBStoreSummary(d.facebook.previous)
    };

    let html = `<table class="data-table">
      <thead><tr>
        <th>店舗</th><th>チャネル</th>
        <th class="num">消化金額</th><th class="num">${compLabel()}</th><th class="num">増減率</th>
        <th class="num">CV数</th><th class="num">${compLabel()}</th><th class="num">増減率</th>
        <th class="num">CPA</th><th class="num">${compLabel()}</th>
        <th class="num">CVR</th><th class="num">${compLabel()}</th>
      </tr></thead><tbody>`;

    STORE_LIST.forEach(store => {
      // Google広告
      const gSum = ga[store].summary;
      const gYoYSpend = formatYoYChange(gSum.spend, gSum.spendPrev);
      const gYoYCV = formatYoYChange(gSum.cv, gSum.cvPrev);
      html += `<tr>
        <td>${store}</td><td>Google広告</td>
        <td class="num">${formatCurrency(gSum.spend)}</td>
        <td class="num">${formatCurrency(gSum.spendPrev)}</td>
        <td class="num ${gYoYSpend.class}">${gYoYSpend.text}</td>
        <td class="num">${formatNumber(gSum.cv, 1)}</td>
        <td class="num">${formatNumber(gSum.cvPrev, 1)}</td>
        <td class="num ${gYoYCV.class}">${gYoYCV.text}</td>
        <td class="num">${formatCurrency(gSum.cpa)}</td>
        <td class="num">${formatCurrency(gSum.cpaPrev)}</td>
        <td class="num">${formatPercent(gSum.cvr)}</td>
        <td class="num">${formatPercent(gSum.cvrPrev)}</td>
      </tr>`;

      // Facebook広告
      const fCur = fbStore.current[store];
      const fPrev = fbStore.previous[store];
      const fYoYSpend = formatYoYChange(fCur.spend, fPrev.spend);
      const fYoYCV = formatYoYChange(fCur.conversions, fPrev.conversions);
      html += `<tr>
        <td>${store}</td><td>Facebook広告</td>
        <td class="num">${formatCurrency(fCur.spend)}</td>
        <td class="num">${formatCurrency(fPrev.spend)}</td>
        <td class="num ${fYoYSpend.class}">${fYoYSpend.text}</td>
        <td class="num">${formatNumber(fCur.conversions)}</td>
        <td class="num">${formatNumber(fPrev.conversions)}</td>
        <td class="num ${fYoYCV.class}">${fYoYCV.text}</td>
        <td class="num">${formatCurrency(fCur.cpa)}</td>
        <td class="num">${formatCurrency(fPrev.cpa)}</td>
        <td class="num">-</td>
        <td class="num">-</td>
      </tr>`;
    });

    html += '</tbody></table>';
    return html;
  },

  renderCharts(d, overall) {
    const ga = d.googleAds;
    const fbCur = DataLoader.getFBStoreSummary(d.facebook.current);
    const fbPrev = DataLoader.getFBStoreSummary(d.facebook.previous);

    // 店舗別消化金額
    const spendCur = STORE_LIST.map(s => ga[s].summary.spend + fbCur[s].spend);
    const spendPrev = STORE_LIST.map(s => ga[s].summary.spendPrev + fbPrev[s].spend);
    createBarChart('chart-store-spend', STORE_LIST,
      yoyDatasetPair(ComparisonEngine.getChartLabels(DataLoader.currentMonth).current, ComparisonEngine.getChartLabels(DataLoader.currentMonth).comparison, spendCur, spendPrev, CHART_COLORS.primary), {
        plugins: { ...CHART_DEFAULTS.plugins, tooltip: { ...CHART_DEFAULTS.plugins.tooltip, callbacks: { label: ctx => ctx.dataset.label + ': ' + formatCurrency(ctx.raw) } } }
      });

    // 店舗別CV数
    const cvCur = STORE_LIST.map(s => ga[s].summary.cv + fbCur[s].conversions);
    const cvPrev = STORE_LIST.map(s => ga[s].summary.cvPrev + fbPrev[s].conversions);
    createBarChart('chart-store-cv', STORE_LIST,
      yoyDatasetPair(ComparisonEngine.getChartLabels(DataLoader.currentMonth).current, ComparisonEngine.getChartLabels(DataLoader.currentMonth).comparison, cvCur, cvPrev, CHART_COLORS.secondary));

    // チャネル別消化金額
    const channels = ['Google広告', 'Facebook広告'];
    createBarChart('chart-channel-spend', channels,
      yoyDatasetPair(ComparisonEngine.getChartLabels(DataLoader.currentMonth).current, ComparisonEngine.getChartLabels(DataLoader.currentMonth).comparison,
        [overall.google.spend, overall.facebook.spend],
        [overall.google.spendPrev, overall.facebook.spendPrev],
        CHART_COLORS.accent), {
        plugins: { ...CHART_DEFAULTS.plugins, tooltip: { ...CHART_DEFAULTS.plugins.tooltip, callbacks: { label: ctx => ctx.dataset.label + ': ' + formatCurrency(ctx.raw) } } }
      });

    // チャネル別CV数
    createBarChart('chart-channel-cv', channels,
      yoyDatasetPair(ComparisonEngine.getChartLabels(DataLoader.currentMonth).current, ComparisonEngine.getChartLabels(DataLoader.currentMonth).comparison,
        [overall.google.cv, overall.facebook.cv],
        [overall.google.cvPrev, overall.facebook.cvPrev],
        CHART_COLORS.primary));
  }
};

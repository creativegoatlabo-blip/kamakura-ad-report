// GA トラフィック & コンバージョンタブ

const AnalyticsSection = {
  // 「Google広告」で始まる流入元を統合
  mergeGoogleAds(rows) {
    const merged = [];
    const gaRow = { source: 'Google広告', activeUsers: 0, sessions: 0, engagedSessions: 0, avgEngagementTime: 0, engagedSessionsPerUser: 0, eventsPerSession: 0, engagementRate: 0, eventCount: 0, keyEvents: 0, revenue: 0, sessionKeyEventRate: 0 };
    let gaCount = 0;

    rows.forEach(r => {
      if (r.source.startsWith('Google広告')) {
        gaRow.activeUsers += r.activeUsers;
        gaRow.sessions += r.sessions;
        gaRow.engagedSessions += r.engagedSessions;
        gaRow.eventCount += r.eventCount;
        gaRow.keyEvents += r.keyEvents;
        gaRow.revenue += r.revenue;
        gaCount++;
      } else {
        merged.push(r);
      }
    });

    if (gaCount > 0) {
      gaRow.engagementRate = gaRow.sessions > 0 ? gaRow.engagedSessions / gaRow.sessions : 0;
      gaRow.sessionKeyEventRate = gaRow.sessions > 0 ? gaRow.keyEvents / gaRow.sessions : 0;
      gaRow.eventsPerSession = gaRow.sessions > 0 ? gaRow.eventCount / gaRow.sessions : 0;
      merged.unshift(gaRow);
    }

    // 同名ソースの重複行を合算
    const deduped = {};
    merged.forEach(r => {
      if (!deduped[r.source]) {
        deduped[r.source] = { ...r };
      } else {
        const d = deduped[r.source];
        d.activeUsers += r.activeUsers;
        d.sessions += r.sessions;
        d.engagedSessions += r.engagedSessions;
        d.eventCount += r.eventCount;
        d.keyEvents += r.keyEvents;
        d.revenue += r.revenue;
      }
    });
    // 率系の再計算
    Object.values(deduped).forEach(d => {
      d.engagementRate = d.sessions > 0 ? d.engagedSessions / d.sessions : 0;
      d.eventsPerSession = d.sessions > 0 ? d.eventCount / d.sessions : 0;
      d.sessionKeyEventRate = d.sessions > 0 ? d.keyEvents / d.sessions : 0;
    });

    return Object.values(deduped);
  },

  render(data) {
    const container = document.getElementById('tab-analytics');
    const ga = {
      current: this.mergeGoogleAds(data.gaTraffic.current),
      previous: this.mergeGoogleAds(data.gaTraffic.previous)
    };
    const ecom = data.gaEcommerce;

    let html = '';

    // トラフィックKPI
    const curTotals = this.sumTraffic(ga.current);
    const prevTotals = this.sumTraffic(ga.previous);

    const kpis = [
      buildKPI('総セッション', curTotals.sessions, prevTotals.sessions),
      buildKPI('キーイベント', curTotals.keyEvents, prevTotals.keyEvents),
      buildKPI('総収益', curTotals.revenue, prevTotals.revenue, { isCurrency: true }),
      buildKPI('エンゲージメント率', curTotals.engagementRate * 100, prevTotals.engagementRate * 100, { decimals: 1, suffix: '%' })
    ];

    html += '<div class="kpi-grid">';
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

    // チャート
    html += `<div class="chart-row">
      <div class="section-card">
        <h3>流入元別 セッション数（${compLabel()}比較）</h3>
        <div class="chart-container"><canvas id="chart-ga-sessions"></canvas></div>
      </div>
      <div class="section-card">
        <h3>流入元別 収益（${compLabel()}比較）</h3>
        <div class="chart-container"><canvas id="chart-ga-revenue"></canvas></div>
      </div>
    </div>`;

    // 流入元別テーブル
    html += this.renderTrafficTable(ga);

    // コンバージョン変化量ランキング
    html += this.renderKeyEventChangeRanking(ga);

    // 収益/セッション分析
    html += this.renderRevenuePerSession(ga);

    // eコマース商品×流入元マトリクス
    html += this.renderEcommerceMatrix(ecom);

    // Search Console オーガニック検索分析
    html += this.renderSearchConsole();

    container.innerHTML = html;
    this.renderCharts(ga);
  },

  sumTraffic(rows) {
    let sessions = 0, keyEvents = 0, revenue = 0, engagedSessions = 0;
    rows.forEach(r => {
      sessions += r.sessions;
      keyEvents += r.keyEvents;
      revenue += r.revenue;
      engagedSessions += r.engagedSessions;
    });
    return { sessions, keyEvents, revenue, engagementRate: sessions > 0 ? engagedSessions / sessions : 0 };
  },

  renderTrafficTable(ga) {
    const prevMap = {};
    ga.previous.forEach(r => { prevMap[r.source] = r; });

    const sorted = ga.current
      .filter(r => r.sessions > 0)
      .sort((a, b) => b.sessions - a.sessions);

    let html = `<div class="section-card"><h3>流入元別パフォーマンス</h3><div class="table-scroll">
      <table class="data-table"><thead><tr>
        <th>流入元</th>
        <th class="num">セッション</th><th class="num">${compLabel()}</th><th class="num">増減</th>
        <th class="num">キーイベント</th><th class="num">${compLabel()}</th><th class="num">増減</th>
        <th class="num">収益</th><th class="num">${compLabel()}</th>
        <th class="num">エンゲージ率</th><th class="num">収益/セッション</th>
      </tr></thead><tbody>`;

    sorted.forEach(r => {
      const prev = prevMap[r.source] || { sessions: 0, keyEvents: 0, revenue: 0 };
      const sessYoY = formatYoYChange(r.sessions, prev.sessions);
      const keYoY = formatYoYChange(r.keyEvents, prev.keyEvents);
      const revPerSession = r.sessions > 0 ? r.revenue / r.sessions : 0;

      html += `<tr>
        <td>${r.source}</td>
        <td class="num">${formatNumber(r.sessions)}</td>
        <td class="num">${formatNumber(prev.sessions)}</td>
        <td class="num ${sessYoY.class}">${sessYoY.text}</td>
        <td class="num">${formatNumber(r.keyEvents)}</td>
        <td class="num">${formatNumber(prev.keyEvents)}</td>
        <td class="num ${keYoY.class}">${keYoY.text}</td>
        <td class="num">${formatCurrency(r.revenue)}</td>
        <td class="num">${formatCurrency(prev.revenue)}</td>
        <td class="num">${formatPercent(r.engagementRate * 100)}</td>
        <td class="num">${formatCurrency(revPerSession)}</td>
      </tr>`;
    });

    html += '</tbody></table></div></div>';
    return html;
  },

  renderKeyEventChangeRanking(ga) {
    const prevMap = {};
    ga.previous.forEach(r => { prevMap[r.source] = r; });

    // 全流入元の変化量を計算
    const allSources = [];
    ga.current.forEach(r => {
      const prev = prevMap[r.source] || { keyEvents: 0, sessions: 0, revenue: 0 };
      const diff = r.keyEvents - prev.keyEvents;
      if (r.keyEvents > 0 || prev.keyEvents > 0) {
        allSources.push({ source: r.source, cur: r.keyEvents, prev: prev.keyEvents, diff, sessions: r.sessions, revenue: r.revenue, prevRevenue: prev.revenue });
      }
    });
    // 前年にあったが今年ない流入元も拾う
    ga.previous.forEach(r => {
      if (!ga.current.find(c => c.source === r.source) && r.keyEvents > 0) {
        allSources.push({ source: r.source, cur: 0, prev: r.keyEvents, diff: -r.keyEvents, sessions: 0, revenue: 0, prevRevenue: r.revenue });
      }
    });

    const increased = [...allSources].sort((a, b) => b.diff - a.diff).filter(s => s.diff > 0).slice(0, 10);
    const decreased = [...allSources].sort((a, b) => a.diff - b.diff).filter(s => s.diff < 0).slice(0, 10);

    const renderTable = (rows, title, colorClass) => {
      let html = `<div class="section-card"><h3>${title}</h3><div class="table-scroll"><table class="data-table">
        <thead><tr>
          <th>#</th><th>流入元</th>
          <th class="num">キーイベント</th><th class="num">${compLabel()}</th><th class="num">変化量</th><th class="num">変化率</th>
          <th class="num">収益</th><th class="num">${compLabel()}</th>
        </tr></thead><tbody>`;

      rows.forEach((s, i) => {
        const yoy = formatYoYChange(s.cur, s.prev);
        html += `<tr>
          <td>${i + 1}</td>
          <td>${s.source}</td>
          <td class="num">${formatNumber(s.cur)}</td>
          <td class="num">${formatNumber(s.prev)}</td>
          <td class="num ${colorClass}">${s.diff > 0 ? '+' : ''}${formatNumber(s.diff)}</td>
          <td class="num ${yoy.class}">${yoy.text}</td>
          <td class="num">${formatCurrency(s.revenue)}</td>
          <td class="num">${formatCurrency(s.prevRevenue)}</td>
        </tr>`;
      });

      html += '</tbody></table></div></div>';
      return html;
    };

    return `<div class="chart-row">
      ${renderTable(increased, 'コンバージョン増加 Top10（変化量順）', 'positive')}
      ${renderTable(decreased, 'コンバージョン減少 Top10（変化量順）', 'negative')}
    </div>`;
  },

  renderRevenuePerSession(ga) {
    const prevMap = {};
    ga.previous.forEach(r => { prevMap[r.source] = r; });

    const sources = ga.current
      .filter(r => r.sessions > 0 && r.revenue > 0)
      .map(r => {
        const prev = prevMap[r.source] || { sessions: 0, revenue: 0 };
        const rps = r.revenue / r.sessions;
        const rpsPrev = prev.sessions > 0 ? prev.revenue / prev.sessions : 0;
        return { source: r.source, rps, rpsPrev, sessions: r.sessions, revenue: r.revenue };
      })
      .sort((a, b) => b.rps - a.rps);

    let html = `<div class="section-card"><h3>収益/セッション（ROAS効率指標）</h3><div class="table-scroll">
      <table class="data-table"><thead><tr>
        <th>流入元</th><th class="num">収益/セッション</th><th class="num">${compLabel()}</th><th class="num">変化</th>
        <th class="num">セッション</th><th class="num">収益</th>
      </tr></thead><tbody>`;

    sources.forEach(s => {
      const yoy = formatYoYChange(s.rps, s.rpsPrev);
      html += `<tr>
        <td>${s.source}</td>
        <td class="num">${formatCurrency(s.rps)}</td>
        <td class="num">${formatCurrency(s.rpsPrev)}</td>
        <td class="num ${yoy.class}">${yoy.text}</td>
        <td class="num">${formatNumber(s.sessions)}</td>
        <td class="num">${formatCurrency(s.revenue)}</td>
      </tr>`;
    });

    html += '</tbody></table></div></div>';
    return html;
  },

  // eコマース流入元もGoogle広告統合
  mergeEcomGoogleAds(rows) {
    const merged = {};
    rows.forEach(r => {
      const source = r.source.startsWith('Google広告') ? 'Google広告' : r.source;
      const store = r.store || 'その他';
      const key = store + '|' + source;
      if (!merged[key]) merged[key] = { store, source, purchases: 0, revenue: 0 };
      merged[key].purchases += r.purchases;
      merged[key].revenue += r.revenue;
    });
    return Object.values(merged);
  },

  renderEcommerceMatrix(ecom) {
    const curData = this.mergeEcomGoogleAds(ecom.current.filter(r => r.purchases > 0));
    const prevData = this.mergeEcomGoogleAds(ecom.previous.filter(r => r.purchases > 0));

    // 店舗ごとに集計
    const storeItems = {};
    curData.forEach(r => {
      if (!storeItems[r.store]) storeItems[r.store] = {};
      if (!storeItems[r.store][r.source]) storeItems[r.store][r.source] = { purchases: 0, revenue: 0 };
      storeItems[r.store][r.source].purchases += r.purchases;
      storeItems[r.store][r.source].revenue += r.revenue;
    });

    const prevStoreItems = {};
    prevData.forEach(r => {
      if (!prevStoreItems[r.store]) prevStoreItems[r.store] = {};
      if (!prevStoreItems[r.store][r.source]) prevStoreItems[r.store][r.source] = { purchases: 0, revenue: 0 };
      prevStoreItems[r.store][r.source].purchases += r.purchases;
      prevStoreItems[r.store][r.source].revenue += r.revenue;
    });

    let html = '';

    STORE_LIST.forEach(store => {
      const items = storeItems[store];
      if (!items) return;

      const prevItems = prevStoreItems[store] || {};
      const sources = Object.entries(items)
        .sort((a, b) => b[1].purchases - a[1].purchases);

      html += `<div class="section-card"><h3>${store} - 流入元別 購入数・収益</h3><div class="table-scroll">
        <table class="data-table"><thead><tr>
          <th>流入元</th>
          <th class="num">購入数</th><th class="num">${compLabel()}</th><th class="num">変化</th>
          <th class="num">収益</th><th class="num">${compLabel()}</th><th class="num">変化</th>
        </tr></thead><tbody>`;

      sources.forEach(([source, data]) => {
        const prev = prevItems[source] || { purchases: 0, revenue: 0 };
        const purchYoY = formatYoYChange(data.purchases, prev.purchases);
        const revYoY = formatYoYChange(data.revenue, prev.revenue);
        html += `<tr>
          <td>${source}</td>
          <td class="num">${formatNumber(data.purchases)}</td>
          <td class="num">${formatNumber(prev.purchases)}</td>
          <td class="num ${purchYoY.class}">${purchYoY.text}</td>
          <td class="num">${formatCurrency(data.revenue)}</td>
          <td class="num">${formatCurrency(prev.revenue)}</td>
          <td class="num ${revYoY.class}">${revYoY.text}</td>
        </tr>`;
      });

      html += '</tbody></table></div></div>';
    });

    return html;
  },

  renderSearchConsole() {
    if (typeof SEARCH_CONSOLE_DATA === 'undefined') return '';
    const month = DataLoader.currentMonth;
    const scData = SEARCH_CONSOLE_DATA[month];
    if (!scData || !scData.current || scData.current.length === 0) return '';

    const cur = scData.current;
    const prev = scData.previous || [];
    const prevMap = {};
    prev.forEach(r => { prevMap[r.q] = r; });

    // KPIサマリー
    const totalClicks = cur.reduce((s, r) => s + r.clicks, 0);
    const totalImps = cur.reduce((s, r) => s + r.impressions, 0);
    const prevTotalClicks = prev.reduce((s, r) => s + r.clicks, 0);
    const prevTotalImps = prev.reduce((s, r) => s + r.impressions, 0);
    const avgCtr = totalImps > 0 ? (totalClicks / totalImps * 100) : 0;
    const prevAvgCtr = prevTotalImps > 0 ? (prevTotalClicks / prevTotalImps * 100) : 0;

    let html = `<div class="section-card"><h3>Search Console オーガニック検索分析</h3>`;

    // ミニKPI
    const kpis = [
      buildKPI('オーガニッククリック', totalClicks, prevTotalClicks),
      buildKPI('表示回数', totalImps, prevTotalImps),
      buildKPI('平均CTR', avgCtr, prevAvgCtr, { decimals: 2, suffix: '%' })
    ];
    html += '<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px;">';
    kpis.forEach(kpi => {
      const arrow = kpi.changeClass === 'positive' ? '&#9650;' : kpi.changeClass === 'negative' ? '&#9660;' : '&#9654;';
      html += `<div class="kpi-card" style="padding:12px 16px;">
        <div class="label">${kpi.label}</div>
        <div class="value" style="font-size:24px;">${kpi.formattedCurrent}</div>
        <div class="previous">${compLabel()}: ${kpi.formattedPrevious}</div>
        <div class="change ${kpi.changeClass}">${arrow} ${kpi.changeText}</div>
      </div>`;
    });
    html += '</div>';

    // Top20 クエリテーブル
    const top20 = cur.slice(0, 20);
    html += `<div class="table-scroll"><table class="data-table"><thead><tr>
      <th>#</th><th>検索クエリ</th>
      <th class="num">クリック</th><th class="num">${compLabel()}</th><th class="num">変化</th>
      <th class="num">表示回数</th><th class="num">${compLabel()}</th>
      <th class="num">CTR</th><th class="num">順位</th><th class="num">前年順位</th>
    </tr></thead><tbody>`;

    top20.forEach((r, i) => {
      const p = prevMap[r.q] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      const clickYoY = formatYoYChange(r.clicks, p.clicks);
      const posChange = p.position > 0 ? (p.position - r.position) : 0;
      const posClass = posChange > 0 ? 'positive' : posChange < 0 ? 'negative' : '';
      html += `<tr>
        <td>${i + 1}</td>
        <td>${r.q}</td>
        <td class="num">${formatNumber(r.clicks)}</td>
        <td class="num">${formatNumber(p.clicks)}</td>
        <td class="num ${clickYoY.class}">${clickYoY.text}</td>
        <td class="num">${formatNumber(r.impressions)}</td>
        <td class="num">${formatNumber(p.impressions)}</td>
        <td class="num">${r.ctr.toFixed(1)}%</td>
        <td class="num">${r.position.toFixed(1)}</td>
        <td class="num ${posClass}">${p.position > 0 ? p.position.toFixed(1) : '-'}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';

    // クリック増加/減少Top10
    const withDiff = cur.map(r => {
      const p = prevMap[r.q] || { clicks: 0 };
      return { ...r, prevClicks: p.clicks, diff: r.clicks - p.clicks };
    }).filter(r => r.clicks > 0 || r.prevClicks > 0);

    const increased = [...withDiff].sort((a, b) => b.diff - a.diff).filter(r => r.diff > 0).slice(0, 10);
    const decreased = [...withDiff].sort((a, b) => a.diff - b.diff).filter(r => r.diff < 0).slice(0, 10);

    const renderChangeTable = (rows, title, colorClass) => {
      let h = `</div><div class="section-card"><h3>${title}</h3><div class="table-scroll"><table class="data-table"><thead><tr>
        <th>#</th><th>検索クエリ</th>
        <th class="num">クリック</th><th class="num">${compLabel()}</th><th class="num">変化量</th>
        <th class="num">表示回数</th><th class="num">CTR</th><th class="num">順位</th>
      </tr></thead><tbody>`;
      rows.forEach((r, i) => {
        h += `<tr>
          <td>${i + 1}</td><td>${r.q}</td>
          <td class="num">${formatNumber(r.clicks)}</td>
          <td class="num">${formatNumber(r.prevClicks)}</td>
          <td class="num ${colorClass}">${r.diff > 0 ? '+' : ''}${formatNumber(r.diff)}</td>
          <td class="num">${formatNumber(r.impressions)}</td>
          <td class="num">${r.ctr.toFixed(1)}%</td>
          <td class="num">${r.position.toFixed(1)}</td>
        </tr>`;
      });
      h += '</tbody></table></div></div>';
      return h;
    };

    if (prev.length > 0) {
      html += `<div class="chart-row">
        ${renderChangeTable(increased, 'オーガニック クリック増加 Top10（${compLabel()}比）', 'positive')}
        ${renderChangeTable(decreased, 'オーガニック クリック減少 Top10（${compLabel()}比）', 'negative')}
      </div>`;
    }

    return html;
  },

  renderCharts(ga) {
    const prevMap = {};
    ga.previous.forEach(r => { prevMap[r.source] = r; });

    // 上位10流入元
    const top = ga.current.filter(r => r.sessions > 0).sort((a, b) => b.sessions - a.sessions).slice(0, 10);
    const labels = top.map(r => r.source.length > 15 ? r.source.slice(0, 15) + '...' : r.source);

    createHorizontalBarChart('chart-ga-sessions', labels, [
      { label: ComparisonEngine.getChartLabels(DataLoader.currentMonth).current, data: top.map(r => r.sessions), backgroundColor: CHART_COLORS.primary, borderRadius: 4 },
      { label: ComparisonEngine.getChartLabels(DataLoader.currentMonth).comparison, data: top.map(r => (prevMap[r.source] || {}).sessions || 0), backgroundColor: CHART_COLORS.prevYear, borderRadius: 4 }
    ]);

    // 収益上位
    const topRev = ga.current.filter(r => r.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const revLabels = topRev.map(r => r.source.length > 15 ? r.source.slice(0, 15) + '...' : r.source);

    createHorizontalBarChart('chart-ga-revenue', revLabels, [
      { label: ComparisonEngine.getChartLabels(DataLoader.currentMonth).current, data: topRev.map(r => r.revenue), backgroundColor: CHART_COLORS.secondary, borderRadius: 4 },
      { label: ComparisonEngine.getChartLabels(DataLoader.currentMonth).comparison, data: topRev.map(r => (prevMap[r.source] || {}).revenue || 0), backgroundColor: CHART_COLORS.prevYear, borderRadius: 4 }
    ], {
      plugins: { ...CHART_DEFAULTS.plugins, tooltip: { ...CHART_DEFAULTS.plugins.tooltip, callbacks: { label: ctx => ctx.dataset.label + ': ' + formatCurrency(ctx.raw) } } }
    });
  }
};

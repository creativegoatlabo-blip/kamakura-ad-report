// Google広告 キーワード分析タブ

const GoogleAdsSection = {
  currentStore: '全店',

  render(data) {
    const container = document.getElementById('tab-google-ads');

    let html = '<div class="sub-tabs" id="gads-store-tabs">';
    ['全店', ...STORE_LIST].forEach(s => {
      html += `<button class="sub-tab ${s === this.currentStore ? 'active' : ''}" data-store="${s}">${s}</button>`;
    });
    html += '</div>';
    html += '<div id="gads-content"></div>';

    container.innerHTML = html;

    document.querySelectorAll('#gads-store-tabs .sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentStore = btn.dataset.store;
        document.querySelectorAll('#gads-store-tabs .sub-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderStoreContent(data);
      });
    });

    this.renderStoreContent(data);
  },

  // 全店用の統合データを生成
  getAllStoreData(data) {
    const allRows = [];
    let spend = 0, spendPrev = 0, cv = 0, cvPrev = 0, clicks = 0, clicksPrev = 0, impressions = 0, impressionsPrev = 0;

    STORE_LIST.forEach(s => {
      const sd = data.googleAds[s];
      sd.rows.forEach(r => allRows.push({ ...r, store: s }));
      spend += sd.summary.spend;
      spendPrev += sd.summary.spendPrev;
      cv += sd.summary.cv;
      cvPrev += sd.summary.cvPrev;
      clicks += sd.summary.clicks;
      clicksPrev += sd.summary.clicksPrev;
      impressions += sd.summary.impressions;
      impressionsPrev += sd.summary.impressionsPrev;
    });

    return {
      rows: allRows,
      summary: {
        store: '全店',
        spend, spendPrev, cv, cvPrev, clicks, clicksPrev, impressions, impressionsPrev,
        cpa: cv > 0 ? spend / cv : 0,
        cpaPrev: cvPrev > 0 ? spendPrev / cvPrev : 0,
        cvr: clicks > 0 ? (cv / clicks) * 100 : 0,
        cvrPrev: clicksPrev > 0 ? (cvPrev / clicksPrev) * 100 : 0
      }
    };
  },

  renderStoreContent(data) {
    const store = this.currentStore;
    const storeData = store === '全店' ? this.getAllStoreData(data) : data.googleAds[store];
    const container = document.getElementById('gads-content');
    const sum = storeData.summary;
    const isAllStore = store === '全店';

    // KPIカード
    const kpis = [
      buildKPI('消化金額', sum.spend, sum.spendPrev, { isCurrency: true }),
      buildKPI('CV数', sum.cv, sum.cvPrev, { decimals: 1 }),
      buildKPI('CPA', sum.cpa, sum.cpaPrev, { isCurrency: true, isInverse: true }),
      buildKPI('CVR', sum.cvr, sum.cvrPrev, { decimals: 2, suffix: '%' })
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

    // 指名/非指名比率
    html += this.renderBrandAnalysis(storeData);

    // Top10 CVキーワード
    html += this.renderTop10Keywords(storeData, isAllStore);

    // CV数変化量ランキング
    html += this.renderCVChangeRanking(storeData, isAllStore);

    // 無駄コスト分析
    html += this.renderWastedSpend(storeData, isAllStore);

    // CVR変動キーワード
    html += this.renderCVRChanges(storeData, isAllStore);

    // 広告 vs オーガニック重複分析
    html += this.renderAdVsOrganic(storeData);

    // 変更履歴と影響分析
    if (typeof ChangeHistoryAnalyzer !== 'undefined') {
      html += ChangeHistoryAnalyzer.renderChangeSection(DataLoader.currentMonth, store, storeData);
    }

    container.innerHTML = html;
    this.renderTop10Chart(storeData);
  },

  renderBrandAnalysis(storeData) {
    const rows = storeData.rows;
    const brand = { cv: 0, cvPrev: 0, spend: 0, spendPrev: 0 };
    const nonBrand = { cv: 0, cvPrev: 0, spend: 0, spendPrev: 0 };

    rows.forEach(r => {
      const target = r.isBrand ? brand : nonBrand;
      target.cv += r.cv;
      target.cvPrev += r.cvPrev;
      target.spend += r.cost;
      target.spendPrev += r.costPrev;
    });

    const brandYoY = formatYoYChange(brand.cv, brand.cvPrev);
    const nonBrandYoY = formatYoYChange(nonBrand.cv, nonBrand.cvPrev);
    const total = brand.cv + nonBrand.cv;
    const brandRatio = total > 0 ? (brand.cv / total * 100).toFixed(1) : '0';
    const nonBrandRatio = total > 0 ? (nonBrand.cv / total * 100).toFixed(1) : '0';

    return `
      <div class="section-card">
        <h3>指名検索 / 一般検索 比率</h3>
        <table class="data-table">
          <thead><tr>
            <th>種別</th><th class="num">CV数</th><th class="num">${compLabel()}</th><th class="num">増減</th>
            <th class="num">費用</th><th class="num">${compLabel()}</th><th class="num">CV比率</th>
          </tr></thead>
          <tbody>
            <tr>
              <td><span class="badge brand">指名検索</span></td>
              <td class="num">${formatNumber(brand.cv, 1)}</td>
              <td class="num">${formatNumber(brand.cvPrev, 1)}</td>
              <td class="num ${brandYoY.class}">${brandYoY.text}</td>
              <td class="num">${formatCurrency(brand.spend)}</td>
              <td class="num">${formatCurrency(brand.spendPrev)}</td>
              <td class="num">${brandRatio}%</td>
            </tr>
            <tr>
              <td><span class="badge non-brand">一般検索</span></td>
              <td class="num">${formatNumber(nonBrand.cv, 1)}</td>
              <td class="num">${formatNumber(nonBrand.cvPrev, 1)}</td>
              <td class="num ${nonBrandYoY.class}">${nonBrandYoY.text}</td>
              <td class="num">${formatCurrency(nonBrand.spend)}</td>
              <td class="num">${formatCurrency(nonBrand.spendPrev)}</td>
              <td class="num">${nonBrandRatio}%</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  },

  renderTop10Keywords(storeData, isAllStore) {
    const top10 = storeData.rows
      .filter(r => r.cv > 0)
      .sort((a, b) => b.cv - a.cv)
      .slice(0, 10);

    let html = `
      <div class="chart-row">
        <div class="section-card">
          <h3>コンバージョン Top10 キーワード</h3>
          <div class="chart-container"><canvas id="chart-top10-kw"></canvas></div>
        </div>
        <div class="section-card">
          <h3>Top10 詳細</h3>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr>
                <th>#</th>${isAllStore ? '<th>店舗</th>' : ''}<th>検索語句</th>
                <th class="num">CV</th><th class="num">${compLabel()}</th><th class="num">変化</th>
                <th class="num">CPA</th><th class="num">費用</th><th class="num">CTR</th>
              </tr></thead><tbody>`;

    top10.forEach((r, i) => {
      const yoy = formatYoYChange(r.cv, r.cvPrev);
      html += `<tr>
        <td>${i + 1}</td>
        ${isAllStore ? '<td>' + (r.store || '') + '</td>' : ''}
        <td title="${r.query}">${r.query.length > 30 ? r.query.slice(0, 30) + '...' : r.query}</td>
        <td class="num">${formatNumber(r.cv, 1)}</td>
        <td class="num">${formatNumber(r.cvPrev, 1)}</td>
        <td class="num ${yoy.class}">${yoy.text}</td>
        <td class="num">${formatCurrency(r.cpa)}</td>
        <td class="num">${formatCurrency(r.cost)}</td>
        <td class="num">${formatPercent(r.ctr)}</td>
      </tr>`;
    });

    html += '</tbody></table></div></div></div>';
    return html;
  },

  renderTop10Chart(storeData) {
    const top10 = storeData.rows
      .filter(r => r.cv > 0)
      .sort((a, b) => b.cv - a.cv)
      .slice(0, 10);

    if (top10.length === 0) return;

    const labels = top10.map(r => r.query.length > 20 ? r.query.slice(0, 20) + '...' : r.query);
    createHorizontalBarChart('chart-top10-kw', labels, [
      { label: ComparisonEngine.getChartLabels(DataLoader.currentMonth).current + ' CV', data: top10.map(r => r.cv), backgroundColor: CHART_COLORS.primary, borderRadius: 4 },
      { label: ComparisonEngine.getChartLabels(DataLoader.currentMonth).comparison + ' CV', data: top10.map(r => r.cvPrev), backgroundColor: CHART_COLORS.prevYear, borderRadius: 4 }
    ]);
  },

  renderCVChangeRanking(storeData, isAllStore) {
    const rows = storeData.rows.filter(r => r.cv > 0 || r.cvPrev > 0);
    const withDiff = rows.map(r => ({ ...r, diff: r.cv - r.cvPrev }));

    const increased = [...withDiff].sort((a, b) => b.diff - a.diff).filter(r => r.diff > 0).slice(0, 10);
    const decreased = [...withDiff].sort((a, b) => a.diff - b.diff).filter(r => r.diff < 0).slice(0, 10);

    const renderTable = (items, title, colorClass) => {
      let html = `<div class="section-card"><h3>${title}</h3><div class="table-scroll"><table class="data-table">
        <thead><tr>
          <th>#</th>${isAllStore ? '<th>店舗</th>' : ''}<th>検索語句</th>
          <th class="num">CV</th><th class="num">${compLabel()}</th><th class="num">変化量</th><th class="num">変化率</th>
          <th class="num">費用</th><th class="num">CPA</th>
        </tr></thead><tbody>`;

      items.forEach((r, i) => {
        const yoy = formatYoYChange(r.cv, r.cvPrev);
        html += `<tr>
          <td>${i + 1}</td>
          ${isAllStore ? '<td>' + (r.store || '') + '</td>' : ''}
          <td title="${r.query}">${r.query.length > 30 ? r.query.slice(0, 30) + '...' : r.query}</td>
          <td class="num">${formatNumber(r.cv, 1)}</td>
          <td class="num">${formatNumber(r.cvPrev, 1)}</td>
          <td class="num ${colorClass}">${r.diff > 0 ? '+' : ''}${formatNumber(r.diff, 1)}</td>
          <td class="num ${yoy.class}">${yoy.text}</td>
          <td class="num">${formatCurrency(r.cost)}</td>
          <td class="num">${formatCurrency(r.cpa)}</td>
        </tr>`;
      });

      html += '</tbody></table></div></div>';
      return html;
    };

    return `<div class="chart-row">
      ${renderTable(increased, 'CV数 増加 Top10（変化量順）', 'positive')}
      ${renderTable(decreased, 'CV数 減少 Top10（変化量順）', 'negative')}
    </div>`;
  },

  renderWastedSpend(storeData, isAllStore) {
    const wasted = storeData.rows
      .filter(r => r.cost > 0 && r.cv === 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    const totalWasted = storeData.rows
      .filter(r => r.cost > 0 && r.cv === 0)
      .reduce((sum, r) => sum + r.cost, 0);

    let html = `
      <div class="section-card">
        <h3>無駄コスト分析（CV0・費用発生キーワード Top10）</h3>
        <p style="color:var(--text-secondary);margin-bottom:12px;">CV0キーワードの費用合計: <strong style="color:var(--negative)">${formatCurrency(totalWasted)}</strong></p>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr>
              ${isAllStore ? '<th>店舗</th>' : ''}<th>検索語句</th><th class="num">費用</th><th class="num">クリック数</th>
              <th class="num">表示回数</th><th class="num">CTR</th>
            </tr></thead><tbody>`;

    wasted.forEach(r => {
      html += `<tr>
        ${isAllStore ? '<td>' + (r.store || '') + '</td>' : ''}
        <td title="${r.query}">${r.query.length > 40 ? r.query.slice(0, 40) + '...' : r.query}</td>
        <td class="num">${formatCurrency(r.cost)}</td>
        <td class="num">${formatNumber(r.clicks)}</td>
        <td class="num">${formatNumber(r.impressions)}</td>
        <td class="num">${formatPercent(r.ctr)}</td>
      </tr>`;
    });

    html += '</tbody></table></div></div>';
    return html;
  },

  renderCVRChanges(storeData, isAllStore) {
    const withBothYears = storeData.rows.filter(r => r.clicks > 0 && r.clicksPrev > 0 && (r.cv > 0 || r.cvPrev > 0));

    const improved = withBothYears
      .filter(r => r.cvr > r.cvrPrev)
      .sort((a, b) => (b.cvr - b.cvrPrev) - (a.cvr - a.cvrPrev))
      .slice(0, 5);

    const declined = withBothYears
      .filter(r => r.cvr < r.cvrPrev)
      .sort((a, b) => (a.cvr - a.cvrPrev) - (b.cvr - b.cvrPrev))
      .slice(0, 5);

    const renderTable = (rows, title, colorClass) => {
      let html = `<div class="section-card"><h3>${title}</h3><div class="table-scroll"><table class="data-table">
        <thead><tr>
          ${isAllStore ? '<th>店舗</th>' : ''}<th>検索語句</th><th class="num">CVR(今年)</th><th class="num">CVR(${compLabel()})</th>
          <th class="num">CV(今年)</th><th class="num">CV(${compLabel()})</th><th class="num">費用</th>
        </tr></thead><tbody>`;

      rows.forEach(r => {
        html += `<tr>
          ${isAllStore ? '<td>' + (r.store || '') + '</td>' : ''}
          <td>${r.query.length > 35 ? r.query.slice(0, 35) + '...' : r.query}</td>
          <td class="num ${colorClass}">${formatPercent(r.cvr, 2)}</td>
          <td class="num">${formatPercent(r.cvrPrev, 2)}</td>
          <td class="num">${formatNumber(r.cv, 1)}</td>
          <td class="num">${formatNumber(r.cvPrev, 1)}</td>
          <td class="num">${formatCurrency(r.cost)}</td>
        </tr>`;
      });

      html += '</tbody></table></div></div>';
      return html;
    };

    return `<div class="chart-row">
      ${renderTable(improved, 'CVR改善キーワード Top5', 'positive')}
      ${renderTable(declined, 'CVR悪化キーワード Top5', 'negative')}
    </div>`;
  },

  renderAdVsOrganic(storeData) {
    if (typeof SEARCH_CONSOLE_DATA === 'undefined') return '';
    const month = DataLoader.currentMonth;
    const scData = SEARCH_CONSOLE_DATA[month];
    if (!scData || !scData.current || scData.current.length === 0) return '';

    // SC データをマップ化（スペース除去で正規化）
    const scMap = {};
    scData.current.forEach(r => {
      const normalized = r.q.replace(/ /g, '');
      if (!scMap[normalized]) scMap[normalized] = r;
    });

    // 広告KWとオーガニックKWの重複を検出
    const overlaps = [];
    storeData.rows.forEach(r => {
      if (r.cv === 0 && r.cost === 0) return;
      const sc = scMap[r.query];
      if (sc) {
        overlaps.push({
          query: r.query,
          adCost: r.cost,
          adCV: r.cv,
          adCPA: r.cpa,
          adClicks: r.clicks,
          orgClicks: sc.clicks,
          orgImpressions: sc.impressions,
          orgPosition: sc.position,
          orgCtr: sc.ctr
        });
      }
    });

    if (overlaps.length === 0) return '';

    // 広告費が高いがオーガニックでも上位のKW（コスト削減の機会）
    const costSaving = overlaps
      .filter(r => r.orgPosition <= 5 && r.adCost > 5000)
      .sort((a, b) => b.adCost - a.adCost)
      .slice(0, 10);

    // 広告費が高くオーガニック順位が低いKW（SEO強化の機会）
    const seoOpportunity = overlaps
      .filter(r => r.orgPosition > 5 && r.adCost > 10000 && r.adCV > 0)
      .sort((a, b) => b.adCost - a.adCost)
      .slice(0, 10);

    let html = '';

    if (costSaving.length > 0) {
      html += `<div class="section-card"><h3>広告費削減の機会（オーガニック上位 & 広告出稿中）</h3>
        <p style="color:var(--text-secondary);margin-bottom:12px;">オーガニック順位5位以内で広告にも費用を使っているKW。広告の入札を下げてもオーガニックでカバーできる可能性があります。</p>
        <div class="table-scroll"><table class="data-table"><thead><tr>
          <th>検索語句</th>
          <th class="num">広告費用</th><th class="num">広告CV</th><th class="num">広告CPA</th>
          <th class="num">自然クリック</th><th class="num">自然順位</th><th class="num">自然CTR</th>
        </tr></thead><tbody>`;
      costSaving.forEach(r => {
        html += `<tr>
          <td>${r.query}</td>
          <td class="num">${formatCurrency(r.adCost)}</td>
          <td class="num">${formatNumber(r.adCV, 1)}</td>
          <td class="num">${formatCurrency(r.adCPA)}</td>
          <td class="num">${formatNumber(r.orgClicks)}</td>
          <td class="num positive">${r.orgPosition.toFixed(1)}</td>
          <td class="num">${r.orgCtr.toFixed(1)}%</td>
        </tr>`;
      });
      html += '</tbody></table></div></div>';
    }

    if (seoOpportunity.length > 0) {
      html += `<div class="section-card"><h3>SEO強化の機会（広告依存 & オーガニック順位低）</h3>
        <p style="color:var(--text-secondary);margin-bottom:12px;">広告で費用をかけているがオーガニック順位が低いKW。SEO改善でオーガニック流入を増やせれば広告費を削減できます。</p>
        <div class="table-scroll"><table class="data-table"><thead><tr>
          <th>検索語句</th>
          <th class="num">広告費用</th><th class="num">広告CV</th><th class="num">広告CPA</th>
          <th class="num">自然クリック</th><th class="num">自然順位</th><th class="num">自然CTR</th>
        </tr></thead><tbody>`;
      seoOpportunity.forEach(r => {
        html += `<tr>
          <td>${r.query}</td>
          <td class="num">${formatCurrency(r.adCost)}</td>
          <td class="num">${formatNumber(r.adCV, 1)}</td>
          <td class="num">${formatCurrency(r.adCPA)}</td>
          <td class="num">${formatNumber(r.orgClicks)}</td>
          <td class="num negative">${r.orgPosition.toFixed(1)}</td>
          <td class="num">${r.orgCtr.toFixed(1)}%</td>
        </tr>`;
      });
      html += '</tbody></table></div></div>';
    }

    return html;
  }
};

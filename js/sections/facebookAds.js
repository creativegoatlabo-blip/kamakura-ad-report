// Facebook広告 分析タブ

const FacebookAdsSection = {
  currentStore: '全店',

  render(data) {
    const container = document.getElementById('tab-facebook-ads');

    let html = '<div class="sub-tabs" id="fb-store-tabs">';
    ['全店', ...STORE_LIST].forEach(s => {
      html += `<button class="sub-tab ${s === this.currentStore ? 'active' : ''}" data-store="${s}">${s}</button>`;
    });
    html += '</div>';
    html += '<div id="fb-content"></div>';

    container.innerHTML = html;

    document.querySelectorAll('#fb-store-tabs .sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentStore = btn.dataset.store;
        document.querySelectorAll('#fb-store-tabs .sub-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderStoreContent(data);
      });
    });

    this.renderStoreContent(data);
  },

  filterByStore(rows, store) {
    if (store === '全店') return rows;
    return rows.filter(r => r.store === store);
  },

  renderStoreContent(data) {
    const container = document.getElementById('fb-content');
    const store = this.currentStore;
    const fb = {
      current: this.filterByStore(data.facebook.current, store),
      previous: this.filterByStore(data.facebook.previous, store)
    };

    // KPI
    const curTotal = { spend: 0, cv: 0, reach: 0, impressions: 0 };
    const prevTotal = { spend: 0, cv: 0, reach: 0, impressions: 0 };
    fb.current.forEach(r => { curTotal.spend += r.spend; curTotal.cv += r.conversions; curTotal.reach += r.reach; curTotal.impressions += r.impressions; });
    fb.previous.forEach(r => { prevTotal.spend += r.spend; prevTotal.cv += r.conversions; prevTotal.reach += r.reach; prevTotal.impressions += r.impressions; });

    const kpis = [
      buildKPI('消化金額', curTotal.spend, prevTotal.spend, { isCurrency: true }),
      buildKPI('予約完了(CV)', curTotal.cv, prevTotal.cv),
      buildKPI('CPA', curTotal.cv > 0 ? curTotal.spend / curTotal.cv : 0, prevTotal.cv > 0 ? prevTotal.spend / prevTotal.cv : 0, { isCurrency: true, isInverse: true }),
      buildKPI('リーチ', curTotal.reach, prevTotal.reach)
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

    // 全店のみ: 店舗別シェアドーナツ
    if (store === '全店') {
      html += `<div class="chart-row">
        <div class="section-card">
          <h3>店舗別 消化金額シェア</h3>
          <div class="chart-container"><canvas id="chart-fb-store-share"></canvas></div>
        </div>
        <div class="section-card">
          <h3>キャンペーン別 CV数（${compLabel()}比較）</h3>
          <div class="chart-container"><canvas id="chart-fb-campaign-cv"></canvas></div>
        </div>
      </div>`;
    } else {
      html += `<div class="section-card">
        <h3>キャンペーン別 CV数（${compLabel()}比較）</h3>
        <div class="chart-container"><canvas id="chart-fb-campaign-cv"></canvas></div>
      </div>`;
    }

    // キャンペーン別テーブル
    html += this.renderCampaignTable(fb, store);

    // クリエイティブ別ランキング
    html += this.renderCreativeRanking(fb, store);

    // 年齢×性別分析
    html += this.renderDemoAnalysis(fb);

    // フリークエンシー分析
    html += this.renderFrequencyAnalysis(fb);

    container.innerHTML = html;
    this.renderCharts(fb, data.facebook, store);
  },

  renderCampaignTable(fb, store) {
    const curCampaigns = DataLoader.getFBCampaignSummary(fb.current);
    const prevCampaigns = DataLoader.getFBCampaignSummary(fb.previous);
    const prevMap = {};
    prevCampaigns.forEach(c => { prevMap[c.store + '|' + c.campaign] = c; });

    const sorted = curCampaigns.sort((a, b) => b.conversions - a.conversions);
    const showStore = store === '全店';

    let html = `<div class="section-card"><h3>キャンペーン別パフォーマンス</h3><div class="table-scroll">
      <table class="data-table"><thead><tr>
        ${showStore ? '<th>店舗</th>' : ''}<th>キャンペーン</th>
        <th class="num">消化金額</th><th class="num">${compLabel()}</th>
        <th class="num">CV</th><th class="num">${compLabel()}</th><th class="num">増減</th>
        <th class="num">CPA</th><th class="num">リーチ</th><th class="num">平均CTR</th>
      </tr></thead><tbody>`;

    sorted.forEach(c => {
      const prev = prevMap[c.store + '|' + c.campaign] || { spend: 0, conversions: 0 };
      const yoy = formatYoYChange(c.conversions, prev.conversions);
      html += `<tr>
        ${showStore ? '<td>' + c.store + '</td>' : ''}
        <td title="${c.campaign}">${c.campaign.length > 35 ? c.campaign.slice(0, 35) + '...' : c.campaign}</td>
        <td class="num">${formatCurrency(c.spend)}</td>
        <td class="num">${formatCurrency(prev.spend)}</td>
        <td class="num">${formatNumber(c.conversions)}</td>
        <td class="num">${formatNumber(prev.conversions)}</td>
        <td class="num ${yoy.class}">${yoy.text}</td>
        <td class="num">${formatCurrency(c.cpa)}</td>
        <td class="num">${formatNumber(c.reach)}</td>
        <td class="num">${formatPercent(c.avgCtr, 2)}</td>
      </tr>`;
    });

    html += '</tbody></table></div></div>';
    return html;
  },

  renderCreativeRanking(fb, store) {
    const curCreatives = DataLoader.getFBCreativeSummary(fb.current);
    const prevCreatives = DataLoader.getFBCreativeSummary(fb.previous);
    const prevMap = {};
    prevCreatives.forEach(c => { prevMap[c.store + '|' + c.adName] = c; });

    const top = curCreatives
      .filter(c => c.conversions > 0)
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 15);

    const showStore = store === '全店';

    let html = `<div class="section-card"><h3>広告クリエイティブ別 CV数ランキング</h3><div class="table-scroll">
      <table class="data-table"><thead><tr>
        <th>#</th>${showStore ? '<th>店舗</th>' : ''}<th>クリエイティブ名</th>
        <th class="num">CV</th><th class="num">${compLabel()}</th><th class="num">変化</th>
        <th class="num">消化金額</th><th class="num">CPA</th><th class="num">CTR</th>
      </tr></thead><tbody>`;

    top.forEach((c, i) => {
      const prev = prevMap[c.store + '|' + c.adName] || { conversions: 0 };
      const yoy = formatYoYChange(c.conversions, prev.conversions);
      html += `<tr>
        <td>${i + 1}</td>
        ${showStore ? '<td>' + c.store + '</td>' : ''}
        <td title="${c.adName}">${c.adName.length > 35 ? c.adName.slice(0, 35) + '...' : c.adName}</td>
        <td class="num">${formatNumber(c.conversions)}</td>
        <td class="num">${formatNumber(prev.conversions)}</td>
        <td class="num ${yoy.class}">${yoy.text}</td>
        <td class="num">${formatCurrency(c.spend)}</td>
        <td class="num">${formatCurrency(c.cpa)}</td>
        <td class="num">${formatPercent(c.avgCtr, 2)}</td>
      </tr>`;
    });

    html += '</tbody></table></div></div>';
    return html;
  },

  renderDemoAnalysis(fb) {
    const curDemo = DataLoader.getFBDemoSummary(fb.current);
    const prevDemo = DataLoader.getFBDemoSummary(fb.previous);
    const prevMap = {};
    prevDemo.forEach(d => { prevMap[d.age + '|' + d.gender] = d; });

    const genderMap = { female: '女性', male: '男性', unknown: '不明' };
    const withCV = curDemo.filter(d => d.conversions > 0).sort((a, b) => b.conversions - a.conversions);

    let html = `<div class="section-card"><h3>年齢 x 性別 コンバージョン分析</h3><div class="table-scroll">
      <table class="data-table"><thead><tr>
        <th>年齢</th><th>性別</th>
        <th class="num">CV</th><th class="num">${compLabel()}</th><th class="num">変化</th>
        <th class="num">消化金額</th><th class="num">CPA</th>
      </tr></thead><tbody>`;

    withCV.slice(0, 15).forEach(d => {
      const prev = prevMap[d.age + '|' + d.gender] || { conversions: 0 };
      const yoy = formatYoYChange(d.conversions, prev.conversions);
      html += `<tr>
        <td>${d.age}</td>
        <td>${genderMap[d.gender] || d.gender}</td>
        <td class="num">${formatNumber(d.conversions)}</td>
        <td class="num">${formatNumber(prev.conversions)}</td>
        <td class="num ${yoy.class}">${yoy.text}</td>
        <td class="num">${formatCurrency(d.spend)}</td>
        <td class="num">${formatCurrency(d.cpa)}</td>
      </tr>`;
    });

    html += '</tbody></table></div></div>';
    return html;
  },

  renderFrequencyAnalysis(fb) {
    const creatives = DataLoader.getFBCreativeSummary(fb.current);
    const highFreq = creatives
      .filter(c => c.avgFrequency > 3 && c.impressions > 500)
      .sort((a, b) => b.avgFrequency - a.avgFrequency)
      .slice(0, 10);

    if (highFreq.length === 0) return '';

    let html = `<div class="section-card"><h3>広告疲労リスク（高フリークエンシー広告）</h3>
      <p style="color:var(--text-secondary);margin-bottom:12px;">フリークエンシー3以上 & インプレッション500以上の広告</p>
      <div class="table-scroll"><table class="data-table"><thead><tr>
        <th>店舗</th><th>クリエイティブ</th>
        <th class="num">フリークエンシー</th><th class="num">CTR</th><th class="num">CV</th><th class="num">CPA</th>
      </tr></thead><tbody>`;

    highFreq.forEach(c => {
      const fatigueClass = c.avgCtr < 1 ? 'negative' : '';
      html += `<tr>
        <td>${c.store}</td>
        <td>${c.adName.length > 30 ? c.adName.slice(0, 30) + '...' : c.adName}</td>
        <td class="num ${c.avgFrequency > 5 ? 'negative' : ''}">${formatNumber(c.avgFrequency, 1)}</td>
        <td class="num ${fatigueClass}">${formatPercent(c.avgCtr, 2)}</td>
        <td class="num">${formatNumber(c.conversions)}</td>
        <td class="num">${formatCurrency(c.cpa)}</td>
      </tr>`;
    });

    html += '</tbody></table></div></div>';
    return html;
  },

  renderCharts(fb, allFb, store) {
    // 全店のみ: 店舗別消化金額シェア
    if (store === '全店') {
      const fbStore = DataLoader.getFBStoreSummary(allFb.current);
      createDoughnutChart('chart-fb-store-share',
        STORE_LIST,
        STORE_LIST.map(s => fbStore[s].spend),
        STORE_LIST.map(s => STORE_COLORS[s])
      );
    }

    // キャンペーン別CV
    const curCampaigns = DataLoader.getFBCampaignSummary(fb.current);
    const prevCampaigns = DataLoader.getFBCampaignSummary(fb.previous);
    const topCampaigns = curCampaigns.sort((a, b) => b.conversions - a.conversions).slice(0, 5);
    const prevMap = {};
    prevCampaigns.forEach(c => { prevMap[c.store + '|' + c.campaign] = c; });

    const labels = topCampaigns.map(c => {
      const name = c.campaign.length > 20 ? c.campaign.slice(0, 20) + '...' : c.campaign;
      return store === '全店' ? c.store.slice(0, 2) + ':' + name : name;
    });

    createBarChart('chart-fb-campaign-cv', labels, [
      { label: ComparisonEngine.getChartLabels(DataLoader.currentMonth).current, data: topCampaigns.map(c => c.conversions), backgroundColor: CHART_COLORS.accent, borderRadius: 4 },
      { label: ComparisonEngine.getChartLabels(DataLoader.currentMonth).comparison, data: topCampaigns.map(c => (prevMap[c.store + '|' + c.campaign] || {}).conversions || 0), backgroundColor: CHART_COLORS.prevYear, borderRadius: 4 }
    ]);
  }
};

// 比較対象モード管理

const ComparisonEngine = {
  mode: 'prev_year',

  MODES: {
    prev_year:  { label: '前年',           short: '前年' },
    prev_month: { label: '前月',           short: '前月' },
    avg_3m:     { label: '直近3ヶ月平均',  short: '3ヶ月平均' },
    avg_6m:     { label: '直近6ヶ月平均',  short: '6ヶ月平均' }
  },

  get label() { return this.MODES[this.mode].label; },
  get shortLabel() { return this.MODES[this.mode].short; },

  // 比較対象の月リストを取得
  getCompMonths(currentMonth) {
    const [y, m] = currentMonth.split('_').map(Number);
    switch (this.mode) {
      case 'prev_year':
        return [this._monthStr(y - 1, m)];
      case 'prev_month':
        return [this._prevMonthN(y, m, 1)];
      case 'avg_3m':
        return [1, 2, 3].map(i => this._prevMonthN(y, m, i));
      case 'avg_6m':
        return [1, 2, 3, 4, 5, 6].map(i => this._prevMonthN(y, m, i));
    }
    return [];
  },

  // チャートラベル生成
  getChartLabels(currentMonth) {
    const [y, m] = currentMonth.split('_');
    const curLabel = `${y}年${parseInt(m)}月`;
    return { current: curLabel, comparison: this.label };
  },

  // ===== Google Ads 比較データ計算 =====
  computeGoogleAdsComparison(currentMonth) {
    if (typeof GOOGLE_ADS_MASTER === 'undefined') return null;

    const compMonths = this.getCompMonths(currentMonth);
    const stores = {};
    const storeNames = ['鎌倉本店', '横浜元町', '大阪中崎町'];

    storeNames.forEach(store => {
      let totalCV = 0, totalCost = 0, totalClicks = 0, totalImps = 0;
      const queryAgg = {};
      let monthsWithData = 0;

      compMonths.forEach(cm => {
        const md = (GOOGLE_ADS_MASTER[cm] || {})[store];
        if (!md || !md.r) return;
        monthsWithData++;

        // 行サマリーからstore総計を計算
        const s = md.s || {};
        totalCV += s.cv || 0;
        totalCost += s.co || 0;
        totalClicks += s.cl || 0;
        totalImps += s.im || 0;

        // クエリ別集計
        md.r.forEach(r => {
          const q = r.q || '';
          if (!queryAgg[q]) {
            queryAgg[q] = { cv: 0, cost: 0, clicks: 0, imps: 0, keyword: r.kw || '', campaign: r.camp || '' };
          }
          queryAgg[q].cv += r.cv || 0;
          queryAgg[q].cost += r.c || 0;
          queryAgg[q].clicks += r.cl || 0;
          queryAgg[q].imps += r.im || 0;
        });
      });

      const isAvg = this.mode === 'avg_3m' || this.mode === 'avg_6m';
      const divisor = isAvg ? Math.max(monthsWithData, 1) : 1;

      stores[store] = {
        summary: {
          cv: totalCV / divisor,
          cost: totalCost / divisor,
          clicks: totalClicks / divisor,
          imps: totalImps / divisor
        },
        queryMap: {}
      };

      Object.entries(queryAgg).forEach(([q, d]) => {
        stores[store].queryMap[q] = {
          cv: d.cv / divisor,
          cost: d.cost / divisor,
          clicks: d.clicks / divisor,
          imps: d.imps / divisor
        };
      });
    });

    return stores;
  },

  // Google Ads データに比較データを適用
  applyGoogleAdsComparison(googleAdsData, currentMonth) {
    // 前年モードはビルトインデータを使用（最も正確）
    if (this.mode === 'prev_year') return googleAdsData;

    const comp = this.computeGoogleAdsComparison(currentMonth);
    if (!comp) return googleAdsData;

    ['鎌倉本店', '横浜元町', '大阪中崎町'].forEach(store => {
      const sd = googleAdsData[store];
      if (!sd) return;
      const cs = comp[store];

      // サマリーの比較値を上書き
      sd.summary.spendPrev = cs.summary.cost;
      sd.summary.cvPrev = cs.summary.cv;
      sd.summary.clicksPrev = cs.summary.clicks;
      sd.summary.impressionsPrev = cs.summary.imps;
      sd.summary.cpaPrev = cs.summary.cv > 0 ? cs.summary.cost / cs.summary.cv : 0;
      sd.summary.cvrPrev = cs.summary.clicks > 0 ? (cs.summary.cv / cs.summary.clicks) * 100 : 0;

      // 行レベルの比較値を上書き
      sd.rows.forEach(row => {
        const cq = cs.queryMap[row.query] || { cv: 0, cost: 0, clicks: 0, imps: 0 };
        row.cvPrev = cq.cv;
        row.costPrev = cq.cost;
        row.clicksPrev = cq.clicks;
        row.impressionsPrev = cq.imps;
        row.cpaPrev = cq.cv > 0 ? cq.cost / cq.cv : 0;
        row.ctrPrev = cq.imps > 0 ? (cq.clicks / cq.imps) * 100 : 0;
        row.cvrPrev = cq.clicks > 0 ? (cq.cv / cq.clicks) * 100 : 0;
      });

      // 比較対象にあるが当月にないクエリも追加
      Object.entries(cs.queryMap).forEach(([q, cq]) => {
        if (cq.cv > 0 && !sd.rows.find(r => r.query === q)) {
          sd.rows.push({
            keyword: '', query: q, store, campaign: '',
            cv: 0, cvPrev: cq.cv,
            cost: 0, costPrev: cq.cost,
            clicks: 0, clicksPrev: cq.clicks,
            impressions: 0, impressionsPrev: cq.imps,
            cpa: 0, cpaPrev: cq.cv > 0 ? cq.cost / cq.cv : 0,
            ctr: 0, ctrPrev: cq.imps > 0 ? (cq.clicks / cq.imps) * 100 : 0,
            cvr: 0, cvrPrev: cq.clicks > 0 ? (cq.cv / cq.clicks) * 100 : 0,
            isBrand: isBrandKeyword(q)
          });
        }
      });
    });

    return googleAdsData;
  },

  // ===== Facebook 比較データ計算 =====
  loadFacebookComparison(currentMonth) {
    if (typeof EMBEDDED_DATA === 'undefined') return [];
    if (this.mode === 'prev_year') return null; // ビルトイン使用

    const compMonths = this.getCompMonths(currentMonth);
    const isAvg = this.mode === 'avg_3m' || this.mode === 'avg_6m';
    const allRows = [];
    let monthsWithData = 0;

    compMonths.forEach(cm => {
      const em = EMBEDDED_DATA[cm];
      if (!em) return;
      const files = Object.keys(em);
      const fbFile = files.find(f => (f.includes('faceboo') || f.includes('facebook')) && !f.includes('前年'));
      if (!fbFile) return;
      monthsWithData++;

      const result = Papa.parse(em[fbFile], { header: true, skipEmptyLines: true, dynamicTyping: false });
      (result.data || []).forEach(r => {
        if (r['アカウント名'] && r['アカウント名'].trim() !== '') {
          allRows.push(r);
        }
      });
    });

    if (allRows.length === 0) return [];

    // 集約: store × campaign × adSet × age × gender
    const agg = {};
    allRows.forEach(r => {
      const key = [r['アカウント名'], r['広告の名前'], r['キャンペーン名'], r['広告セット名'], r['年齢'], r['性別']].join('|');
      if (!agg[key]) {
        agg[key] = { ...r, _reach: 0, _imps: 0, _spend: 0, _count: 0 };
        // 予約完了のキー取得
        const keys = Object.keys(r);
        agg[key]._bookingKeys = keys.filter(k => k.startsWith('予約完了'));
        agg[key]._bookingTotals = agg[key]._bookingKeys.map(() => 0);
      }
      const a = agg[key];
      a._reach += parseFloat(r['リーチ']) || 0;
      a._imps += parseFloat(r['インプレッション']) || 0;
      a._spend += parseFloat(r['消化金額 (JPY)']) || 0;
      a._count++;
      a._bookingKeys.forEach((bk, i) => {
        a._bookingTotals[i] += parseFloat(r[bk]) || 0;
      });
    });

    // 平均化して返す
    const divisor = isAvg ? Math.max(monthsWithData, 1) : 1;
    return Object.values(agg).map(a => {
      const row = { ...a };
      row['リーチ'] = String(a._reach / divisor);
      row['インプレッション'] = String(a._imps / divisor);
      row['消化金額 (JPY)'] = String(a._spend / divisor);
      a._bookingKeys.forEach((bk, i) => {
        row[bk] = String(a._bookingTotals[i] / divisor);
      });
      return row;
    });
  },

  // ===== GA 比較データ計算 =====
  loadGAComparison(currentMonth, type) {
    if (typeof EMBEDDED_DATA === 'undefined') return null;
    if (this.mode === 'prev_year') return null; // ビルトイン使用

    const compMonths = this.getCompMonths(currentMonth);
    const isAvg = this.mode === 'avg_3m' || this.mode === 'avg_6m';
    const isTraffic = type === 'traffic';
    const pattern = isTraffic ? 'トラフィック' : 'コマース';

    const agg = {};
    let monthsWithData = 0;

    compMonths.forEach(cm => {
      const em = EMBEDDED_DATA[cm];
      if (!em) return;
      const files = Object.keys(em);
      const file = files.find(f => f.includes(pattern) && !f.includes('日別'));
      if (!file) return;

      // CSVテキストからセクション分割（当年部分のみ使用）
      const sections = DataLoader.splitGASections(em[file]);
      if (!sections[0] || sections[0].length === 0) return;
      monthsWithData++;

      const result = Papa.parse(sections[0].join('\n'), { header: true, skipEmptyLines: true, dynamicTyping: false });
      (result.data || []).forEach(r => {
        const keys = Object.keys(r);
        const primaryKey = r[keys[0]] || '';
        if (!agg[primaryKey]) {
          agg[primaryKey] = { _keys: keys, _values: keys.map(() => 0), _name: primaryKey };
        }
        keys.forEach((k, i) => {
          if (i > 0) agg[primaryKey]._values[i] += parseFloat(r[k]) || 0;
        });
      });
    });

    if (Object.keys(agg).length === 0) return null;

    const divisor = isAvg ? Math.max(monthsWithData, 1) : 1;

    // CSV形式のテキストに変換（splitGASections対応）
    const sampleKeys = Object.values(agg)[0]._keys;
    let csv = sampleKeys.join(',') + '\n';
    Object.values(agg)
      .sort((a, b) => b._values[isTraffic ? 2 : 3] - a._values[isTraffic ? 2 : 3]) // sessions or purchases desc
      .forEach(a => {
        csv += a._name;
        a._keys.forEach((k, i) => {
          if (i > 0) csv += ',' + (a._values[i] / divisor);
        });
        csv += '\n';
      });

    return csv;
  },

  // ユーティリティ
  _monthStr(y, m) {
    return `${y}_${String(m).padStart(2, '0')}`;
  },
  _prevMonthN(y, m, n) {
    let yy = y, mm = m;
    for (let i = 0; i < n; i++) {
      mm--;
      if (mm < 1) { mm = 12; yy--; }
    }
    return this._monthStr(yy, mm);
  }
};

// グローバルヘルパー: 比較ラベル取得
function compLabel() {
  return ComparisonEngine.label;
}

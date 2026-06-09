// 変更履歴の因果関係分析モジュール

const ChangeHistoryAnalyzer = {
  TYPE_LABELS: {
    bid_cpa: '入札変更',
    budget: '予算変更',
    kw_pause: 'KW一時停止',
    kw_add: 'KW追加',
    kw_delete: 'KW削除',
    status_ag: '広告グループ変更',
    status_camp: 'キャンペーン変更',
    neg_kw: '除外KW追加',
    api_change: 'API変更'
  },

  TYPE_COLORS: {
    bid_cpa: 'change-bid',
    budget: 'change-bid',
    kw_pause: 'change-negative',
    kw_delete: 'change-negative',
    kw_add: 'change-positive',
    status_ag: 'change-status',
    status_camp: 'change-status',
    neg_kw: 'change-bid',
    api_change: 'change-status'
  },

  getChangesForMonth(month, store) {
    if (typeof CHANGE_HISTORY === 'undefined') return [];
    const monthData = CHANGE_HISTORY[month];
    if (!monthData) return [];

    if (store === '全店') {
      const all = [];
      ['鎌倉本店', '横浜元町', '大阪中崎町'].forEach(s => {
        (monthData[s] || []).forEach(r => all.push({ ...r, store: s }));
      });
      return all.sort((a, b) => a.d.localeCompare(b.d));
    }

    return (monthData[store] || []).map(r => ({ ...r, store }));
  },

  getSummary(changes) {
    const counts = {};
    changes.forEach(c => {
      const label = this.TYPE_LABELS[c.t] || c.t;
      counts[label] = (counts[label] || 0) + 1;
    });
    return counts;
  },

  correlateWithPerformance(changes, storeData) {
    const results = [];

    changes.forEach(change => {
      const correlation = { change, impacts: [] };

      if (change.t === 'bid_cpa') {
        // CPA入札変更 → 対応キャンペーンのCPA/CV変動を確認
        const campRows = storeData.rows.filter(r =>
          change.c && r.keyword && this.campaignMatch(change, r)
        );
        if (campRows.length > 0) {
          const totalCV = campRows.reduce((s, r) => s + r.cv, 0);
          const totalCVPrev = campRows.reduce((s, r) => s + r.cvPrev, 0);
          const totalCost = campRows.reduce((s, r) => s + r.cost, 0);
          const avgCPA = totalCV > 0 ? totalCost / totalCV : 0;
          if (totalCV !== totalCVPrev) {
            const direction = change.v > change.f ? '引き上げ' : '引き下げ';
            correlation.impacts.push(
              `CPA${direction}後: CV ${formatNumber(totalCV, 1)}件（前年${formatNumber(totalCVPrev, 1)}件）, CPA ¥${Math.round(avgCPA).toLocaleString()}`
            );
          }
        }
      }

      if (change.t === 'kw_pause' || change.t === 'kw_delete') {
        // KW停止/削除 → 対応するKWのCV損失を確認
        if (change.kw && change.kw.length > 0) {
          change.kw.forEach(kw => {
            const normalized = kw.replace(/ /g, '');
            const matchedRow = storeData.rows.find(r => r.query === normalized);
            if (matchedRow && matchedRow.cvPrev > 0) {
              correlation.impacts.push(
                `「${kw}」前年CV: ${formatNumber(matchedRow.cvPrev, 1)}件 → 今年: ${formatNumber(matchedRow.cv, 1)}件`
              );
            }
          });
        }
      }

      if (change.t === 'kw_add') {
        // KW追加 → 新規CVの獲得確認
        if (change.kw && change.kw.length > 0) {
          change.kw.forEach(kw => {
            const normalized = kw.replace(/ /g, '');
            const matchedRow = storeData.rows.find(r => r.query === normalized);
            if (matchedRow && matchedRow.cv > 0) {
              correlation.impacts.push(
                `「${kw}」CV: ${formatNumber(matchedRow.cv, 1)}件, CPA: ${formatCurrency(matchedRow.cpa)}`
              );
            }
          });
        }
      }

      if (change.t === 'status_ag' || change.t === 'status_camp') {
        // ステータス変更 → 広告グループ/キャンペーン全体の影響
        const isPaused = change.v === '一時停止';
        if (isPaused && change.c) {
          correlation.impacts.push(
            `${change.c} を一時停止 → 該当キャンペーンのCV獲得が停止`
          );
        }
      }

      results.push(correlation);
    });

    return results;
  },

  campaignMatch(change, row) {
    // キャンペーン名の部分マッチ（ss01_全般_鎌倉 等）
    if (!change.c) return false;
    // 広告グループ名にKW情報が含まれることが多い
    if (change.g && row.keyword) {
      const gNorm = change.g.replace(/[「」]/g, '').replace(/ /g, '');
      const kwNorm = row.keyword.replace(/ /g, '');
      if (gNorm.includes(kwNorm) || kwNorm.includes(gNorm)) return true;
    }
    return false;
  },

  // インサイト用: 月の変更から因果関係テキストを生成
  getInsightExplanations(month, store, metricType) {
    const changes = this.getChangesForMonth(month, store);
    if (changes.length === 0) return '';

    const relevant = [];

    if (metricType === 'cpa_worse') {
      changes.filter(c => c.t === 'bid_cpa' && c.v > c.f).forEach(c => {
        relevant.push(`${c.d} ${c.g || c.c}: ${c.desc}`);
      });
    }

    if (metricType === 'cv_decrease') {
      changes.filter(c => c.t === 'kw_pause' || c.t === 'kw_delete' || c.t === 'budget').forEach(c => {
        relevant.push(`${c.d} ${c.g || c.c}: ${c.desc}`);
      });
      changes.filter(c => c.t === 'status_ag' && c.v === '一時停止').forEach(c => {
        relevant.push(`${c.d} ${c.g || c.c}: ${c.desc}`);
      });
    }

    if (metricType === 'cv_increase') {
      changes.filter(c => c.t === 'kw_add').forEach(c => {
        relevant.push(`${c.d} ${c.g || c.c}: ${c.desc}`);
      });
      changes.filter(c => c.t === 'status_ag' && c.v === '有効').forEach(c => {
        relevant.push(`${c.d} ${c.g || c.c}: ${c.desc}`);
      });
    }

    // サイト変更も因果要因として追加
    const siteChanges = this.getSiteChangesForMonth(month);
    siteChanges.forEach(sc => {
      if ((metricType === 'cv_increase' || metricType === 'cv_decrease') &&
          (sc.cat === 'price' || sc.cat === 'form' || sc.cat === 'feature' || sc.cat === 'page')) {
        relevant.push(`${sc.d} [サイト変更] ${sc.msg}`);
      }
    });

    if (relevant.length === 0) return '';
    return '<br><strong>原因の可能性:</strong> ' + relevant.slice(0, 3).join('、');
  },

  getSiteChangesForMonth(month) {
    if (typeof SITE_CHANGES === 'undefined') return [];
    return SITE_CHANGES[month] || [];
  },

  SITE_CAT_LABELS: {
    price: '価格変更',
    form: 'フォーム変更',
    page: 'ページ変更',
    design: 'デザイン変更',
    content: 'コンテンツ更新',
    feature: '機能追加',
    recruit: '採用ページ',
    other: 'その他'
  },

  SITE_CAT_COLORS: {
    price: 'change-bid',
    form: 'change-positive',
    feature: 'change-positive',
    page: 'change-status',
    design: 'change-status',
    content: 'change-status',
    recruit: 'change-status',
    other: 'change-status'
  },

  renderSiteChangeSection(month) {
    const siteChanges = this.getSiteChangesForMonth(month);
    if (siteChanges.length === 0) return '';

    let html = `<div class="section-card">
      <h3>公式サイト変更履歴</h3>
      <p style="color:var(--text-secondary);margin-bottom:16px;">この月のサイト更新: ${siteChanges.length}件</p>
      <div class="change-list">`;

    siteChanges.forEach(sc => {
      const colorClass = this.SITE_CAT_COLORS[sc.cat] || 'change-status';
      const catLabel = this.SITE_CAT_LABELS[sc.cat] || sc.cat;

      html += `<div class="change-card ${colorClass}">
        <div class="change-header">
          <span class="change-type">${catLabel}</span>
          <span class="change-date">${sc.d}</span>
        </div>
        <div class="change-body">
          <div class="change-desc">${sc.msg}</div>
        </div>
      </div>`;
    });

    html += '</div></div>';
    return html;
  },

  renderChangeSection(month, store, storeData) {
    const changes = this.getChangesForMonth(month, store);
    const siteChanges = this.getSiteChangesForMonth(month);
    if (changes.length === 0 && siteChanges.length === 0) return '';

    const isAllStore = store === '全店';
    const correlations = this.correlateWithPerformance(changes, storeData);
    const summary = this.getSummary(changes);

    // サマリー行
    const summaryParts = Object.entries(summary).map(([k, v]) => `${k} ${v}件`);

    let html = `<div class="section-card">
      <h3>変更履歴と影響分析</h3>
      <p style="color:var(--text-secondary);margin-bottom:16px;">この月の変更: ${summaryParts.join(' / ')}</p>
      <div class="change-list">`;

    correlations.forEach(({ change, impacts }) => {
      const colorClass = this.TYPE_COLORS[change.t] || 'change-bid';
      const typeLabel = this.TYPE_LABELS[change.t] || change.t;
      const storeLabel = isAllStore ? `<span class="change-store">${change.store}</span> ` : '';
      const campLabel = change.c ? `<span class="change-campaign">${change.c}</span>` : '';
      const groupLabel = change.g ? ` &gt; ${change.g}` : '';

      html += `<div class="change-card ${colorClass}">
        <div class="change-header">
          <span class="change-type">${typeLabel}</span>
          <span class="change-date">${change.d}</span>
        </div>
        <div class="change-body">
          ${storeLabel}${campLabel}${groupLabel}
          <div class="change-desc">${change.desc}</div>`;

      if (impacts.length > 0) {
        html += '<div class="change-impact">';
        impacts.forEach(imp => {
          html += `<div class="impact-line">${imp}</div>`;
        });
        html += '</div>';
      }

      html += '</div></div>';
    });

    html += '</div></div>';

    // サイト変更セクションも追加
    html += this.renderSiteChangeSection(month);

    return html;
  }
};

// インサイト & 課題タブ

const InsightsSection = {
  render(data) {
    const container = document.getElementById('tab-insights');
    const insights = this.generateInsights(data);

    let html = '<h2 style="margin-bottom:20px;font-size:20px;">自動分析レポート</h2>';

    // カテゴリ別に表示
    const categories = [
      { key: 'positive', title: '好調な指標', icon: '&#9650;' },
      { key: 'warning', title: '注意が必要な指標', icon: '&#9888;' },
      { key: 'change_history', title: 'Google広告・Webサイト変更と思われる変化', icon: '&#128269;' },
      { key: 'info', title: '分析インサイト', icon: '&#9432;' }
    ];

    categories.forEach(cat => {
      const items = insights.filter(i => i.type === cat.key);
      if (items.length === 0) return;

      html += `<h3 style="margin:24px 0 12px;font-size:16px;color:var(--text-secondary)">${cat.icon} ${cat.title}</h3>`;
      html += '<div class="insight-grid">';
      items.forEach(item => {
        const cardClass = cat.key === 'positive' ? 'success' : cat.key === 'warning' ? 'warning' : cat.key === 'change_history' ? 'change-history' : 'info';
        const sourceLabels = {
          'Google広告': 'google-ads',
          'Facebook広告': 'facebook-ads',
          'GoogleAnalytics': 'ga',
          'SearchConsole': 'search-console',
          '変更履歴': 'change-history'
        };
        const badges = (item.sources || []).map(s =>
          `<span class="source-badge ${sourceLabels[s] || ''}">${s}</span>`
        ).join('');
        const badgeHtml = badges ? `<div class="source-badges">${badges}</div>` : '';
        html += `<div class="insight-card ${cardClass}">
          ${badgeHtml}
          <h4>${item.title}</h4>
          <p>${item.description}</p>
        </div>`;
      });
      html += '</div>';
    });

    container.innerHTML = html;
  },

  generateInsights(data) {
    const insights = [];
    const overall = DataLoader.getOverallSummary();

    // 1. 全体の消化金額変化
    const spendYoY = ((overall.totalSpend - overall.totalSpendPrev) / overall.totalSpendPrev * 100);
    const cvYoY = ((overall.totalCV - overall.totalCVPrev) / overall.totalCVPrev * 100);

    if (spendYoY > 0 && cvYoY > spendYoY) {
      insights.push({
        type: 'positive',
        sources: ['Google広告', 'Facebook広告'],
        title: '広告効率が改善',
        description: `消化金額は${compLabel()}比${spendYoY.toFixed(1)}%増ですが、CV数は${cvYoY.toFixed(1)}%増と、費用以上にCVが伸びています。広告効率が向上しています。`
      });
    } else if (spendYoY > 0 && cvYoY < spendYoY) {
      insights.push({
        type: 'warning',
        sources: ['Google広告', 'Facebook広告'],
        title: '費用増加に対してCV伸びが不足',
        description: `消化金額は${compLabel()}比${spendYoY.toFixed(1)}%増ですが、CV数は${cvYoY.toFixed(1)}%増にとどまっています。CPA効率が悪化している可能性があります。`
      });
    }

    // 2. 店舗別分析
    const fbCur = DataLoader.getFBStoreSummary(data.facebook.current);
    const fbPrev = DataLoader.getFBStoreSummary(data.facebook.previous);

    STORE_LIST.forEach(store => {
      const gSum = data.googleAds[store].summary;

      // Google広告のCPA変化
      if (gSum.cpaPrev > 0) {
        const cpaChange = ((gSum.cpa - gSum.cpaPrev) / gSum.cpaPrev) * 100;
        if (cpaChange > 20) {
          const explanation = typeof ChangeHistoryAnalyzer !== 'undefined' ? ChangeHistoryAnalyzer.getInsightExplanations(DataLoader.currentMonth, store, 'cpa_worse') : '';
          insights.push({
            type: explanation ? 'change_history' : 'warning',
            sources: explanation ? ['Google広告', '変更履歴'] : ['Google広告'],
            title: `${store} Google広告のCPAが${cpaChange.toFixed(0)}%悪化`,
            description: `CPA: ${formatCurrency(gSum.cpa)}（${compLabel()}: ${formatCurrency(gSum.cpaPrev)}）。キーワードの見直しや入札戦略の調整を検討してください。${explanation}`
          });
        } else if (cpaChange < -15) {
          insights.push({
            type: 'positive',
            sources: ['Google広告'],
            title: `${store} Google広告のCPAが${Math.abs(cpaChange).toFixed(0)}%改善`,
            description: `CPA: ${formatCurrency(gSum.cpa)}（${compLabel()}: ${formatCurrency(gSum.cpaPrev)}）。効率的な広告運用ができています。`
          });
        }
      }

      // CV数の大幅変化
      if (gSum.cvPrev > 0) {
        const cvChange = ((gSum.cv - gSum.cvPrev) / gSum.cvPrev) * 100;
        if (cvChange > 30) {
          const explanation = typeof ChangeHistoryAnalyzer !== 'undefined' ? ChangeHistoryAnalyzer.getInsightExplanations(DataLoader.currentMonth, store, 'cv_increase') : '';
          insights.push({
            type: explanation ? 'change_history' : 'positive',
            sources: explanation ? ['Google広告', '変更履歴'] : ['Google広告'],
            title: `${store} Google広告のCV数が${cvChange.toFixed(0)}%増加`,
            description: `CV: ${formatNumber(gSum.cv, 1)}件（${compLabel()}: ${formatNumber(gSum.cvPrev, 1)}件）。${explanation}`
          });
        } else if (cvChange < -20) {
          const explanation = typeof ChangeHistoryAnalyzer !== 'undefined' ? ChangeHistoryAnalyzer.getInsightExplanations(DataLoader.currentMonth, store, 'cv_decrease') : '';
          insights.push({
            type: explanation ? 'change_history' : 'warning',
            sources: explanation ? ['Google広告', '変更履歴'] : ['Google広告'],
            title: `${store} Google広告のCV数が${Math.abs(cvChange).toFixed(0)}%減少`,
            description: `CV: ${formatNumber(gSum.cv, 1)}件（${compLabel()}: ${formatNumber(gSum.cvPrev, 1)}件）。原因の特定が必要です。${explanation}`
          });
        }
      }

      // Facebook広告のCV変化
      const fCur = fbCur[store];
      const fPrev = fbPrev[store];
      if (fPrev.conversions > 0) {
        const fbCvChange = ((fCur.conversions - fPrev.conversions) / fPrev.conversions) * 100;
        if (Math.abs(fbCvChange) > 30) {
          insights.push({
            type: fbCvChange > 0 ? 'positive' : 'warning',
            sources: ['Facebook広告'],
            title: `${store} Facebook広告のCV数が${Math.abs(fbCvChange).toFixed(0)}%${fbCvChange > 0 ? '増加' : '減少'}`,
            description: `CV: ${formatNumber(fCur.conversions)}件（${compLabel()}: ${formatNumber(fPrev.conversions)}件）。消化金額: ${formatCurrency(fCur.spend)}（${compLabel()}: ${formatCurrency(fPrev.spend)}）`
          });
        }
      }
    });

    // 3. 無駄コスト分析
    STORE_LIST.forEach(store => {
      const rows = data.googleAds[store].rows;
      const wastedSpend = rows.filter(r => !r.isBrand && r.cost > 0 && r.cv === 0).reduce((s, r) => s + r.cost, 0);
      const totalSpend = data.googleAds[store].summary.spend;
      if (totalSpend > 0) {
        const wastedRatio = (wastedSpend / totalSpend) * 100;
        if (wastedRatio > 30) {
          insights.push({
            type: 'warning',
            sources: ['Google広告'],
            title: `${store} 一般検索の${wastedRatio.toFixed(0)}%がCV0キーワードに消費`,
            description: `CV0キーワードの費用合計: ${formatCurrency(wastedSpend)}（総費用の${wastedRatio.toFixed(1)}%）。除外キーワードの設定見直しを推奨します。`
          });
        }
      }
    });

    // 4. 指名/非指名比率
    STORE_LIST.forEach(store => {
      const rows = data.googleAds[store].rows;
      const brandCV = rows.filter(r => r.isBrand).reduce((s, r) => s + r.cv, 0);
      const nonBrandCV = rows.filter(r => !r.isBrand).reduce((s, r) => s + r.cv, 0);
      const total = brandCV + nonBrandCV;
      if (total > 0) {
        const brandRatio = (brandCV / total) * 100;
        if (brandRatio > 70) {
          insights.push({
            type: 'info',
            sources: ['Google広告'],
            title: `${store} 指名検索依存度が高い（${brandRatio.toFixed(0)}%）`,
            description: `CVの${brandRatio.toFixed(0)}%が指名検索からです。非指名検索からのCV獲得を強化することで、新規ユーザーの獲得を拡大できる可能性があります。`
          });
        }
      }
    });

    // 5. Facebook広告疲労
    const creatives = DataLoader.getFBCreativeSummary(data.facebook.current);
    const fatigued = creatives.filter(c => c.avgFrequency > 4 && c.avgCtr < 0.5 && c.impressions > 500);
    if (fatigued.length > 0) {
      insights.push({
        type: 'warning',
        sources: ['Facebook広告'],
        title: `${fatigued.length}件の広告で広告疲労の兆候`,
        description: `フリークエンシーが4以上でCTRが0.5%未満の広告が${fatigued.length}件あります。クリエイティブの入れ替えを検討してください。`
      });
    }

    // 6. GAトラフィック分析
    const gaTraffic = data.gaTraffic;
    if (gaTraffic.current.length > 0 && gaTraffic.previous.length > 0) {
      const prevMap = {};
      gaTraffic.previous.forEach(r => { prevMap[r.source] = r; });

      gaTraffic.current.forEach(r => {
        const prev = prevMap[r.source];
        if (!prev || prev.sessions === 0) return;

        // セッション大幅増でキーイベント変わらず
        const sessChange = ((r.sessions - prev.sessions) / prev.sessions) * 100;
        if (sessChange > 50 && r.keyEvents <= prev.keyEvents && r.sessions > 100) {
          insights.push({
            type: 'info',
            sources: ['GoogleAnalytics'],
            title: `${r.source}: セッション${sessChange.toFixed(0)}%増だがキーイベント未増加`,
            description: `セッション: ${formatNumber(r.sessions)}（${compLabel()}: ${formatNumber(prev.sessions)}）、キーイベント: ${formatNumber(r.keyEvents)}（${compLabel()}: ${formatNumber(prev.keyEvents)}）。トラフィック品質の確認が必要です。`
          });
        }

        // 収益が大幅に変動
        if (prev.revenue > 100000) {
          const revChange = ((r.revenue - prev.revenue) / prev.revenue) * 100;
          if (revChange > 50) {
            insights.push({
              type: 'positive',
              sources: ['GoogleAnalytics'],
              title: `${r.source}: 収益が${revChange.toFixed(0)}%増加`,
              description: `収益: ${formatCurrency(r.revenue)}（${compLabel()}: ${formatCurrency(prev.revenue)}）`
            });
          } else if (revChange < -30) {
            insights.push({
              type: 'warning',
              sources: ['GoogleAnalytics'],
              title: `${r.source}: 収益が${Math.abs(revChange).toFixed(0)}%減少`,
              description: `収益: ${formatCurrency(r.revenue)}（${compLabel()}: ${formatCurrency(prev.revenue)}）。流入品質や導線の確認が必要です。`
            });
          }
        }
      });
    }

    // 7. CVを失ったキーワードTop5
    const lostKeywords = [];
    STORE_LIST.forEach(store => {
      data.googleAds[store].rows
        .filter(r => !r.isBrand && r.cvPrev > 0 && r.cv === 0)
        .forEach(r => lostKeywords.push({ ...r, store }));
    });

    if (lostKeywords.length > 0) {
      const top5Lost = lostKeywords.sort((a, b) => b.cvPrev - a.cvPrev).slice(0, 5);
      const desc = top5Lost.map(k => `- ${k.store}「${k.query}」: ${compLabel()}CV ${formatNumber(k.cvPrev, 1)}件 → 当月0件`).join('<br>');
      insights.push({
        type: 'warning',
        sources: ['Google広告'],
        title: `CVを失ったキーワード（${compLabel()}CVあり → 当月CV0）`,
        description: desc
      });
    }

    // 8. サイト変更と数値変動の因果関係
    if (typeof ChangeHistoryAnalyzer !== 'undefined') {
      const siteChanges = ChangeHistoryAnalyzer.getSiteChangesForMonth(DataLoader.currentMonth);
      if (siteChanges.length > 0) {
        // 価格変更 → CVR・収益への影響
        const priceChanges = siteChanges.filter(sc => sc.cat === 'price');
        if (priceChanges.length > 0) {
          const gaTraffic = data.gaTraffic;
          let revenueNote = '';
          if (gaTraffic.current.length > 0 && gaTraffic.previous.length > 0) {
            const curRev = gaTraffic.current.reduce((s, r) => s + r.revenue, 0);
            const prevRev = gaTraffic.previous.reduce((s, r) => s + r.revenue, 0);
            if (prevRev > 0) {
              const revChange = ((curRev - prevRev) / prevRev * 100).toFixed(1);
              revenueNote = ` GA収益は${compLabel()}比${revChange}%。`;
            }
          }
          insights.push({
            type: 'change_history',
            sources: ['変更履歴', 'GoogleAnalytics'],
            title: '公式サイトで価格変更あり',
            description: priceChanges.map(sc => `${sc.d}: ${sc.msg}`).join('<br>') +
              `<br>価格変更はCVR・客単価に直接影響します。${revenueNote}`
          });
        }

        // フォーム・機能変更 → CVRへの影響
        const formFeatureChanges = siteChanges.filter(sc => sc.cat === 'form' || sc.cat === 'feature');
        if (formFeatureChanges.length > 0) {
          // 全店のCVR変化を計算
          let totalCV = 0, totalCVPrev = 0, totalClicks = 0, totalClicksPrev = 0;
          STORE_LIST.forEach(store => {
            const s = data.googleAds[store].summary;
            totalCV += s.cv; totalCVPrev += s.cvPrev;
            totalClicks += s.clicks; totalClicksPrev += s.clicksPrev;
          });
          const curCVR = totalClicks > 0 ? (totalCV / totalClicks * 100) : 0;
          const prevCVR = totalClicksPrev > 0 ? (totalCVPrev / totalClicksPrev * 100) : 0;
          const cvrDiff = curCVR - prevCVR;
          const cvrNote = cvrDiff !== 0 ? ` Google広告全体のCVRは${prevCVR.toFixed(2)}%→${curCVR.toFixed(2)}%（${cvrDiff > 0 ? '+' : ''}${cvrDiff.toFixed(2)}pt）。` : '';

          insights.push({
            type: 'change_history',
            sources: ['変更履歴', 'Google広告'],
            title: '公式サイトのフォーム・機能変更あり',
            description: formFeatureChanges.map(sc => `${sc.d}: ${sc.msg}`).join('<br>') +
              `<br>予約フォームや機能の変更はCVRに直接影響します。${cvrNote}`
          });
        }

        // ページ・デザイン変更 → エンゲージメント・直帰率への影響
        const pageDesignChanges = siteChanges.filter(sc => sc.cat === 'page' || sc.cat === 'design');
        if (pageDesignChanges.length > 0) {
          insights.push({
            type: 'change_history',
            sources: ['変更履歴'],
            title: `公式サイトのページ・デザイン変更${pageDesignChanges.length}件`,
            description: pageDesignChanges.slice(0, 5).map(sc => `${sc.d}: ${sc.msg}`).join('<br>') +
              '<br>LP・デザインの変更はエンゲージメント率やCVRに影響する可能性があります。'
          });
        }
      }
    }

    // 9. Search Console: 広告で高CPAだがオーガニック上位のKW
    if (typeof SEARCH_CONSOLE_DATA !== 'undefined') {
      const scData = SEARCH_CONSOLE_DATA[DataLoader.currentMonth];
      if (scData && scData.current) {
        const scMap = {};
        scData.current.forEach(r => { scMap[r.q.replace(/ /g, '')] = r; });

        const wastefulOverlaps = [];
        STORE_LIST.forEach(store => {
          data.googleAds[store].rows.forEach(r => {
            if (r.cost > 20000 && r.cpa > 10000 && r.cv > 0) {
              const sc = scMap[r.query];
              if (sc && sc.position <= 3) {
                wastefulOverlaps.push({ query: r.query, store, cost: r.cost, cpa: r.cpa, cv: r.cv, orgPos: sc.position, orgClicks: sc.clicks });
              }
            }
          });
        });

        if (wastefulOverlaps.length > 0) {
          const sorted = wastefulOverlaps.sort((a, b) => b.cost - a.cost).slice(0, 5);
          const desc = sorted.map(r =>
            `- 「${r.query}」: 広告CPA ${formatCurrency(r.cpa)} / オーガニック順位${r.orgPos.toFixed(1)}位（${r.orgClicks}クリック/月）`
          ).join('<br>');
          insights.push({
            type: 'info',
            sources: ['Google広告', 'SearchConsole'],
            title: '広告費削減の機会: オーガニック上位なのに高CPA広告あり',
            description: desc + '<br>オーガニックで上位表示されているため、広告入札を下げてもCV獲得を維持できる可能性があります。'
          });
        }
      }
    }

    return insights;
  }
};

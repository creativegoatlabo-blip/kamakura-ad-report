// メインアプリケーション

const App = {
  currentTab: 'summary',

  async init() {
    // 月リスト読込
    await this.loadMonths();

    // タブイベント
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // 比較セレクタイベント
    document.getElementById('compare-select').addEventListener('change', (e) => {
      ComparisonEngine.mode = e.target.value;
      this.loadData();
    });

    // 初回データ読込
    await this.loadData();
  },

  async loadMonths() {
    let months;
    // 全データソースから月一覧を統合
    const monthSet = new Set();
    if (typeof GOOGLE_ADS_MASTER !== 'undefined') {
      Object.keys(GOOGLE_ADS_MASTER).forEach(m => monthSet.add(m));
    }
    if (typeof EMBEDDED_DATA !== 'undefined') {
      Object.keys(EMBEDDED_DATA).forEach(m => monthSet.add(m));
    }
    if (monthSet.size > 0) {
      months = [...monthSet].sort();
    } else {
      try {
        const res = await fetch('data/months.json');
        months = await res.json();
      } catch (e) {
        console.warn('months.json load failed', e);
        return;
      }
    }

    const select = document.getElementById('month-select');
    select.innerHTML = '';
    // 新しい月が先頭に来るように降順
    const sortedMonths = [...months].sort().reverse();
    sortedMonths.forEach(m => {
      const [year, month] = m.split('_');
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = `${year}年${parseInt(month)}月`;
      select.appendChild(opt);
    });
    // 最新月を選択
    select.value = sortedMonths[0];

    select.addEventListener('change', () => this.loadData());
  },

  async loadData() {
    const month = document.getElementById('month-select').value;
    if (!month) return;

    // ローディング表示
    document.querySelectorAll('.tab-content').forEach(el => {
      el.innerHTML = '<div class="loading"><div class="spinner"></div>データを読み込み中...</div>';
    });

    try {
      const data = await DataLoader.loadMonth(month);

      // 比較モードに応じてGoogle Ads比較データを適用
      ComparisonEngine.applyGoogleAdsComparison(data.googleAds, month);

      // Facebook比較データを適用（非前年モード時）
      const fbComp = ComparisonEngine.loadFacebookComparison(month);
      if (fbComp !== null) {
        data.facebook.previous = DataLoader.parseFacebook(fbComp, []).current;
      }

      // GA比較データを適用（非前年モード時）
      const gaTrafficComp = ComparisonEngine.loadGAComparison(month, 'traffic');
      if (gaTrafficComp !== null) {
        const sections = [[gaTrafficComp.split('\n')]];
        data.gaTraffic.previous = DataLoader.parseGATraffic(gaTrafficComp).current;
      }

      const gaEcomComp = ComparisonEngine.loadGAComparison(month, 'ecommerce');
      if (gaEcomComp !== null) {
        data.gaEcommerce.previous = DataLoader.parseGAEcommerce(gaEcomComp).current;
      }

      // DataLoader.dataも更新（getOverallSummary用）
      DataLoader.data = data;

      // ヘッダーのタイトル更新
      const [year, m] = month.split('_');
      document.getElementById('report-period').textContent = `${year}年${parseInt(m)}月`;

      // 全タブをレンダリング
      SummarySection.render(data);
      GoogleAdsSection.render(data);
      FacebookAdsSection.render(data);
      AnalyticsSection.render(data);
      InsightsSection.render(data);

      // アクティブタブを表示
      this.switchTab(this.currentTab);
    } catch (e) {
      console.error('Data load error:', e);
      document.querySelectorAll('.tab-content').forEach(el => {
        el.innerHTML = '<div class="loading">データの読み込みに失敗しました。</div>';
      });
    }
  },

  switchTab(tabId) {
    this.currentTab = tabId;

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    document.querySelectorAll('.tab-content').forEach(el => {
      el.classList.toggle('active', el.id === 'tab-' + tabId);
    });
  }
};

// 初期化 - スクリプト読込順を保証するためwindow.onloadを使用
window.addEventListener('load', () => App.init());

// CSV データロード & パース

const DataLoader = {
  currentMonth: null,
  data: {},

  // ファイル名が月によって異なるため、パターンマッチで探す
  // Unicode正規化(NFC)してから比較する
  findFile(files, patterns, exclude) {
    for (const p of patterns) {
      const pNorm = p.normalize('NFC');
      const exNorm = exclude ? exclude.normalize('NFC') : null;
      const found = files.find(f => {
        const fNorm = f.normalize('NFC');
        if (!fNorm.includes(pNorm)) return false;
        if (exNorm && fNorm.includes(exNorm)) return false;
        return true;
      });
      if (found) return found;
    }
    return null;
  },

  async loadMonth(month) {
    this.currentMonth = month;

    let fbCurrent, fbPrev, gaTraffic, gaEcom, kwKamakura, kwYokohama, kwOsaka;

    if (typeof EMBEDDED_DATA !== 'undefined' && EMBEDDED_DATA[month]) {
      // file:// 用: 埋め込みデータから読み込み
      const em = EMBEDDED_DATA[month];
      const files = Object.keys(em);
      const parseCSV = (patterns, exclude) => {
        const filename = this.findFile(files, patterns, exclude);
        if (!filename) return [];
        const result = Papa.parse(em[filename], { header: true, skipEmptyLines: true, dynamicTyping: false });
        return result.data || [];
      };
      const getText = (patterns, exclude) => {
        const filename = this.findFile(files, patterns, exclude);
        return filename ? em[filename] : '';
      };

      fbCurrent = parseCSV(['faceboo-広告レポート', 'facebook-広告レポート'], '前年');
      fbPrev = parseCSV(['前年']);
      gaTraffic = getText(['トラフィック獲得'], '日別');
      gaEcom = getText(['コマース購入数', 'e_コマース']);
      kwKamakura = getText(['キーワードレポート-鎌倉']);
      kwYokohama = getText(['キーワードレポート-横浜']);
      kwOsaka = getText(['キーワードレポート-大阪']);
    } else {
      // http:// 用: fetchで読み込み - ファイル一覧を取得してマッチ
      const base = `data/${month}/`;
      const fileList = await this.fetchFileList(base);

      const findAndFetchCSV = async (patterns, exclude) => {
        const f = this.findFile(fileList, patterns, exclude);
        return f ? await this.fetchCSV(base + f) : [];
      };
      const findAndFetchText = async (patterns, exclude) => {
        const f = this.findFile(fileList, patterns, exclude);
        return f ? await this.fetchText(base + f) : '';
      };

      [fbCurrent, fbPrev, gaTraffic, gaEcom, kwKamakura, kwYokohama, kwOsaka] = await Promise.all([
        findAndFetchCSV(['faceboo-広告レポート', 'facebook-広告レポート'], '前年'),
        findAndFetchCSV(['前年']),
        findAndFetchText(['トラフィック獲得'], '日別'),
        findAndFetchText(['コマース購入数', 'e_コマース']),
        findAndFetchText(['キーワードレポート-鎌倉']),
        findAndFetchText(['キーワードレポート-横浜']),
        findAndFetchText(['キーワードレポート-大阪'])
      ]);
    }

    // Google広告: マスターデータ優先、なければCSVフォールバック
    let googleAdsData;
    if (typeof GOOGLE_ADS_MASTER !== 'undefined' && GOOGLE_ADS_MASTER[month]) {
      googleAdsData = this.parseGoogleAdsMaster(month);
    } else {
      googleAdsData = {
        '鎌倉本店': this.parseGoogleAdsKeywords(kwKamakura, '鎌倉本店'),
        '横浜元町': this.parseGoogleAdsKeywords(kwYokohama, '横浜元町'),
        '大阪中崎町': this.parseGoogleAdsKeywords(kwOsaka, '大阪中崎町')
      };
    }

    this.data = {
      facebook: this.parseFacebook(fbCurrent, fbPrev),
      gaTraffic: this.parseGATraffic(gaTraffic),
      gaEcommerce: this.parseGAEcommerce(gaEcom),
      googleAds: googleAdsData
    };

    return this.data;
  },

  async fetchFileList(base) {
    // EMBEDDED_DATAからファイル一覧を取得（フォールバック）
    if (typeof EMBEDDED_DATA !== 'undefined' && EMBEDDED_DATA[this.currentMonth]) {
      return Object.keys(EMBEDDED_DATA[this.currentMonth]);
    }
    // fetch方式: ディレクトリリスティングが使えない場合のフォールバック用既知ファイル名
    return [
      'faceboo-広告レポート（全店舗）.csv', 'faceboo-広告レポート(全店舗)_前年.csv',
      'faceboo-広告レポート全店舗.csv',
      'GoogleAnalytics_トラフィック獲得.csv', 'トラフィック獲得.csv',
      'GoogleAnalytics_e_コマース購入数_アイテム名.csv', 'e_コマース購入数_アイテム名.csv',
      'キーワードレポート-鎌倉本店.csv', 'キーワードレポート-鎌倉.csv',
      'キーワードレポート-横浜元町.csv', 'キーワードレポート-横浜.csv',
      'キーワードレポート-大阪中崎町.csv', 'キーワードレポート-大阪.csv'
    ];
  },

  async fetchCSV(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const text = await res.text();
      const result = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
      return result.data || [];
    } catch (e) {
      console.warn('CSV fetch failed:', url, e);
      return [];
    }
  },

  async fetchText(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return '';
      return await res.text();
    } catch (e) {
      console.warn('Text fetch failed:', url, e);
      return '';
    }
  },

  // --- Facebook広告パース ---
  parseFacebook(currentRows, prevRows) {
    const parseFBRows = (rows) => {
      // 1行目（ヘッダーの次の行）がサマリー（アカウント名が空）なのでスキップ
      const dataRows = rows.filter(r => r['アカウント名'] && r['アカウント名'].trim() !== '');
      return dataRows.map(r => {
        // 予約完了が3列ある: 予約完了, 予約完了_1, 予約完了_2 (Papa Parseの自動リネーム)
        // もしくはヘッダー重複でキーが変わる可能性あり
        const keys = Object.keys(r);
        const bookingKeys = keys.filter(k => k.startsWith('予約完了'));
        // 最初の「予約完了」をクリックCV、2番目をビューCV、3番目をトータルとして扱う
        const bookingClick = parseFloat(r[bookingKeys[0]]) || 0;
        const bookingView = parseFloat(r[bookingKeys[1]]) || 0;
        const bookingTotal = parseFloat(r[bookingKeys[2]]) || 0;
        // 合計がある場合はそれを使う、なければクリック+ビュー
        const conversions = bookingTotal || (bookingClick + bookingView);
        const impressions = parseFloat(r['インプレッション']) || 0;
        const ctr = parseFloat(r['CTR(すべて)']) || 0;
        const clicks = parseFloat(r['クリック数']) || parseFloat(r['リンクのクリック']) || (impressions * ctr / 100);

        return {
          store: normalizeStoreName(r['アカウント名']),
          adName: r['広告の名前'] || '',
          campaign: r['キャンペーン名'] || '',
          adSet: r['広告セット名'] || '',
          age: r['年齢'] || '',
          gender: r['性別'] || '',
          reach: parseFloat(r['リーチ']) || 0,
          impressions,
          frequency: parseFloat(r['フリークエンシー']) || 0,
          spend: parseFloat(r['消化金額 (JPY)']) || 0,
          ctr,
          clicks,
          conversions,
          bookingClick,
          bookingView
        };
      });
    };

    const current = parseFBRows(currentRows);
    const prev = parseFBRows(prevRows);

    return { current, previous: prev };
  },

  // --- GAトラフィックパース（当年/前年を空行で分割） ---
  parseGATraffic(text) {
    const sections = this.splitGASections(text);
    const parseSec = (lines) => {
      if (!lines || lines.length === 0) return [];
      const result = Papa.parse(lines.join('\n'), { header: true, skipEmptyLines: true, dynamicTyping: false });
      return (result.data || []).map(r => {
        const keys = Object.keys(r);
        return {
          source: r[keys[0]] || '',
          activeUsers: parseFloat(r[keys[1]]) || 0,
          sessions: parseFloat(r[keys[2]]) || 0,
          engagedSessions: parseFloat(r[keys[3]]) || 0,
          avgEngagementTime: parseFloat(r[keys[4]]) || 0,
          engagedSessionsPerUser: parseFloat(r[keys[5]]) || 0,
          eventsPerSession: parseFloat(r[keys[6]]) || 0,
          engagementRate: parseFloat(r[keys[7]]) || 0,
          eventCount: parseFloat(r[keys[8]]) || 0,
          keyEvents: parseFloat(r[keys[9]]) || 0,
          revenue: parseFloat(r[keys[10]]) || 0,
          sessionKeyEventRate: parseFloat(r[keys[11]]) || 0
        };
      });
    };

    return {
      current: parseSec(sections[0]),
      previous: parseSec(sections[1])
    };
  },

  // --- GA eコマースパース ---
  parseGAEcommerce(text) {
    const sections = this.splitGASections(text);
    const parseSec = (lines) => {
      if (!lines || lines.length === 0) return [];
      const result = Papa.parse(lines.join('\n'), { header: true, skipEmptyLines: true, dynamicTyping: false });
      return (result.data || []).map(r => {
        const keys = Object.keys(r);
        const itemName = r['アイテム名'] || r[keys[0]] || '';
        return {
          itemName,
          source: r['セッション「媒体分析」'] || '全体',
          itemsViewed: parseFloat(r['閲覧されたアイテム数']) || 0,
          itemsAddedToCart: parseFloat(r['カートに追加されたアイテム数']) || 0,
          purchases: parseFloat(r['アイテムの購入数']) || 0,
          revenue: parseFloat(r['アイテムの収益']) || 0,
          store: storeFromItemName(itemName)
        };
      });
    };

    return {
      current: parseSec(sections[0]),
      previous: parseSec(sections[1])
    };
  },

  // GAファイルの当年/前年セクション分割
  splitGASections(text) {
    const lines = text.split('\n');
    const sections = [];
    let currentSection = [];
    let inData = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // コメント行
      if (line.startsWith('#')) {
        if (inData && currentSection.length > 0) {
          sections.push(currentSection);
          currentSection = [];
          inData = false;
        }
        continue;
      }

      // 空行
      if (line === '') {
        if (inData && currentSection.length > 0) {
          sections.push(currentSection);
          currentSection = [];
          inData = false;
        }
        continue;
      }

      // データ行（ヘッダー含む）
      inData = true;
      currentSection.push(lines[i]);
    }

    if (currentSection.length > 0) {
      sections.push(currentSection);
    }

    return sections;
  },

  // --- Google広告マスターデータからパース ---
  parseGoogleAdsMaster(month) {
    const stores = {};
    const storeNames = ['鎌倉本店', '横浜元町', '大阪中崎町'];

    storeNames.forEach(store => {
      const sd = (GOOGLE_ADS_MASTER[month] || {})[store];
      if (!sd || !sd.r) {
        stores[store] = { rows: [], summary: { store, spend: 0, spendPrev: 0, cv: 0, cvPrev: 0, clicks: 0, clicksPrev: 0, impressions: 0, impressionsPrev: 0, cpa: 0, cpaPrev: 0, cvr: 0, cvrPrev: 0 } };
        return;
      }

      let totalSpend = 0, totalSpendPrev = 0, totalCV = 0, totalCVPrev = 0;
      let totalClicks = 0, totalClicksPrev = 0, totalImps = 0, totalImpsPrev = 0;

      const rows = sd.r.map(r => {
        const cv = r.cv || 0;
        const cvPrev = r.cvP || 0;
        const cost = r.c || 0;
        const costPrev = r.cP || 0;
        const clicks = r.cl || 0;
        const clicksPrev = r.clP || 0;
        const impressions = r.im || 0;
        const impressionsPrev = r.imP || 0;
        const query = r.q || '';
        const keyword = r.kw || '';

        totalSpend += cost;
        totalSpendPrev += costPrev;
        totalCV += cv;
        totalCVPrev += cvPrev;
        totalClicks += clicks;
        totalClicksPrev += clicksPrev;
        totalImps += impressions;
        totalImpsPrev += impressionsPrev;

        return {
          keyword, query, store,
          campaign: r.camp || '',
          cv, cvPrev, cost, costPrev,
          clicks, clicksPrev,
          impressions, impressionsPrev,
          cpa: cv > 0 ? cost / cv : 0,
          cpaPrev: cvPrev > 0 ? costPrev / cvPrev : 0,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          ctrPrev: impressionsPrev > 0 ? (clicksPrev / impressionsPrev) * 100 : 0,
          isBrand: isBrandKeyword(query) || isBrandKeyword(keyword.replace(/ /g, '')),
          cvr: clicks > 0 ? (cv / clicks) * 100 : 0,
          cvrPrev: clicksPrev > 0 ? (cvPrev / clicksPrev) * 100 : 0
        };
      });

      stores[store] = {
        rows,
        summary: {
          store,
          spend: totalSpend,
          spendPrev: totalSpendPrev,
          cv: totalCV,
          cvPrev: totalCVPrev,
          clicks: totalClicks,
          clicksPrev: totalClicksPrev,
          impressions: totalImps,
          impressionsPrev: totalImpsPrev,
          cpa: totalCV > 0 ? totalSpend / totalCV : 0,
          cpaPrev: totalCVPrev > 0 ? totalSpendPrev / totalCVPrev : 0,
          cvr: totalClicks > 0 ? (totalCV / totalClicks) * 100 : 0,
          cvrPrev: totalClicksPrev > 0 ? (totalCVPrev / totalClicksPrev) * 100 : 0
        }
      };
    });

    return stores;
  },

  // --- Google広告キーワードパース（レガシーCSV用） ---
  parseGoogleAdsKeywords(text, store) {
    if (!text) return { rows: [], summary: {} };

    const lines = text.split('\n');
    // 1行目: タイトル、2行目: 期間、3行目: ヘッダー、4行目以降: データ
    if (lines.length < 4) return { rows: [], summary: {} };

    const dataLines = lines.slice(2).join('\n');
    const result = Papa.parse(dataLines, { header: true, skipEmptyLines: true, dynamicTyping: false });
    const data = result.data || [];

    let totalSpend = 0, totalSpendPrev = 0;
    let totalCV = 0, totalCVPrev = 0;
    let totalClicks = 0, totalClicksPrev = 0;
    let totalImpressions = 0, totalImpressionsPrev = 0;

    let rows = data.map(r => {
      const cv = parseNumericString(r['コンバージョン']);
      const cvPrev = parseNumericString(r['コンバージョン（比較対象）']);
      const cost = parseNumericString(r['費用']);
      const costPrev = parseNumericString(r['費用（比較対象）']);
      const clicks = parseNumericString(r['クリック数']);
      const clicksPrev = parseNumericString(r['クリック数（比較対象）']);
      const impressions = parseNumericString(r['表示回数']);
      const impressionsPrev = parseNumericString(r['表示回数（比較対象）']);
      const cpa = parseNumericString(r['コンバージョン単価']);
      const cpaPrev = parseNumericString(r['コンバージョン単価（比較対象）']);
      const ctr = parsePercentString(r['クリック率']);
      const ctrPrev = parsePercentString(r['クリック率（比較対象）']);

      totalSpend += cost;
      totalSpendPrev += costPrev;
      totalCV += cv;
      totalCVPrev += cvPrev;
      totalClicks += clicks;
      totalClicksPrev += clicksPrev;
      totalImpressions += impressions;
      totalImpressionsPrev += impressionsPrev;

      const keyword = r['検索キーワード'] || '';
      const query = r['検索語句'] || '';
      const normalizedQuery = query.replace(/ /g, '');

      return {
        keyword, query: normalizedQuery, store,
        cv, cvPrev, cost, costPrev,
        clicks, clicksPrev,
        impressions, impressionsPrev,
        cpa, cpaPrev, ctr, ctrPrev,
        isBrand: isBrandKeyword(normalizedQuery) || isBrandKeyword(keyword.replace(/ /g, '')),
        cvr: clicks > 0 ? (cv / clicks) * 100 : 0,
        cvrPrev: clicksPrev > 0 ? (cvPrev / clicksPrev) * 100 : 0
      };
    });

    // 半角スペース除去後の同一キーワードをマージ
    const mergedMap = {};
    rows.forEach(r => {
      const key = r.query;
      if (!mergedMap[key]) {
        mergedMap[key] = { ...r };
      } else {
        const m = mergedMap[key];
        m.cv += r.cv; m.cvPrev += r.cvPrev;
        m.cost += r.cost; m.costPrev += r.costPrev;
        m.clicks += r.clicks; m.clicksPrev += r.clicksPrev;
        m.impressions += r.impressions; m.impressionsPrev += r.impressionsPrev;
        m.cpa = m.cv > 0 ? m.cost / m.cv : 0;
        m.cpaPrev = m.cvPrev > 0 ? m.costPrev / m.cvPrev : 0;
        m.ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
        m.ctrPrev = m.impressionsPrev > 0 ? (m.clicksPrev / m.impressionsPrev) * 100 : 0;
        m.cvr = m.clicks > 0 ? (m.cv / m.clicks) * 100 : 0;
        m.cvrPrev = m.clicksPrev > 0 ? (m.cvPrev / m.clicksPrev) * 100 : 0;
      }
    });
    rows = Object.values(mergedMap);

    return {
      rows,
      summary: {
        store,
        spend: totalSpend,
        spendPrev: totalSpendPrev,
        cv: totalCV,
        cvPrev: totalCVPrev,
        clicks: totalClicks,
        clicksPrev: totalClicksPrev,
        impressions: totalImpressions,
        impressionsPrev: totalImpressionsPrev,
        cpa: totalCV > 0 ? totalSpend / totalCV : 0,
        cpaPrev: totalCVPrev > 0 ? totalSpendPrev / totalCVPrev : 0,
        cvr: totalClicks > 0 ? (totalCV / totalClicks) * 100 : 0,
        cvrPrev: totalClicksPrev > 0 ? (totalCVPrev / totalClicksPrev) * 100 : 0
      }
    };
  },

  // --- 集計ヘルパー ---

  // Facebook広告の店舗別集計
  getFBStoreSummary(rows) {
    const summary = {};
    STORE_LIST.forEach(s => {
      summary[s] = { spend: 0, reach: 0, impressions: 0, conversions: 0, clicks: 0 };
    });

    rows.forEach(r => {
      const s = r.store;
      if (summary[s]) {
        summary[s].spend += r.spend;
        summary[s].reach += r.reach;
        summary[s].impressions += r.impressions;
        summary[s].conversions += r.conversions;
        summary[s].clicks += r.clicks;
      }
    });

    // CPA計算
    Object.values(summary).forEach(s => {
      s.cpa = s.conversions > 0 ? s.spend / s.conversions : 0;
    });

    return summary;
  },

  // Facebook広告のキャンペーン別集計
  getFBCampaignSummary(rows) {
    const map = {};
    rows.forEach(r => {
      const key = r.store + '|' + r.campaign;
      if (!map[key]) {
        map[key] = { store: r.store, campaign: r.campaign, spend: 0, reach: 0, impressions: 0, conversions: 0, ctrSum: 0, count: 0 };
      }
      map[key].spend += r.spend;
      map[key].reach += r.reach;
      map[key].impressions += r.impressions;
      map[key].conversions += r.conversions;
      map[key].ctrSum += r.ctr;
      map[key].count++;
    });

    return Object.values(map).map(c => ({
      ...c,
      cpa: c.conversions > 0 ? c.spend / c.conversions : 0,
      avgCtr: c.count > 0 ? c.ctrSum / c.count : 0
    }));
  },

  // Facebook広告のクリエイティブ別集計
  getFBCreativeSummary(rows) {
    const map = {};
    rows.forEach(r => {
      const key = r.store + '|' + r.adName;
      if (!map[key]) {
        map[key] = { store: r.store, adName: r.adName, campaign: r.campaign, spend: 0, impressions: 0, conversions: 0, reach: 0, ctrSum: 0, count: 0, frequencySum: 0 };
      }
      map[key].spend += r.spend;
      map[key].impressions += r.impressions;
      map[key].conversions += r.conversions;
      map[key].reach += r.reach;
      map[key].ctrSum += r.ctr;
      map[key].frequencySum += r.frequency;
      map[key].count++;
    });

    return Object.values(map).map(c => ({
      ...c,
      cpa: c.conversions > 0 ? c.spend / c.conversions : 0,
      avgCtr: c.count > 0 ? c.ctrSum / c.count : 0,
      avgFrequency: c.count > 0 ? c.frequencySum / c.count : 0
    }));
  },

  // Facebook広告の年齢×性別集計
  getFBDemoSummary(rows) {
    const map = {};
    rows.forEach(r => {
      const key = r.age + '|' + r.gender;
      if (!map[key]) {
        map[key] = { age: r.age, gender: r.gender, spend: 0, impressions: 0, conversions: 0, reach: 0 };
      }
      map[key].spend += r.spend;
      map[key].impressions += r.impressions;
      map[key].conversions += r.conversions;
      map[key].reach += r.reach;
    });

    return Object.values(map).map(d => ({
      ...d,
      cpa: d.conversions > 0 ? d.spend / d.conversions : 0,
      cvr: d.impressions > 0 ? (d.conversions / d.impressions) * 100 : 0
    }));
  },

  // 全体サマリー（全チャネル合算）
  getOverallSummary() {
    const d = this.data;
    const result = { current: {}, previous: {} };

    // Google広告
    let gSpend = 0, gSpendP = 0, gCV = 0, gCVP = 0, gClicks = 0, gClicksP = 0;
    STORE_LIST.forEach(s => {
      const sum = d.googleAds[s].summary;
      gSpend += sum.spend;
      gSpendP += sum.spendPrev;
      gCV += sum.cv;
      gCVP += sum.cvPrev;
      gClicks += sum.clicks;
      gClicksP += sum.clicksPrev;
    });

    // Facebook広告
    const fbCur = d.facebook.current;
    const fbPrev = d.facebook.previous;
    const fbSpend = fbCur.reduce((a, r) => a + r.spend, 0);
    const fbSpendP = fbPrev.reduce((a, r) => a + r.spend, 0);
    const fbCV = fbCur.reduce((a, r) => a + r.conversions, 0);
    const fbCVP = fbPrev.reduce((a, r) => a + r.conversions, 0);

    const totalSpend = gSpend + fbSpend;
    const totalSpendP = gSpendP + fbSpendP;
    const totalCV = gCV + fbCV;
    const totalCVP = gCVP + fbCVP;
    const totalClicks = gClicks;
    const totalClicksP = gClicksP;

    return {
      totalSpend, totalSpendPrev: totalSpendP,
      totalCV, totalCVPrev: totalCVP,
      totalCPA: totalCV > 0 ? totalSpend / totalCV : 0,
      totalCPAPrev: totalCVP > 0 ? totalSpendP / totalCVP : 0,
      totalCVR: totalClicks > 0 ? (totalCV / totalClicks) * 100 : 0,
      totalCVRPrev: totalClicksP > 0 ? (totalCVP / totalClicksP) * 100 : 0,
      google: { spend: gSpend, spendPrev: gSpendP, cv: gCV, cvPrev: gCVP },
      facebook: { spend: fbSpend, spendPrev: fbSpendP, cv: fbCV, cvPrev: fbCVP }
    };
  }
};

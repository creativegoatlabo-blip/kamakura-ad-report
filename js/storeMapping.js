// 店舗名正規化マッピング
const STORE_MAPPING = {
  '鎌倉工樹': '鎌倉本店',
  '鎌倉彫金工房 横浜元町店': '横浜元町',
  '鎌倉彫金工房 大阪中崎町': '大阪中崎町',
  '鎌倉本店': '鎌倉本店',
  '横浜元町': '横浜元町',
  '大阪中崎町': '大阪中崎町'
};

const STORE_LIST = ['鎌倉本店', '横浜元町', '大阪中崎町'];

const STORE_COLORS = {
  '鎌倉本店': '#4FC3F7',
  '横浜元町': '#81C784',
  '大阪中崎町': '#FFB74D'
};

// 指名検索キーワード判定
const BRAND_KEYWORDS = [
  '鎌倉彫金', '鎌倉工樹', 'kamakura', 'かまくら彫金',
  '鎌倉 彫金', '彫金工房 鎌倉', '彫金 工房'
];

function isBrandKeyword(keyword) {
  if (!keyword) return false;
  const lower = keyword.toLowerCase();
  return BRAND_KEYWORDS.some(bk => lower.includes(bk.toLowerCase()));
}

function normalizeStoreName(name) {
  if (!name) return '';
  const trimmed = name.trim();
  return STORE_MAPPING[trimmed] || trimmed;
}

// Google広告ファイル名から店舗名を取得
function storeFromFileName(fileName) {
  if (fileName.includes('鎌倉本店')) return '鎌倉本店';
  if (fileName.includes('横浜元町')) return '横浜元町';
  if (fileName.includes('大阪中崎町')) return '大阪中崎町';
  return '';
}

// GAアイテム名から店舗名を取得
function storeFromItemName(itemName) {
  if (!itemName) return '';
  if (itemName.startsWith('鎌倉-') || itemName.startsWith('鎌倉−')) return '鎌倉本店';
  if (itemName.startsWith('横浜元町-') || itemName.startsWith('横浜元町−')) return '横浜元町';
  if (itemName.startsWith('大阪-') || itemName.startsWith('大阪−')) return '大阪中崎町';
  return '';
}

// 数値フォーマットユーティリティ

function formatCurrency(value) {
  if (value == null || isNaN(value)) return '¥0';
  return '¥' + Math.round(value).toLocaleString('ja-JP');
}

function formatNumber(value, decimals = 0) {
  if (value == null || isNaN(value)) return '0';
  return Number(value).toLocaleString('ja-JP', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatPercent(value, decimals = 1) {
  if (value == null || isNaN(value)) return '0%';
  return Number(value).toFixed(decimals) + '%';
}

function formatYoYChange(current, previous) {
  if (previous == null || previous === 0) {
    if (current > 0) return { text: '+∞', class: 'positive' };
    return { text: '±0', class: 'neutral' };
  }
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const sign = change >= 0 ? '+' : '';
  return {
    text: sign + change.toFixed(1) + '%',
    class: change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral',
    value: change
  };
}

// CPAなど「低い方が良い」指標用の前年比
function formatYoYChangeInverse(current, previous) {
  const result = formatYoYChange(current, previous);
  if (result.class === 'positive') result.class = 'negative';
  else if (result.class === 'negative') result.class = 'positive';
  return result;
}

function formatDelta(current, previous, isCurrency = false) {
  const diff = (current || 0) - (previous || 0);
  const sign = diff >= 0 ? '+' : '';
  if (isCurrency) return sign + formatCurrency(diff).replace('¥', '¥');
  return sign + formatNumber(diff);
}

// CSV内のパーセンテージ文字列をパース
function parsePercentString(str) {
  if (!str || str === '' || str === '0') return 0;
  const cleaned = String(str).replace('%', '').replace(/\s/g, '').replace('+', '');
  if (cleaned === '∞' || cleaned === '+∞') return Infinity;
  if (cleaned === '-∞') return -Infinity;
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

// CSV内の数値文字列をパース（カンマ除去）
function parseNumericString(str) {
  if (!str || str === '') return 0;
  const cleaned = String(str).replace(/,/g, '').replace(/\s/g, '').replace('%', '');
  if (cleaned === '∞' || cleaned === '+∞') return Infinity;
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

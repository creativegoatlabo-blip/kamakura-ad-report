// 前年比計算ユーティリティ

function calcYoY(current, previous) {
  return {
    current: current || 0,
    previous: previous || 0,
    diff: (current || 0) - (previous || 0),
    changeRate: previous ? ((current - previous) / Math.abs(previous)) * 100 : (current > 0 ? Infinity : 0)
  };
}

function calcCPA(cost, conversions) {
  if (!conversions || conversions === 0) return 0;
  return cost / conversions;
}

function calcCVR(conversions, clicks) {
  if (!clicks || clicks === 0) return 0;
  return (conversions / clicks) * 100;
}

function calcROAS(revenue, cost) {
  if (!cost || cost === 0) return 0;
  return (revenue / cost) * 100;
}

// KPIカード用データ生成
function buildKPI(label, current, previous, options = {}) {
  const { isCurrency = false, isInverse = false, decimals = 0, suffix = '' } = options;
  const yoy = calcYoY(current, previous);
  const changeResult = isInverse
    ? formatYoYChangeInverse(current, previous)
    : formatYoYChange(current, previous);

  return {
    label,
    current,
    previous,
    diff: yoy.diff,
    changeRate: yoy.changeRate,
    changeText: changeResult.text,
    changeClass: changeResult.class,
    formattedCurrent: isCurrency ? formatCurrency(current) : formatNumber(current, decimals) + suffix,
    formattedPrevious: isCurrency ? formatCurrency(previous) : formatNumber(previous, decimals) + suffix
  };
}

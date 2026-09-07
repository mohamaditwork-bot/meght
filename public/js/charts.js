/* charts.js — ECharts brand theme + reusable chart builders. */
(function () {
  const BRAND = {
    teal: '#0e5a5a', tealD: '#0a3f42', green: '#16a34a', greenL: '#34c759',
    amber: '#e0a400', red: '#dc2626', blue: '#2563eb', ink: '#0f1e2b', muted: '#6b7a8d', line: '#e4e9ee',
  };
  // Categorical palette — restrained, brand-led (teals + greens + muted neutrals),
  // no decorative rainbow; reads calm and formal.
  const CATS = ['#0e5a5a', '#1a8c46', '#127a72', '#2ebd63', '#3c6e6e', '#8bbf9f',
    '#0a3438', '#b7791f', '#5b8a8a', '#6a9c86', '#94a3a8', '#144e4e', '#a7c9b6', '#0c474a'];
  const FONT = "'Cairo','Tajawal',sans-serif";
  const registry = new Map();

  function baseTextStyle() { return { fontFamily: FONT, color: BRAND.ink }; }
  function tooltip(extra = {}) {
    return Object.assign({
      backgroundColor: 'rgba(15,30,43,.94)', borderWidth: 0, borderRadius: 10,
      padding: [9, 13], textStyle: { color: '#fff', fontFamily: FONT, fontSize: 12.5 },
      extraCssText: 'box-shadow:0 8px 30px rgba(0,0,0,.25);',
    }, extra);
  }
  function fmtN(n) { return (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US'); }

  function init(el) {
    if (!el) return null;
    if (registry.has(el)) { registry.get(el).dispose(); }
    const c = echarts.init(el, null, { renderer: 'canvas' });
    registry.set(el, c);
    return c;
  }
  function render(el, option) {
    const c = init(el); if (!c) return null;
    c.setOption(option, true);
    return c;
  }
  window.addEventListener('resize', () => { registry.forEach((c) => { try { c.resize(); } catch (e) {} }); });
  function resizeAll() { registry.forEach((c) => { try { c.resize(); } catch (e) {} }); }
  function disposeAll() { registry.forEach((c) => { try { c.dispose(); } catch (e) {} }); registry.clear(); }

  // Donut
  function donut(el, data, opts = {}) {
    const total = data.reduce((a, d) => a + d.value, 0);
    return render(el, {
      textStyle: baseTextStyle(), color: opts.colors || CATS,
      tooltip: tooltip({ trigger: 'item', formatter: (p) => `${p.name}<br><b>${fmtN(p.value)}</b> (${p.percent}%)` }),
      legend: { type: 'scroll', bottom: 0, textStyle: { fontFamily: FONT, fontSize: 11.5, color: BRAND.muted }, itemWidth: 11, itemHeight: 11, icon: 'roundRect' },
      series: [{
        type: 'pie', radius: ['52%', '76%'], center: ['50%', '44%'], avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        label: { show: !!opts.centerLabel, position: 'center', formatter: opts.centerLabel || '', fontFamily: FONT, fontSize: 22, fontWeight: 800, color: BRAND.ink },
        emphasis: { scale: true, scaleSize: 6, label: { show: !!opts.centerLabel } },
        labelLine: { show: false }, data,
      }],
      graphic: opts.center ? [{ type: 'text', left: 'center', top: '38%', style: { text: opts.center, textAlign: 'center', fill: BRAND.ink, fontSize: 24, fontWeight: 800, fontFamily: FONT } },
        { type: 'text', left: 'center', top: '50%', style: { text: opts.centerSub || '', textAlign: 'center', fill: BRAND.muted, fontSize: 11, fontFamily: FONT } }] : [],
    });
  }

  // Horizontal bar
  function barH(el, cats, values, opts = {}) {
    return render(el, {
      textStyle: baseTextStyle(),
      grid: { left: opts.left || 8, right: 24, top: 12, bottom: 8, containLabel: true },
      tooltip: tooltip({ trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[0].name}<br><b>${fmtN(p[0].value)}</b>${opts.suffix || ''}` }),
      xAxis: { type: 'value', axisLabel: { color: BRAND.muted, fontFamily: FONT }, splitLine: { lineStyle: { color: BRAND.line } } },
      yAxis: { type: 'category', data: cats, inverse: true, axisLabel: { color: BRAND.ink, fontFamily: FONT, fontSize: 11.5, width: opts.labelWidth || 120, overflow: 'truncate' }, axisTick: { show: false }, axisLine: { show: false } },
      series: [{
        type: 'bar', data: values, barMaxWidth: 22, barCategoryGap: '35%',
        itemStyle: { borderRadius: [0, 6, 6, 0], color: opts.color || new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#0e5a5a' }, { offset: 1, color: '#1fae4a' }]) },
        label: opts.showLabel ? { show: true, position: 'right', formatter: (p) => fmtN(p.value) + (opts.suffix || ''), fontFamily: FONT, color: BRAND.ink_2 || BRAND.muted, fontWeight: 700, fontSize: 11 } : { show: false },
      }],
    });
  }

  // Vertical bar
  function barV(el, cats, values, opts = {}) {
    return render(el, {
      textStyle: baseTextStyle(), color: opts.colors || CATS,
      grid: { left: 8, right: 12, top: 18, bottom: 8, containLabel: true },
      tooltip: tooltip({ trigger: 'axis', axisPointer: { type: 'shadow' } }),
      xAxis: { type: 'category', data: cats, axisLabel: { color: BRAND.ink, fontFamily: FONT, fontSize: 11, interval: 0, rotate: opts.rotate || 0 }, axisTick: { show: false } },
      yAxis: { type: 'value', axisLabel: { color: BRAND.muted, fontFamily: FONT }, splitLine: { lineStyle: { color: BRAND.line } } },
      series: [{ type: 'bar', data: values, barMaxWidth: 34, itemStyle: { borderRadius: [6, 6, 0, 0], color: opts.color || new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#1fae4a' }, { offset: 1, color: '#0e5a5a' }]) } }],
    });
  }

  // Stacked bar (Saudi vs non-Saudi etc.)
  function stacked(el, cats, series, opts = {}) {
    return render(el, {
      textStyle: baseTextStyle(),
      grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
      tooltip: tooltip({ trigger: 'axis', axisPointer: { type: 'shadow' } }),
      legend: { top: 0, textStyle: { fontFamily: FONT, color: BRAND.muted, fontSize: 11.5 }, itemWidth: 12, itemHeight: 12, icon: 'roundRect' },
      xAxis: opts.horizontal ? { type: 'value', axisLabel: { color: BRAND.muted, fontFamily: FONT }, splitLine: { lineStyle: { color: BRAND.line } } } : { type: 'category', data: cats, axisLabel: { color: BRAND.ink, fontFamily: FONT, fontSize: 11, interval: 0, rotate: opts.rotate || 0 } },
      yAxis: opts.horizontal ? { type: 'category', data: cats, inverse: true, axisLabel: { color: BRAND.ink, fontFamily: FONT, fontSize: 11.5, width: opts.labelWidth || 110, overflow: 'truncate' } } : { type: 'value', axisLabel: { color: BRAND.muted, fontFamily: FONT }, splitLine: { lineStyle: { color: BRAND.line } } },
      series: series.map((s, i) => ({
        name: s.name, type: 'bar', stack: 'total', data: s.data, barMaxWidth: 26,
        itemStyle: { color: s.color || CATS[i], borderRadius: i === series.length - 1 ? (opts.horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0]) : 0 },
      })),
    });
  }

  // Treemap
  function treemap(el, data) {
    return render(el, {
      textStyle: baseTextStyle(),
      tooltip: tooltip({ formatter: (p) => `${p.name}<br><b>${fmtN(p.value)}</b>` }),
      series: [{
        type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false },
        data, width: '100%', height: '100%', top: 4, bottom: 4, left: 4, right: 4,
        label: { fontFamily: FONT, fontSize: 12, fontWeight: 700, color: '#fff', formatter: (p) => `${p.name}\n${fmtN(p.value)}` },
        itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 },
        levels: [{ color: CATS, colorMappingBy: 'index' }],
      }],
    });
  }

  // Line / trend
  function line(el, cats, series, opts = {}) {
    return render(el, {
      textStyle: baseTextStyle(), color: opts.colors || CATS,
      grid: { left: 8, right: 18, top: 24, bottom: 8, containLabel: true },
      tooltip: tooltip({ trigger: 'axis' }),
      legend: series.length > 1 ? { top: 0, textStyle: { fontFamily: FONT, color: BRAND.muted, fontSize: 11.5 } } : undefined,
      xAxis: { type: 'category', data: cats, boundaryGap: false, axisLabel: { color: BRAND.ink, fontFamily: FONT, fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { color: BRAND.muted, fontFamily: FONT }, splitLine: { lineStyle: { color: BRAND.line } } },
      series: series.map((s, i) => ({
        name: s.name, type: 'line', smooth: true, data: s.data, symbol: 'circle', symbolSize: 7,
        lineStyle: { width: 3 }, areaStyle: opts.area ? { opacity: .12 } : undefined,
      })),
    });
  }

  // Waterfall (workforce movement)
  function waterfall(el, items) {
    // items: [{name, value, type:'total'|'inc'|'dec'}]
    let running = 0; const base = [], up = [], down = [], tot = [];
    items.forEach((it) => {
      if (it.type === 'total') { base.push('-'); up.push('-'); down.push('-'); tot.push(it.value); running = it.value; }
      else if (it.value >= 0) { base.push(running); up.push(it.value); down.push('-'); tot.push('-'); running += it.value; }
      else { running += it.value; base.push(running); up.push('-'); down.push(-it.value); tot.push('-'); }
    });
    return render(el, {
      textStyle: baseTextStyle(),
      grid: { left: 8, right: 16, top: 20, bottom: 8, containLabel: true },
      tooltip: tooltip({ trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => { const it = items[p[0].dataIndex]; return `${it.name}<br><b>${fmtN(it.value)}</b>`; } }),
      xAxis: { type: 'category', data: items.map((i) => i.name), axisLabel: { color: BRAND.ink, fontFamily: FONT, fontSize: 10.5, interval: 0, rotate: 22 } },
      yAxis: { type: 'value', axisLabel: { color: BRAND.muted, fontFamily: FONT }, splitLine: { lineStyle: { color: BRAND.line } } },
      series: [
        { type: 'bar', stack: 'w', itemStyle: { color: 'transparent' }, data: base },
        { type: 'bar', stack: 'w', data: up, itemStyle: { color: '#16a34a', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 34, label: { show: true, position: 'top', formatter: (p) => p.value === '-' ? '' : '+' + fmtN(p.value), fontFamily: FONT, fontSize: 10, color: '#15803d', fontWeight: 700 } },
        { type: 'bar', stack: 'w', data: down, itemStyle: { color: '#dc2626', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 34, label: { show: true, position: 'top', formatter: (p) => p.value === '-' ? '' : '−' + fmtN(p.value), fontFamily: FONT, fontSize: 10, color: '#b91c1c', fontWeight: 700 } },
        { type: 'bar', stack: 'w', data: tot, itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#0e5a5a' }, { offset: 1, color: '#0a3f42' }]), borderRadius: [4, 4, 0, 0] }, barMaxWidth: 34, label: { show: true, position: 'top', formatter: (p) => p.value === '-' ? '' : fmtN(p.value), fontFamily: FONT, fontSize: 11, color: BRAND.ink, fontWeight: 800 } },
      ],
    });
  }

  // Heatmap (nationality x section)
  function heatmap(el, rows, cols, data, opts = {}) {
    const max = Math.max(1, ...data.map((d) => d[2]));
    return render(el, {
      textStyle: baseTextStyle(),
      tooltip: tooltip({ formatter: (p) => `${cols[p.value[0]]} · ${rows[p.value[1]]}<br><b>${fmtN(p.value[2])}</b>` }),
      grid: { left: 8, right: 14, top: 10, bottom: 60, containLabel: true },
      xAxis: { type: 'category', data: cols, splitArea: { show: true }, axisLabel: { color: BRAND.ink, fontFamily: FONT, fontSize: 10, rotate: 40, interval: 0 } },
      yAxis: { type: 'category', data: rows, splitArea: { show: true }, axisLabel: { color: BRAND.ink, fontFamily: FONT, fontSize: 10.5, width: 90, overflow: 'truncate' } },
      visualMap: { min: 0, max, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#eef7f2', '#7fd0a1', '#16a34a', '#0a3f42'] }, textStyle: { fontFamily: FONT, color: BRAND.muted } },
      series: [{ type: 'heatmap', data, label: { show: opts.showLabel !== false, fontFamily: FONT, fontSize: 10, color: '#0f1e2b' }, itemStyle: { borderColor: '#fff', borderWidth: 1 }, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,.25)' } } }],
    });
  }

  // Gauge / progress ring
  function gauge(el, value, opts = {}) {
    const color = opts.color || (value >= (opts.target || 100) ? '#16a34a' : value >= 50 ? '#e0a400' : '#dc2626');
    return render(el, {
      series: [{
        type: 'gauge', startAngle: 220, endAngle: -40, min: 0, max: 100, radius: '96%', center: ['50%', '56%'],
        progress: { show: true, width: 14, itemStyle: { color } },
        axisLine: { lineStyle: { width: 14, color: [[1, '#eef2f5']] } },
        pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        anchor: { show: false }, title: { show: false },
        detail: { valueAnimation: true, formatter: (v) => (opts.pct ? v.toFixed(opts.dec ?? 1) + '%' : v.toFixed(0)), fontFamily: FONT, fontSize: 26, fontWeight: 800, color: BRAND.ink, offsetCenter: [0, 0] },
        data: [{ value }],
      }],
    });
  }

  window.Chart = { render, donut, barH, barV, stacked, treemap, line, waterfall, heatmap, gauge, resizeAll, disposeAll, CATS, BRAND, fmtN };
})();

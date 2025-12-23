// Chart.js plugin for simple linear regression trendline
Chart.register({
  id: 'trendline',
  afterDatasetsDraw(chart, args, options) {
    if (!options || !options.enabled) return;
    const ctx = chart.ctx;
    chart.data.datasets.forEach((dataset, i) => {
      if (!dataset._showTrendline) return;
      const data = dataset.data.map((v, idx) => ({ x: idx, y: v })).filter(d => typeof d.y === 'number' && !isNaN(d.y));
      if (data.length < 2) return;
      // Linear regression
      const n = data.length;
      const sumX = data.reduce((a, d) => a + d.x, 0);
      const sumY = data.reduce((a, d) => a + d.y, 0);
      const sumXY = data.reduce((a, d) => a + d.x * d.y, 0);
      const sumXX = data.reduce((a, d) => a + d.x * d.x, 0);
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      // Get chart area
      const meta = chart.getDatasetMeta(i);
      const xAxis = chart.scales[meta.xAxisID];
      const yAxis = chart.scales[meta.yAxisID];
      // Draw trendline
      ctx.save();
      ctx.beginPath();
      // Use dataset borderColor or fallback to plugin color
      ctx.strokeStyle = dataset.borderColor || options.color || '#e74c3c';
      ctx.lineWidth = options.lineWidth || 2;
      for (let j = 0; j < data.length; j++) {
        const x = xAxis.getPixelForValue(j);
        const y = yAxis.getPixelForValue(slope * j + intercept);
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    });
  }
});

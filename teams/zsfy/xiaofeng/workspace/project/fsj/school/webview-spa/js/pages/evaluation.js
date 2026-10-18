/**
 * 过程评价页面
 */
var EvaluationPage = {
  _initialized: false,

  init: function () {
    if (this._initialized) return;
    this._initialized = true;

    this.drawRadar();
    this.drawClassStats();
    this.drawWeaknessChart();
  },

  drawRadar: function () {
    var canvas = document.getElementById('radar-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var cx = 100, cy = 100, r = 70;
    var labels = ['运算', '几何', '推理', '应用', '理解'];
    var data1 = [0.8, 0.6, 0.7, 0.5, 0.9];
    var data2 = [0.5, 0.4, 0.6, 0.3, 0.7];

    // 画五边形网格
    for (var level = 1; level <= 4; level++) {
      ctx.beginPath();
      var lr = r * level / 4;
      for (var i = 0; i < 5; i++) {
        var angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
        var x = cx + lr * Math.cos(angle);
        var y = cy + lr * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 画轴线
    for (var i = 0; i < 5; i++) {
      var angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      ctx.strokeStyle = '#E5E7EB';
      ctx.stroke();
    }

    // 画数据区域 - 当前
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
      var x = cx + r * data1[i] * Math.cos(angle);
      var y = cy + r * data1[i] * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(37, 99, 235, 0.2)';
    ctx.fill();
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 画数据区域 - 之前
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
      var x = cx + r * data2[i] * Math.cos(angle);
      var y = cy + r * data2[i] * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.fill();
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 画标签
    ctx.fillStyle = '#6B7280';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    for (var i = 0; i < 5; i++) {
      var angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
      var x = cx + (r + 20) * Math.cos(angle);
      var y = cy + (r + 20) * Math.sin(angle);
      ctx.fillText(labels[i], x, y + 4);
    }
  },

  drawClassStats: function () {
    var canvas = document.getElementById('class-stats-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var categories = ['数与代数', '图形几何', '零基础', '数与代数', '数与代数', '学习评改'];
    var data1 = [120, 80, 130, 170, 90, 110];
    var data2 = [80, 60, 50, 130, 100, 80];

    var barWidth = 20;
    var gap = 30;
    var startX = 20;
    var maxH = 100;

    ctx.fillStyle = '#6B7280';
    ctx.font = '9px sans-serif';

    for (var i = 0; i < categories.length; i++) {
      var x = startX + i * (barWidth * 2 + gap + 10);

      // 蓝柱
      ctx.fillStyle = '#3B82F6';
      var h1 = (data1[i] / 200) * maxH;
      ctx.fillRect(x, 110 - h1, barWidth, h1);

      // 绿柱
      ctx.fillStyle = '#10B981';
      var h2 = (data2[i] / 200) * maxH;
      ctx.fillRect(x + barWidth + 4, 110 - h2, barWidth, h2);

      // 标签
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(x + barWidth, 118);
      ctx.rotate(-0.3);
      ctx.fillText(categories[i], 0, 0);
      ctx.restore();
    }
  },

  drawWeaknessChart: function () {
    var canvas = document.getElementById('weakness-chart-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var categories = ['数与代数', '图形几何', '统计', '教育代数', '数与评改'];
    var data1 = [350, 500, 300, 520, 380];
    var data2 = [380, 650, 550, 350, 480];

    var barWidth = 22;
    var gap = 16;
    var startX = 15;

    for (var i = 0; i < categories.length; i++) {
      var x = startX + i * (barWidth * 2 + gap);

      ctx.fillStyle = '#3B82F6';
      var h1 = (data1[i] / 700) * 85;
      ctx.fillRect(x, 90 - h1, barWidth, h1);

      ctx.fillStyle = '#EF4444';
      var h2 = (data2[i] / 700) * 85;
      ctx.fillRect(x + barWidth + 4, 90 - h2, barWidth, h2);

      ctx.fillStyle = '#9CA3AF';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(categories[i], x + barWidth, 98);
    }
  }
};

export default EvaluationPage;

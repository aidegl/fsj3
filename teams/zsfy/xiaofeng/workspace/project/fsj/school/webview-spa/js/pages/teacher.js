/**
 * 教师后台页面
 */
var TeacherPage = {
  _initialized: false,

  init: function () {
    if (this._initialized) return;
    this._initialized = true;

    this.drawChart();
    this.drawBarChart();
    this.drawDonut();
    this.renderCalendar();
    this.bindEvents();
  },

  drawChart: function () {
    var canvas = document.getElementById('teacher-chart-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var data = [200, 350, 300, 450, 600, 420, 500, 600, 450, 550];

    var startX = 30;
    var startY = 10;
    var endX = 280;
    var endY = 100;
    var w = endX - startX;
    var h = endY - startY;

    // 画网格
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 0.5;
    for (var i = 0; i <= 4; i++) {
      var y = startY + h * i / 4;
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();

      ctx.fillStyle = '#9CA3AF';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText((800 - i * 200).toString(), startX - 4, y + 3);
    }

    // 画面积图
    ctx.beginPath();
    ctx.moveTo(startX, endY);
    for (var i = 0; i < data.length; i++) {
      var x = startX + (w / (data.length - 1)) * i;
      var y = endY - (data[i] / 800) * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(endX, endY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
    ctx.fill();

    // 画线
    ctx.beginPath();
    for (var i = 0; i < data.length; i++) {
      var x = startX + (w / (data.length - 1)) * i;
      var y = endY - (data[i] / 800) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 画点
    for (var i = 0; i < data.length; i++) {
      var x = startX + (w / (data.length - 1)) * i;
      var y = endY - (data[i] / 800) * h;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#3B82F6';
      ctx.fill();
    }
  },

  drawBarChart: function () {
    var canvas = document.getElementById('teacher-bar-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var data1 = [350, 280, 420, 310, 380, 250];
    var data2 = [280, 200, 350, 250, 300, 180];

    var barWidth = 10;
    var gap = 8;
    var startX = 10;

    for (var i = 0; i < 6; i++) {
      var x = startX + i * (barWidth * 2 + gap + 6);

      ctx.fillStyle = '#3B82F6';
      ctx.fillRect(x, 90 - (data1[i] / 500) * 80, barWidth, (data1[i] / 500) * 80);

      ctx.fillStyle = '#EF4444';
      ctx.fillRect(x + barWidth + 2, 90 - (data2[i] / 500) * 80, barWidth, (data2[i] / 500) * 80);
    }
  },

  drawDonut: function () {
    var canvas = document.getElementById('teacher-donut-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var cx = 50, cy = 50, r = 35, lineWidth = 12;
    var data = [
      { value: 42.20, color: '#3B82F6' },
      { value: 23.90, color: '#10B981' },
      { value: 19.65, color: '#F59E0B' },
      { value: 14.25, color: '#E5E7EB' },
    ];

    var total = data.reduce(function (s, d) { return s + d.value; }, 0);
    var startAngle = -Math.PI / 2;

    data.forEach(function (d) {
      var sliceAngle = (d.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
      ctx.strokeStyle = d.color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      startAngle += sliceAngle;
    });

    // 中心文字
    ctx.fillStyle = '#1F2937';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('42.2%', cx, cy + 4);
  },

  renderCalendar: function () {
    var container = document.getElementById('teacher-calendar');
    if (!container) return;

    var headers = ['一', '二', '三', '四', '五', '六', '日'];
    var days = [
      1, 2, 3, 4, 5, 6, 7,
      8, 9, 10, 11, 12, 13, 14,
      15, 16, 17, 18, 19, 20, 21,
      22, 23, 24, 25, 26, 27, 28,
      29, 30
    ];

    var html = headers.map(function (h) {
      return '<div class="cal-header">' + h + '</div>';
    }).join('');

    var today = new Date().getDate();
    html += days.map(function (d) {
      return '<div class="cal-day' + (d === today ? ' today' : '') + '">' + d + '</div>';
    }).join('');

    container.innerHTML = html;
  },

  bindEvents: function () {
    var actionBtn = document.getElementById('teacher-action-btn');
    if (actionBtn) {
      actionBtn.addEventListener('click', function () {
        alert('一键式操作：快速出题/推送资源');
      });
    }
  }
};

export default TeacherPage;

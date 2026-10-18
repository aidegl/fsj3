/**
 * 可视化教学页面 - 几何画板
 */
var VisualPage = {
  _initialized: false,
  ctx: null,
  currentTool: 'compass',

  init: function () {
    if (this._initialized) return;
    this._initialized = true;

    this.initCanvas();
    this.bindEvents();
  },

  initCanvas: function () {
    var canvas = document.getElementById('draw-canvas');
    if (!canvas) return;

    this.ctx = canvas.getContext('2d');
    this.drawDefault();
  },

  drawDefault: function () {
    var ctx = this.ctx;
    if (!ctx) return;

    // 画一个七巧板示例
    ctx.clearRect(0, 0, 300, 400);

    // 网格线
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 0.5;
    for (var i = 0; i < 300; i += 30) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 400);
      ctx.stroke();
    }
    for (var j = 0; j < 400; j += 30) {
      ctx.beginPath();
      ctx.moveTo(0, j);
      ctx.lineTo(300, j);
      ctx.stroke();
    }

    // 七巧板图形
    ctx.fillStyle = '#FCD34D';
    ctx.beginPath();
    ctx.moveTo(100, 80);
    ctx.lineTo(180, 80);
    ctx.lineTo(100, 200);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#EC4899';
    ctx.beginPath();
    ctx.moveTo(180, 80);
    ctx.lineTo(240, 140);
    ctx.lineTo(180, 200);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#3B82F6';
    ctx.beginPath();
    ctx.moveTo(100, 200);
    ctx.lineTo(180, 200);
    ctx.lineTo(180, 280);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#9CA3AF';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(80, 60, 180, 240);
    ctx.setLineDash([]);
  },

  bindEvents: function () {
    var self = this;

    // 工具切换
    document.querySelectorAll('.tool-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tool-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        self.currentTool = btn.getAttribute('data-tool');
      });
    });

    // 画布点击 - 添加图形
    var plusBtn = document.getElementById('canvas-plus');
    if (plusBtn) {
      plusBtn.addEventListener('click', function () {
        self.addShape();
      });
    }
  },

  addShape: function () {
    var ctx = this.ctx;
    if (!ctx) return;

    var colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
    var color = colors[Math.floor(Math.random() * colors.length)];

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7;

    var x = 50 + Math.random() * 200;
    var y = 50 + Math.random() * 300;
    var size = 20 + Math.random() * 30;

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
  }
};

export default VisualPage;

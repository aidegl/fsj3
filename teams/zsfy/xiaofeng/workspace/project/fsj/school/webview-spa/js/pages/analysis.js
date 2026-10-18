/**
 * 错题诊疗页面
 */
import AIService from '../services/ai.js';

var AnalysisPage = {
  images: [],
  _initialized: false,

  init: function () {
    if (this._initialized) return;
    this._initialized = true;

    this.bindEvents();
  },

  bindEvents: function () {
    var self = this;
    var uploadBtn = document.getElementById('analysis-upload-btn');
    var fileInput = document.getElementById('analysis-file-input');
    var practiceBtn = document.getElementById('analysis-practice-btn');
    var collectBtn = document.getElementById('analysis-collect-btn');

    if (uploadBtn) {
      uploadBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (fileInput) fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function (e) {
        e.preventDefault();
        self.handleFiles(e.target.files);
      });
    }

    if (practiceBtn) {
      practiceBtn.addEventListener('click', function () {
        alert('巩固练习功能开发中');
      });
    }

    if (collectBtn) {
      collectBtn.addEventListener('click', function () {
        alert('已收藏到错题本');
      });
    }
  },

  handleFiles: function (files) {
    var self = this;
    if (!files || files.length === 0) return;

    var preview = document.getElementById('analysis-preview');
    if (!preview) return;

    // 隐藏上传按钮
    var uploadBtn = document.getElementById('analysis-upload-btn');
    if (uploadBtn) uploadBtn.style.display = 'none';

    Array.from(files).forEach(function (file) {
      if (!file.type.startsWith('image/')) return;

      var reader = new FileReader();
      reader.onload = function (e) {
        var dataUrl = e.target.result;
        self.images.push(dataUrl);

        var img = document.createElement('img');
        img.src = dataUrl;
        preview.appendChild(img);

        // 自动开始分析
        self.startAnalysis();
      };
      reader.readAsDataURL(file);
    });
  },

  startAnalysis: function () {
    var self = this;

    // 显示视频区
    var videoSection = document.getElementById('analysis-video-section');
    if (videoSection) videoSection.style.display = 'block';

    // 显示分析卡片
    var cards = document.getElementById('analysis-cards');
    if (cards) cards.style.display = 'flex';

    // Demo：无论上传什么图片，统一使用内置提示词
    var demoPrompt = '上面有一道方程题 2x + 3 = 7，学生选了 C. x=5（错误答案，正确应为 x=2），带有红色圈和叉号标记';

    var result = document.getElementById('analysis-result');
    if (result) {
      result.innerHTML = '<div style="color:var(--text-weak);font-size:var(--font-sm);">正在分析...</div>';
    }

    AIService.execute(
      { content: demoPrompt },
      function (event) {
        if (event.type === 'progress') {
          if (result) {
            result.innerHTML = '<div style="font-size:var(--font-sm);line-height:1.8;">' +
              event.content.replace(/\n/g, '<br/>') + '</div>';
          }
        } else if (event.type === 'result') {
          if (result) {
            result.innerHTML = '<div style="font-size:var(--font-sm);line-height:1.8;">' +
              event.content.replace(/\n/g, '<br/>') + '</div>';
          }
        }
      }
    );
  }
};

export default AnalysisPage;

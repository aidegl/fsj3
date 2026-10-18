/**
 * 数学史页面
 */
var HistoryPage = {
  stories: [
    {
      title: '祖冲之与圆周率',
      text: '祖冲之计算圆周率、算筹，祖冲之计算，圆周率，全国圆周，传做一九章科学术竹，祖洫之计算圆周率。',
      bio: '刘徽注《九章术》，他分'
    },
    {
      title: '勾股定理的故事',
      text: '勾三股四弦五，这是中国古代数学家发现的直角三角形边长关系。商高在《周髀算经》中记载了这个发现。',
      bio: '商高，西周初年数学家，最早提出勾股定理。'
    },
    {
      title: '九章算术',
      text: '《九章算术》是中国古代最重要的数学著作之一，收录了246个数学问题，分为九章，涵盖了方田、粟米、衰分等。',
      bio: '张苍、耿寿昌等整理编纂，成书于东汉时期。'
    }
  ],
  currentStory: 0,
  _initialized: false,

  init: function () {
    if (this._initialized) return;
    this._initialized = true;

    this.renderStory(0);
    this.bindEvents();
  },

  renderStory: function (idx) {
    var story = this.stories[idx];
    if (!story) return;

    var textEl = document.getElementById('story-text');
    var bioEl = document.getElementById('story-bio');
    if (textEl) textEl.textContent = story.text;
    if (bioEl) bioEl.textContent = story.bio;
  },

  bindEvents: function () {
    var self = this;

    var nextBtn = document.getElementById('story-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        self.currentStory = (self.currentStory + 1) % self.stories.length;
        self.renderStory(self.currentStory);
      });
    }

    var collectBtn = document.getElementById('story-collect-btn');
    if (collectBtn) {
      collectBtn.addEventListener('click', function () {
        alert('已收藏这个故事');
      });
    }
  }
};

export default HistoryPage;

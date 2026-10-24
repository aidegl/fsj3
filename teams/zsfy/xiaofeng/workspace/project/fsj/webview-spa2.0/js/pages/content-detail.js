/**
 * 内容详情页面
 * 功能：通用内容详情展示（商品/文章/任务等），加载元数据并渲染
 * 评论功能：列表加载、发表、两级回复
 */
var ContentDetailPage = {
  // 当前内容数据
  contentData: null,
  contentRowid: '',

  // 评论状态
  comments: [],
  commentPage: 1,
  commentHasMore: true,
  commentLoading: false,
  replyTo: null, // { rowid: '评论rowid', authorName: '作者名' }

  // DOM
  backBtn: null,
  loadingState: null,
  emptyState: null,
  body: null,
  cover: null,
  title: null,
  bodyText: null,
  authorAvatar: null,
  authorName: null,
  commentSection: null,
  commentCount: null,
  commentTextarea: null,
  commentSubmitBtn: null,
  commentReplyCancel: null,
  commentList: null,
  commentLoadMore: null,

  init: function () {
    this.backBtn = document.getElementById('content-detail-back-btn');
    this.loadingState = document.getElementById('content-detail-loading-state');
    this.emptyState = document.getElementById('content-detail-empty-state');
    this.body = document.getElementById('content-detail-body');
    this.cover = document.getElementById('content-detail-cover');
    this.title = document.getElementById('content-detail-title');
    this.bodyText = document.getElementById('content-detail-body-text');
    this.authorAvatar = document.getElementById('content-detail-author-avatar');
    this.authorName = document.getElementById('content-detail-author-name');

    // 评论 DOM
    this.commentSection = document.getElementById('content-detail-comment-section');
    this.commentCount = document.getElementById('content-detail-comment-count');
    this.commentTextarea = document.getElementById('content-comment-textarea');
    this.commentSubmitBtn = document.getElementById('content-comment-submit-btn');
    this.commentReplyCancel = document.getElementById('content-comment-reply-cancel');
    this.commentList = document.getElementById('content-detail-comment-list');
    this.commentLoadMore = document.getElementById('content-detail-comment-load-more');

    this.bindEvents();
  },

  bindEvents: function () {
    var self = this;

    // 返回按钮
    if (this.backBtn && !this.backBtn._bound) {
      this.backBtn._bound = true;
      this.backBtn.addEventListener('click', function () {
        self._back();
      });
    }

    // 发表评论
    if (this.commentSubmitBtn && !this.commentSubmitBtn._bound) {
      this.commentSubmitBtn._bound = true;
      this.commentSubmitBtn.addEventListener('click', function () {
        self.submitComment();
      });
    }

    // 取消回复
    if (this.commentReplyCancel && !this.commentReplyCancel._bound) {
      this.commentReplyCancel._bound = true;
      this.commentReplyCancel.addEventListener('click', function () {
        self.cancelReply();
      });
    }

    // 加载更多评论
    if (this.commentLoadMore && !this.commentLoadMore._bound) {
      this.commentLoadMore._bound = true;
      this.commentLoadMore.addEventListener('click', function () {
        self.loadMoreComments();
      });
    }
  },

  /**
   * 加载内容详情
   * @param {string} rowid - 内容 rowid
   */
  loadContent: function (rowid) {
    var self = this;
    this.contentRowid = rowid;
    this.contentData = null;

    // 重置评论
    this.comments = [];
    this.commentPage = 1;
    this.commentHasMore = true;
    this.replyTo = null;
    this.clearReplyState();

    this.showLoading();

    if (!FsjApi || !FsjApi.getContentDetail) {
      this.showError('接口未定义');
      return;
    }

    FsjApi.getContentDetail(rowid)
      .then(function (res) {
        if (!res || !res.success) {
          self.showError('内容不存在或已下架');
          return;
        }

        self.contentData = res.data;
        self.render();
        self.hideLoading();

        // 加载评论
        self.loadComments();
      })
      .catch(function (err) {
        console.error('[内容详情] 加载失败:', err);
        self.showError('加载失败: ' + err.message);
      });
  },

  /**
   * 渲染内容
   */
  render: function () {
    var data = this.contentData;
    if (!data) return;

    // 审核期间不显示头像
    var shenhe = localStorage.getItem('fsj_shenhe') || '';

    // 作者信息
    var authorName = '未知作者';
    var authorAvatar = 'assets/logo.png';
    if (data.fabuzhe) {
      try {
        var publisher = typeof data.fabuzhe === 'string' ? JSON.parse(data.fabuzhe) : data.fabuzhe;
        if (Array.isArray(publisher) && publisher.length > 0) {
          authorName = publisher[0].name || publisher[0].mingcheng || authorName;
          // 审核期间不显示头像
          if (shenhe !== '1') {
            // 头像在 sourcevalue 里的字段 69ad979f6a3532cabd764603
            var sourcevalue = publisher[0].sourcevalue;
            if (sourcevalue) {
              var sv = typeof sourcevalue === 'string' ? JSON.parse(sourcevalue) : sourcevalue;
              var avatarField = sv['69ad979f6a3532cabd764603'];
              if (avatarField) {
                var avatarArr = typeof avatarField === 'string' ? JSON.parse(avatarField) : avatarField;
                if (Array.isArray(avatarArr) && avatarArr.length > 0) {
                  authorAvatar = avatarArr[0].thumbnail_full_path || avatarArr[0].large_thumbnail_full_path || authorAvatar;
                }
              }
            }
          }
        }
      } catch (e) {}
    }
    this.authorName.textContent = authorName;
    this.authorAvatar.src = authorAvatar;
    // 审核期间隐藏作者头像容器
    if (shenhe === '1') {
      var authorInfo = document.getElementById('content-detail-author');
      if (authorInfo) authorInfo.style.display = 'none';
    }

    // 主图
    this.cover.innerHTML = '';
    if (data.zhutu) {
      var imgUrl = FsjApi.parseImage ? FsjApi.parseImage(data.zhutu) : '';
      if (imgUrl) {
        var img = document.createElement('img');
        img.src = imgUrl;
        img.alt = data.title || data.mingcheng || '';
        this.cover.appendChild(img);
      }
    }

    // 标题
    this.title.textContent = data.title || data.mingcheng || '';

    // 正文内容：优先解析 wznr 的 JSON 结构做 UI 渲染，否则降级为 markdown/纯文本
    this.renderBody(data);

    // 显示内容区域
    this.body.style.display = '';
  },

  // ========== 正文渲染（Markdown 为主 · v2.2.3 起废弃 12维 JSON） ==========

  /**
   * 渲染正文：
   * - wznr 以 { 开头且解析出 blocks（旧 12维 JSON）→ 降级提取文字/图片，保证老文章可读
   * - 否则一律按 Markdown 渲染（marked CDN，支持标题/列表/表格/图片 ![](url)）
   */
  renderBody: function (data) {
    var bodyEl = this.bodyText;
    bodyEl.innerHTML = '';
    var wznr = data.wznr || '';
    var content = wznr || data.mdnr || data.neirong || '';

    // 旧 12维 JSON 降级（只读兼容，不做层级 UI）
    if (content && content.replace(/^\s+/, '').charAt(0) === '{') {
      try {
        var obj = JSON.parse(content);
        if (obj && Array.isArray(obj.blocks)) {
          var legacyFrag = this.extractLegacyBlocks(obj.blocks);
          if (legacyFrag.childNodes.length > 0) {
            bodyEl.appendChild(legacyFrag);
            return;
          }
          bodyEl.textContent = '暂无内容';
          return;
        }
      } catch (e) { /* 非法 JSON，走 md */ }
    }

    // Markdown / 纯文本
    if (content && window.marked) {
      bodyEl.innerHTML = marked.parse(content);
    } else {
      bodyEl.textContent = content || '暂无内容';
    }
  },

  /** 旧 12维 JSON blocks → 可读 DOM（提取文字段落和图片，递归） */
  extractLegacyBlocks: function (blocks) {
    var self = this;
    var frag = document.createDocumentFragment();
    (blocks || []).forEach(function (b) {
      if (!b) return;
      if (b.type === 'text' && (b.content || '').replace(/^\s+|\s+$/g, '')) {
        var p = document.createElement('p');
        p.textContent = b.content;
        frag.appendChild(p);
      } else if (b.type === 'image' && b.urls && b.urls.length) {
        var wrap = document.createElement('div');
        wrap.className = 'detail-img-wrap';
        b.urls.forEach(function (u) {
          var img = document.createElement('img');
          img.src = u;
          wrap.appendChild(img);
        });
        frag.appendChild(wrap);
      } else if (b.type === 'sew-node') {
        var sub = self.extractLegacyBlocks(b.children);
        if (sub.childNodes.length) frag.appendChild(sub);
      }
    });
    return frag;
  },

  // ========== 评论功能 ==========

  /**
   * 加载评论列表
   */
  loadComments: function () {
    var self = this;
    if (this.commentLoading) return;
    this.commentLoading = true;

    // 缓存优先（2026-09-05）：第一页先渲染缓存秒开
    if (this.commentPage === 1 && FsjApi.listCache) {
      var commentCache = FsjApi.listCache.get('comments_' + this.contentRowid);
      if (commentCache) {
        this.comments = commentCache.rows;
        this.renderComments();
      }
    }

    FsjApi.getComments(this.contentRowid, this.commentPage, 10)
      .then(function (res) {
        var rows = [];
        if (res && res.data && res.data.rows) rows = res.data.rows;
        else if (res && res.rows) rows = res.rows;

        console.log('[ContentDetail] 评论加载: 第' + self.commentPage + '页, 返回' + rows.length + '条');

        self.comments = self.comments.concat(rows);
        self.commentPage++;
        self.commentHasMore = rows.length >= 10;

        if (self.commentPage === 2 && FsjApi.listCache) FsjApi.listCache.set('comments_' + self.contentRowid, self.comments.slice(0, 50));
        self.renderComments();
        self.commentLoading = false;
      })
      .catch(function (err) {
        console.error('[ContentDetail] 评论加载失败:', err);
        self.commentLoading = false;
      });
  },

  /**
   * 加载更多评论
   */
  loadMoreComments: function () {
    if (!this.commentHasMore || this.commentLoading) return;
    this.loadComments();
  },

  /**
   * 渲染评论列表
   */
  renderComments: function () {
    var self = this;
    var list = this.commentList;
    if (!list) return;

    // 更新评论数
    if (this.commentCount) {
      this.commentCount.textContent = this.comments.length + ' 条评论';
    }

    if (this.comments.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:30px 0;color:#999;font-size:13px;">暂无评论，来说两句吧</div>';
      if (this.commentLoadMore) this.commentLoadMore.style.display = 'none';
      return;
    }

    // 构建评论 HTML（两级嵌套）
    var topLevelComments = [];
    var replyMap = {};

    this.comments.forEach(function (c) {
      // 判断是一级评论还是回复
      // parent 字段（原 fu）：一级评论为 "[]" 或空，回复评论填被回复评论的 rowid
      var fu = c.parent || c.fu || '';
      var fuSid = '';
      if (fu) {
        try {
          var fpArr = typeof fu === 'string' ? JSON.parse(fu) : fu;
          if (Array.isArray(fpArr) && fpArr.length > 0) {
            fuSid = fpArr[0].sid || '';
          } else if (typeof fu === 'string' && fu !== '[]') {
            // 非数组格式的字符串（直接是 rowid）
            fuSid = fu;
          }
          // 空数组 "[]" → fuSid 保持为空，视为一级评论
        } catch (e) {
          fuSid = fu;
        }
      }

      if (fuSid) {
        // 这是一条回复，fuSid 指向被回复的评论 rowid
        if (!replyMap[fuSid]) replyMap[fuSid] = [];
        replyMap[fuSid].push(c);
      } else {
        // 一级评论
        topLevelComments.push(c);
      }
    });

    var html = topLevelComments.map(function (comment) {
      return self._renderCommentItem(comment, replyMap[comment.rowid] || [], false);
    }).join('');

    list.innerHTML = html;

    // 绑定回复按钮
    list.querySelectorAll('.comment-reply-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var rowid = btn.getAttribute('data-rowid');
        var authorName = btn.getAttribute('data-author');
        var authorRowid = btn.getAttribute('data-author-rowid');
        self.startReply(rowid, authorName, authorRowid);
      });
    });

    // 控制加载更多按钮
    if (this.commentLoadMore) {
      this.commentLoadMore.style.display = this.commentHasMore ? '' : 'none';
    }
  },

  /**
   * 解析 hfyh 字段，获取被回复用户的 rowid
   * hfyh 格式: [{"sid": "用户rowid", "name": "昵称"}]
   */
  _getHfyhRowid: function (comment) {
    if (!comment.hfyh) return '';
    try {
      var arr = typeof comment.hfyh === 'string' ? JSON.parse(comment.hfyh) : comment.hfyh;
      if (Array.isArray(arr) && arr.length > 0) {
        return arr[0].sid || '';
      }
    } catch (e) {}
    return '';
  },

  /**
   * 解析 hfyh 字段，获取被回复用户的昵称
   */
  _getHfyhName: function (comment) {
    if (!comment.hfyh) return '';
    try {
      var arr = typeof comment.hfyh === 'string' ? JSON.parse(comment.hfyh) : comment.hfyh;
      if (Array.isArray(arr) && arr.length > 0) {
        return arr[0].name || arr[0].mingcheng || '';
      }
    } catch (e) {}
    return '';
  },

  /**
   * 渲染单条评论
   * @param {Object} comment - 评论数据
   * @param {Array} replies - 回复列表
   * @param {boolean} isReply - 是否为二级回复
   * @param {string} parentCommentRowid - 所属一级评论的 rowid（仅二级评论需要）
   */
  _renderCommentItem: function (comment, replies, isReply, parentCommentRowid) {
    var authorName = this._getCommentAuthorName(comment);
    var authorRowid = this._getCommentAuthorRowid(comment);
    var authorAvatar = this._getCommentAuthorAvatar(comment);
    var text = comment.title || comment.mingcheng || '';
    var time = this._formatCommentTime(comment);

    var itemClass = 'comment-item' + (isReply ? ' reply-item' : '');

    // 二级评论：作者名右边显示"▶ 被回复者"
    var replyHint = '';
    if (isReply) {
      var replyToName = this._getHfyhName(comment);
      if (replyToName) {
        replyHint = ' <img class="reply-arrow-icon" src="assets/you.png" alt="" /> <span class="reply-mention">' + this._escapeHtml(replyToName) + '</span>';
      }
    }

    var repliesHtml = '';
    if (replies.length > 0) {
      repliesHtml = replies.map(function (r) {
        return this._renderCommentItem(r, [], true, comment.rowid);
      }.bind(this)).join('');
    }

    // 二级评论的回复按钮绑定一级评论的 rowid，确保回复时 fu 正确
    var replyBtnRowid = isReply ? parentCommentRowid : comment.rowid;

    return '<div class="' + itemClass + '">' +
      '<img class="comment-avatar" src="' + authorAvatar + '" alt="" />' +
      '<div class="comment-body">' +
        '<div class="comment-author">' + authorName + replyHint + '</div>' +
        '<div class="comment-text">' + this._escapeHtml(text) + '</div>' +
        '<div class="comment-meta">' +
          '<span class="comment-time">' + time + '</span>' +
          '<span class="comment-reply-btn" data-rowid="' + replyBtnRowid + '" data-author="' + authorName + '" data-author-rowid="' + authorRowid + '">回复</span>' +
        '</div>' +
      '</div>' +
    '</div>' + repliesHtml;
  },

  /**
   * 获取评论作者名称
   */
  _getCommentAuthorName: function (comment) {
    if (!comment.fabuzhe) return '匿名用户';
    try {
      var user = typeof comment.fabuzhe === 'string' ? JSON.parse(comment.fabuzhe) : comment.fabuzhe;
      if (Array.isArray(user) && user.length > 0) {
        return user[0].name || user[0].mingcheng || '匿名用户';
      }
    } catch (e) {}
    return '匿名用户';
  },

  /**
   * 获取评论作者 rowid
   */
  _getCommentAuthorRowid: function (comment) {
    if (!comment.fabuzhe) return '';
    try {
      var user = typeof comment.fabuzhe === 'string' ? JSON.parse(comment.fabuzhe) : comment.fabuzhe;
      if (Array.isArray(user) && user.length > 0) {
        return user[0].sid || '';
      }
    } catch (e) {}
    return '';
  },

  /**
   * 获取评论作者头像
   */
  _getCommentAuthorAvatar: function (comment) {
    // 审核期间不显示用户头像
    var shenhe = localStorage.getItem('fsj_shenhe') || '';
    if (shenhe === '1') return 'assets/logo.png';

    if (!comment.fabuzhe) return 'assets/logo.png';
    try {
      var user = typeof comment.fabuzhe === 'string' ? JSON.parse(comment.fabuzhe) : comment.fabuzhe;
      if (Array.isArray(user) && user.length > 0) {
        // 头像在 sourcevalue 里的字段 69ad979f6a3532cabd764603
        var sourcevalue = user[0].sourcevalue;
        if (sourcevalue) {
          var sv = typeof sourcevalue === 'string' ? JSON.parse(sourcevalue) : sourcevalue;
          var avatarField = sv['69ad979f6a3532cabd764603'];
          if (avatarField) {
            var avatarArr = typeof avatarField === 'string' ? JSON.parse(avatarField) : avatarField;
            if (Array.isArray(avatarArr) && avatarArr.length > 0) {
              return avatarArr[0].thumbnail_full_path || avatarArr[0].large_thumbnail_full_path || 'assets/logo.png';
            }
          }
        }
      }
    } catch (e) {}
    return 'assets/logo.png';
  },

  /**
   * 格式化评论时间
   */
  _formatCommentTime: function (comment) {
    if (!comment.ctime) return '';
    var d = new Date(comment.ctime.replace(/-/g, '/'));
    if (isNaN(d.getTime())) return '';
    var now = Date.now();
    var diff = now - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 86400000 * 7) return Math.floor(diff / 86400000) + '天前';
    return (d.getMonth() + 1) + '-' + d.getDate();
  },

  /**
   * 开始回复
   * @param {string} commentRowid - 一级评论的 rowid（回复按钮传递的始终是一级评论 rowid）
   * @param {string} authorName - 被回复者的昵称
   * @param {string} authorRowid - 被回复者的 rowid（hfyh）
   */
  startReply: function (commentRowid, authorName, authorRowid) {
    this.replyTo = { rowid: commentRowid, authorName: authorName, authorRowid: authorRowid };
    this.commentTextarea.placeholder = '回复 ' + authorName + '：';
    this.commentTextarea.focus();
    if (this.commentReplyCancel) this.commentReplyCancel.style.display = '';
  },

  /**
   * 取消回复
   */
  cancelReply: function () {
    this.clearReplyState();
  },

  /**
   * 清除回复状态
   */
  clearReplyState: function () {
    this.replyTo = null;
    if (this.commentTextarea) {
      this.commentTextarea.value = '';
      this.commentTextarea.placeholder = '写下你的想法...';
    }
    if (this.commentReplyCancel) this.commentReplyCancel.style.display = 'none';
  },

  /**
   * 发表评论
   */
  submitComment: function () {
    var self = this;
    var text = this.commentTextarea.value.trim();
    if (!text) {
      alert('请输入评论内容');
      return;
    }

    // 检查登录状态
    var openid = localStorage.getItem('fsj_openid') || '';
    if (!openid) {
      alert('请先登录后再评论');
      return;
    }

    this.commentSubmitBtn.disabled = true;
    this.commentSubmitBtn.textContent = '发表中...';

    var parentCommentRowid = this.replyTo ? this.replyTo.rowid : null;
    var parentCommentAuthorRowid = this.replyTo ? this.replyTo.authorRowid : null;

    FsjApi.createComment(this.contentRowid, text, parentCommentRowid, parentCommentAuthorRowid)
      .then(function () {
        // 发表成功，清空输入框
        self.clearReplyState();
        // 重新加载第一页评论
        self.comments = [];
        self.commentPage = 1;
        self.commentHasMore = true;
        self.loadComments();
      })
      .catch(function (err) {
        console.error('[ContentDetail] 评论发表失败:', err);
        alert('发表失败: ' + err.message);
      })
      .finally(function () {
        self.commentSubmitBtn.disabled = false;
        self.commentSubmitBtn.textContent = '发表';
      });
  },

  /**
   * HTML 转义
   */
  _escapeHtml: function (text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // ========== 状态管理 ==========

  _back: function () {
    if (window.App) {
      var prevPage = localStorage.getItem('fsj_prev_page') || 'home';
      App.switchPage(prevPage);
    }
  },

  showLoading: function () {
    if (this.loadingState) this.loadingState.style.display = '';
    if (this.emptyState) this.emptyState.style.display = 'none';
    if (this.body) this.body.style.display = 'none';
  },

  hideLoading: function () {
    if (this.loadingState) this.loadingState.style.display = 'none';
  },

  showError: function (msg) {
    this.hideLoading();
    if (this.body) this.body.style.display = 'none';
    if (this.emptyState) {
      this.emptyState.querySelector('p').textContent = msg;
      this.emptyState.style.display = '';
    }
  }
};

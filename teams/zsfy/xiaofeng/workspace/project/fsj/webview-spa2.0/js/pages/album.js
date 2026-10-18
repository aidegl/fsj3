/**
 * 个人相册页面
 * 功能：展示用户个人相册图片，支持灯箱预览、滚动加载、多选批量删除
 * 数据来源：内容元数据表（shangpin worksheet），过滤 leixing='个人相册' + fabuzhe + shangjia2
 */
(function () {
  'use strict';

  var AlbumPage = {
    // 状态
    photos: [],
    pageIndex: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    // 灯箱状态
    lightboxIndex: -1,
    // 选择模式
    selectMode: false,
    selectedIds: {},

    // DOM
    backBtn: null,
    selectBtn: null,
    uploadBtn: null,
    uploadInput: null,
    grid: null,
    loadingState: null,
    emptyState: null,
    selectBar: null,
    selectCount: null,
    deleteBtn: null,

    init: function () {
      this.backBtn = document.getElementById('album-back-btn');
      this.selectBtn = document.getElementById('album-select-btn');
      this.uploadBtn = document.getElementById('album-upload-btn');
      this.grid = document.getElementById('album-grid');
      this.loadingState = document.getElementById('album-loading-state');
      this.emptyState = document.getElementById('album-empty-state');
      this.selectBar = document.getElementById('album-select-bar');
      this.selectCount = document.getElementById('album-select-count');
      this.deleteBtn = document.getElementById('album-delete-btn');

      console.log('[Album] init, 上传按钮元素:', this.uploadBtn);

      this.bindEvents();
      this.bindLoginChange();
      this.loadPhotos();
    },

    bindEvents: function () {
      var self = this;

      // 返回按钮
      if (this.backBtn) {
        this.backBtn.addEventListener('click', function () {
          if (self.selectMode) {
            self.exitSelectMode();
          } else {
            self._backToProfile();
          }
        });
      }

      // 选择按钮
      if (this.selectBtn) {
        this.selectBtn.addEventListener('click', function () {
          if (self.selectMode) {
            self.exitSelectMode();
          } else {
            self.enterSelectMode();
          }
        });
      }

      // 底部上传按钮
      if (this.uploadBtn) {
        this.uploadBtn.addEventListener('click', function () {
          console.log('[Album] 上传按钮被点击');
          self._chooseAndUploadImage();
        });
      }

      // 删除按钮
      if (this.deleteBtn) {
        this.deleteBtn.addEventListener('click', function () {
          self._batchDelete();
        });
      }

      // 滚动加载更多
      if (this.grid) {
        this.grid.addEventListener('scroll', function () {
          self.onScroll();
        });
      }
    },

    /**
     * 监听登录状态变化，重新加载相册
     */
    bindLoginChange: function () {
      var self = this;
      window.addEventListener('wechatlogin:change', function (e) {
        var detail = e.detail;
        if (detail.type === 'login' || detail.type === 'restore' || detail.type === 'logout') {
          self.pageIndex = 1;
          self.photos = [];
          self.hasMore = true;
          self.exitSelectMode();
          self.loadPhotos();
        }
      });
    },

    /**
     * 进入选择模式
     */
    enterSelectMode: function () {
      this.selectMode = true;
      this.selectedIds = {};
      this.grid.classList.add('album-select-mode');
      this.selectBtn.textContent = '取消';
      this.selectBar.style.display = '';
      this.updateSelectCount();
      this._renderCheckboxOverlay();
    },

    /**
     * 退出选择模式
     */
    exitSelectMode: function () {
      this.selectMode = false;
      this.selectedIds = {};
      this.grid.classList.remove('album-select-mode');
      this.selectBtn.textContent = '选择';
      this.selectBar.style.display = 'none';
      this._removeCheckboxOverlay();
    },

    /**
     * 更新选中数量
     */
    updateSelectCount: function () {
      var count = Object.keys(this.selectedIds).length;
      if (this.selectCount) {
        this.selectCount.textContent = '已选 ' + count + ' 张';
      }
      if (this.deleteBtn) {
        this.deleteBtn.disabled = count === 0;
      }
    },

    /**
     * 切换选中状态
     */
    toggleSelect: function (id, checkbox) {
      if (this.selectedIds[id]) {
        delete this.selectedIds[id];
        checkbox.classList.remove('selected');
      } else {
        this.selectedIds[id] = true;
        checkbox.classList.add('selected');
      }
      this.updateSelectCount();
    },

    /**
     * 渲染复选框
     */
    _renderCheckboxOverlay: function () {
      var self = this;
      var items = this.grid.querySelectorAll('.album-item');
      items.forEach(function (item) {
        var id = item.getAttribute('data-id');
        if (!id) return;

        // 避免重复添加
        if (item.querySelector('.album-item-checkbox')) return;

        var checkbox = document.createElement('div');
        checkbox.className = 'album-item-checkbox';
        checkbox.setAttribute('data-id', id);

        var overlay = document.createElement('div');
        overlay.className = 'album-item-overlay';

        checkbox.addEventListener('click', function (e) {
          e.stopPropagation();
          e.preventDefault();
          self.toggleSelect(id, checkbox);
        });

        item.appendChild(checkbox);
        item.appendChild(overlay);
      });
    },

    /**
     * 移除复选框
     */
    _removeCheckboxOverlay: function () {
      var items = this.grid.querySelectorAll('.album-item');
      items.forEach(function (item) {
        var checkbox = item.querySelector('.album-item-checkbox');
        var overlay = item.querySelector('.album-item-overlay');
        if (checkbox) checkbox.remove();
        if (overlay) overlay.remove();
      });
    },

    /**
     * 加载相册数据
     */
    loadPhotos: function () {
      var self = this;
      if (this.loading) return;

      // 未登录时直接显示空状态
      var token = localStorage.getItem('fsj_token');
      if (!token) {
        this.renderPhotos([]);
        return;
      }

      this.loading = true;
      if (this.pageIndex > 1) {
        this.showLoadingMore();
      } else {
        this.showLoading();
      }

      // 缓存优先（2026-09-05）：第一页先渲染缓存秒开
      if (this.pageIndex === 1 && FsjApi.listCache) {
        var albumCache = FsjApi.listCache.get('album_' + FsjApi.getShangjiaRowid());
        if (albumCache) {
          this.photos = albumCache.rows;
          this.renderPhotos();
          this.hideLoading();
        }
      }

      FsjApi.getAlbumList(this.pageIndex, this.pageSize)
        .then(function (res) {
          if (!res.success || !res.data) {
            self.showError('加载失败');
            return;
          }

          var rows = res.data.rows || [];
          var total = res.data.totalCount || res.data.total || 0;

          var newPhotos = rows.map(function (row) {
            return FsjApi.mapAlbumItem(row);
          });

          // 过滤掉没有图片的项
          newPhotos = newPhotos.filter(function (p) { return p.imageUrl; });

          var allPhotos = self.pageIndex === 1
            ? newPhotos
            : self.photos.concat(newPhotos);

          self.photos = allPhotos;
          self.hasMore = allPhotos.length < total;

          if (self.pageIndex === 1 && FsjApi.listCache) FsjApi.listCache.set('album_' + FsjApi.getShangjiaRowid(), self.photos);
          self.renderPhotos();
          self.hideLoading();

          if (!self.hasMore && self.photos.length > 0) {
            self.showNoMore();
          }
        })
        .catch(function (err) {
          console.error('[Album] 加载相册失败:', err);
          self.showError('加载失败: ' + err.message);
        })
        .finally(function () {
          self.loading = false;
        });
    },

    /**
     * 渲染相册列表
     */
    renderPhotos: function () {
      var self = this;

      if (this.photos.length === 0) {
        this.grid.innerHTML = '';
        this.grid.appendChild(this.loadingState);
        this.grid.appendChild(this.emptyState);
        this.emptyState.style.display = '';
        if (this.loadingState) this.loadingState.style.display = 'none';
        return;
      }

      this.emptyState.style.display = 'none';

      var html = this.photos.map(function (photo, index) {
        return '<div class="album-item" data-id="' + photo.id + '" data-index="' + index + '">' +
          '<img src="' + photo.imageUrl + '" alt="' + (photo.name || '') + '" loading="lazy" />' +
        '</div>';
      }).join('');

      // 保留 loading/empty 占位元素
      this.grid.innerHTML = html;
      this.grid.appendChild(this.loadingState);
      this.grid.appendChild(this.emptyState);

      // 绑定点击事件（灯箱预览 / 选择模式切换）
      this.grid.querySelectorAll('.album-item').forEach(function (item) {
        item.addEventListener('click', function () {
          if (self.selectMode) {
            var id = item.getAttribute('data-id');
            var checkbox = item.querySelector('.album-item-checkbox');
            if (checkbox) self.toggleSelect(id, checkbox);
          } else {
            var idx = parseInt(item.getAttribute('data-index'));
            self.openLightbox(idx);
          }
        });
      });

      // 如果在选择模式，重新渲染复选框
      if (this.selectMode) {
        this._renderCheckboxOverlay();
        // 恢复已选状态
        this.grid.querySelectorAll('.album-item-checkbox').forEach(function (cb) {
          var id = cb.getAttribute('data-id');
          if (self.selectedIds[id]) cb.classList.add('selected');
        });
      }
    },

    /**
     * 灯箱预览
     */
    openLightbox: function (index) {
      if (index < 0 || index >= this.photos.length) return;
      this.lightboxIndex = index;

      var existing = document.getElementById('album-lightbox');
      if (existing) existing.remove();

      var photo = this.photos[index];
      var lightbox = document.createElement('div');
      lightbox.id = 'album-lightbox';
      lightbox.className = 'album-lightbox';
      lightbox.innerHTML =
        '<div class="album-lightbox-overlay"></div>' +
        '<div class="album-lightbox-content">' +
          '<img class="album-lightbox-img" src="' + photo.imageUrl + '" alt="' + (photo.name || '') + '" />' +
          (photo.name ? '<div class="album-lightbox-title">' + photo.name + '</div>' : '') +
        '</div>' +
        '<span class="album-lightbox-close" id="lightbox-close">&#10005;</span>' +
        '<span class="album-lightbox-nav album-lightbox-prev" id="lightbox-prev">&#8249;</span>' +
        '<span class="album-lightbox-nav album-lightbox-next" id="lightbox-next">&#8250;</span>';

      document.body.appendChild(lightbox);

      var self = this;

      // 点击遮罩关闭
      lightbox.querySelector('.album-lightbox-overlay').addEventListener('click', function () {
        self.closeLightbox();
      });

      // 关闭按钮
      document.getElementById('lightbox-close').addEventListener('click', function () {
        self.closeLightbox();
      });

      // 上一张
      document.getElementById('lightbox-prev').addEventListener('click', function (e) {
        e.stopPropagation();
        self.navigateLightbox(-1);
      });

      // 下一张
      document.getElementById('lightbox-next').addEventListener('click', function (e) {
        e.stopPropagation();
        self.navigateLightbox(1);
      });

      // 点击内容区不关闭
      lightbox.querySelector('.album-lightbox-content').addEventListener('click', function (e) {
        e.stopPropagation();
      });
    },

    /**
     * 灯箱导航
     */
    navigateLightbox: function (direction) {
      var newIndex = this.lightboxIndex + direction;
      if (newIndex < 0) newIndex = 0;
      if (newIndex >= this.photos.length) newIndex = this.photos.length - 1;
      if (newIndex === this.lightboxIndex) return;

      this.lightboxIndex = newIndex;
      var photo = this.photos[newIndex];
      var img = document.querySelector('.album-lightbox-img');
      var title = document.querySelector('.album-lightbox-title');
      if (img) img.src = photo.imageUrl;
      if (title) {
        title.textContent = photo.name || '';
        title.style.display = photo.name ? '' : 'none';
      }
    },

    /**
     * 关闭灯箱
     */
    closeLightbox: function () {
      var lightbox = document.getElementById('album-lightbox');
      if (lightbox) lightbox.remove();
      this.lightboxIndex = -1;
    },

    /**
     * 选择并上传图片
     */
    _chooseAndUploadImage: function () {
      var self = this;

      // 检查登录状态
      var token = localStorage.getItem('fsj_token');
      if (!token) {
        alert('请先登录');
        return;
      }

      // 检查商家配置
      var shangjiaRowid = FsjApi.getShangjiaRowid();
      if (!shangjiaRowid) {
        alert('商家配置未加载，请刷新页面');
        return;
      }

      // 创建隐藏 file input，支持多选
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.style.display = 'none';
      document.body.appendChild(input);

      input.onchange = function (e) {
        var files = Array.prototype.slice.call(e.target.files);
        document.body.removeChild(input);

        if (files.length === 0) return;

        console.log('[Album] 选择了', files.length, '个文件');

        // 预览确认
        var names = files.map(function (f) { return f.name + ' (' + (f.size / 1024).toFixed(1) + ' KB)'; }).join('\n');
        if (!confirm('已选择 ' + files.length + ' 张图片：\n' + names + '\n\n确认上传？')) return;

        // 先读取图片预览，然后调用 API 创建
        self._uploadFiles(files);
      };

      input.click();
    },

    /**
     * 上传文件到明道云
     */
    _uploadFiles: function (files) {
      var self = this;
      var total = files.length;
      var completed = 0;
      var failed = 0;

      console.log('[Album] 开始上传', total, '张图片');

      // 逐个上传
      function uploadNext(index) {
        if (index >= total) {
          // 全部完成
          self.pageIndex = 1;
          self.photos = [];
          self.hasMore = true;
          self.loadPhotos();
          if (failed > 0) {
            alert('上传完成：成功 ' + (total - failed) + ' 张，失败 ' + failed + ' 张');
          } else {
            alert('上传成功：' + total + ' 张图片');
          }
          return;
        }

        var file = files[index];
        console.log('[Album] 上传第', index + 1, '张:', file.name);

        // 步骤1：上传到临时文件服务器
        FsjApi.uploadImageToTemp(file)
          .then(function (result) {
            // 步骤2：通过 Mingdao addRow 创建相册条目（传 URL，Mingdao 自动下载）
            return FsjApi.createAlbumItem(result.url, '');
          })
          .then(function (rowid) {
            console.log('[Album] 第', index + 1, '张上传成功, rowid:', rowid);
            completed++;
            uploadNext(index + 1);
          })
          .catch(function (err) {
            console.error('[Album] 第', index + 1, '张上传失败:', err);
            failed++;
            completed++;
            uploadNext(index + 1);
          });
      }

      uploadNext(0);
    },

    /**
     * 批量删除选中照片
     */
    _batchDelete: function () {
      var self = this;
      var selectedIds = Object.keys(this.selectedIds);

      if (selectedIds.length === 0) {
        alert('请先选择要删除的照片');
        return;
      }

      if (!confirm('确定要删除选中的 ' + selectedIds.length + ' 张照片吗？')) {
        return;
      }

      console.log('[Album] 批量删除，rowids:', selectedIds);

      FsjApi.deleteAlbumItems(selectedIds)
        .then(function () {
          // 从本地列表中移除
          self.photos = self.photos.filter(function (p) {
            return !selectedIds.includes(p.id);
          });
          self.exitSelectMode();
          self.renderPhotos();
          alert('已删除 ' + selectedIds.length + ' 张照片');
        })
        .catch(function (err) {
          console.error('[Album] 批量删除失败:', err);
          alert('删除失败: ' + err.message);
        });
    },

    /**
     * 滚动事件：到达底部加载更多
     */
    onScroll: function () {
      if (!this.hasMore || this.loading) return;
      var el = this.grid;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
        this.pageIndex++;
        this.loadPhotos();
      }
    },

    showLoading: function () {
      this.loadingState.innerHTML = '<div class="loading-spinner"></div><p>加载中...</p>';
      this.loadingState.style.display = '';
    },

    showLoadingMore: function () {
      this.loadingState.innerHTML = '<div class="loading-spinner"></div><p>加载更多...</p>';
      this.loadingState.style.display = '';
    },

    hideLoading: function () {
      if (this.loadingState) {
        this.loadingState.style.display = 'none';
      }
    },

    showNoMore: function () {
      this.loadingState.innerHTML = '<p style="color:#999;font-size:12px;">— 没有更多了 —</p>';
      this.loadingState.style.display = '';
    },

    showError: function (msg) {
      this.hideLoading();
      this.emptyState.innerHTML = '<p>' + msg + '</p>';
      this.emptyState.style.display = '';
    },

    _backToProfile: function () {
      // 先关闭可能存在的灯箱
      this.closeLightbox();
      if (window.App) {
        window.App.switchPage('profile');
      }
    }
  };

  window.AlbumPage = AlbumPage;
})();

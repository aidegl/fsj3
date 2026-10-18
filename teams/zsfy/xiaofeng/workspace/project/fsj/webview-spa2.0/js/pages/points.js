/**
 * 积分商城页面
 * 功能：积分商品列表、搜索、积分兑换
 */
var PointsPage = {
  // 状态
  searchKeyword: '',
  products: [],
  pageIndex: 1,
  pageSize: 10,
  hasMore: true,
  loading: false,
  searchTimer: null,
  userPoints: 0,

  // DOM
  backBtn: null,
  searchInput: null,
  searchClear: null,
  pointsBalance: null,
  productList: null,
  loadingState: null,
  emptyState: null,

  init: function () {
    this.backBtn = document.getElementById('points-back-btn');
    this.searchInput = document.getElementById('points-search-input');
    this.searchClear = document.getElementById('points-search-clear');
    this.pointsBalance = document.getElementById('points-balance');
    this.productList = document.getElementById('points-product-list');
    this.loadingState = document.getElementById('points-loading-state');
    this.emptyState = document.getElementById('points-empty-state');

    this.bindEvents();
    this.loadUserPoints();
    this.loadProducts();
  },

  bindEvents: function () {
    var self = this;

    // 返回按钮
    if (this.backBtn) {
      this.backBtn.addEventListener('click', function () {
        self._backToProfile();
      });
    }

    // 监听登录/登出事件，自动更新积分显示
    window.addEventListener('wechatlogin:change', function (e) {
      var detail = e.detail;
      if (detail.type === 'login') {
        self.loadUserPoints();
      } else if (detail.type === 'logout') {
        self.userPoints = 0;
        if (self.pointsBalance) self.pointsBalance.textContent = '0 积分';
      }
    });

    // 搜索输入（防抖）
    if (this.searchInput) {
      this.searchInput.addEventListener('input', function (e) {
        self.onSearchInput(e.target.value);
      });
    }

    // 清除搜索
    if (this.searchClear) {
      this.searchClear.addEventListener('click', function () {
        self.clearSearch();
      });
    }

    // 滚动加载更多
    if (this.productList) {
      this.productList.addEventListener('scroll', function () {
        self.onScroll();
      });
    }
  },

  /**
   * 加载用户积分
   */
  loadUserPoints: function () {
    var userData = this._getUserData();
    this.userPoints = userData.jifen || 0;

    if (this.pointsBalance) {
      this.pointsBalance.textContent = this.userPoints + ' 积分';
    }
  },

  /**
   * 获取用户数据（与 profile.js 一致）
   */
  _getUserData: function () {
    try {
      var info = localStorage.getItem('fsj_user_info');
      if (info) {
        var parsed = JSON.parse(info);
        if (parsed && parsed.raw) return parsed.raw;
        return parsed;
      }
      var data = localStorage.getItem('userData');
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  /**
   * 格式化倒计时：根据 ptrq 返回 "X天X时X分" 或空字符串
   */
  _formatCountdown: function (ptrq) {
    if (!ptrq) return '';
    var target = new Date(ptrq.replace(/-/g, '/'));
    if (isNaN(target.getTime())) return '';
    var diff = target.getTime() - Date.now();
    if (diff <= 0) return '已过期';
    var days = Math.floor(diff / 86400000);
    diff -= days * 86400000;
    var hours = Math.floor(diff / 3600000);
    diff -= hours * 3600000;
    var mins = Math.floor(diff / 60000);
    return days + '天' + hours + '时' + mins + '分';
  },

  /**
   * 搜索输入（防抖 500ms）
   */
  onSearchInput: function (keyword) {
    keyword = keyword.trim();
    this.searchKeyword = keyword;
    if (this.searchClear) {
      this.searchClear.style.display = keyword ? '' : 'none';
    }

    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(function () {
      this.searchProducts();
    }.bind(this), 500);
  },

  /**
   * 执行搜索
   */
  searchProducts: function () {
    this.pageIndex = 1;
    this.products = [];
    this.hasMore = true;
    this.loadProducts();
  },

  /**
   * 清除搜索
   */
  clearSearch: function () {
    this.searchInput.value = '';
    this.searchKeyword = '';
    this.searchClear.style.display = 'none';
    this.searchProducts();
  },

  /**
   * 滚动事件：到达底部加载更多
   */
  onScroll: function () {
    if (!this.hasMore || this.loading) return;
    var el = this.productList;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      this.pageIndex++;
      this.loadProducts();
    }
  },

  /**
   * 加载商品
   */
  loadProducts: function () {
    var self = this;
    if (this.loading) return;

    this.loading = true;
    if (this.pageIndex > 1) {
      this.showLoadingMore();
    } else {
      this.showLoading();
    }

      // 缓存优先（2026-09-05）：第一页先渲染缓存秒开
      if (this.pageIndex === 1 && FsjApi.listCache) {
        var pointsCache = FsjApi.listCache.get('points_' + (this.searchKeyword || 'all') + '_' + FsjApi.getShangjiaRowid());
        if (pointsCache) {
          this.products = pointsCache.rows;
          this.renderProducts();
          this.hideLoading();
        }
      }

    FsjApi.getPointsProductList(this.pageIndex, this.pageSize, this.searchKeyword)
      .then(function (res) {
        if (!res.success || !res.data) {
          self.showError('加载失败');
          return;
        }

        var rows = res.data.rows || [];
        var total = res.data.totalCount || res.data.total || 0;

        var newProducts = rows.map(function (row) {
          return FsjApi.mapProduct(row);
        });

        var allProducts = self.pageIndex === 1
          ? newProducts
          : self.products.concat(newProducts);

        self.products = allProducts;
        self.hasMore = allProducts.length < total;

        if (self.pageIndex === 1 && FsjApi.listCache) FsjApi.listCache.set('points_' + (self.searchKeyword || 'all') + '_' + FsjApi.getShangjiaRowid(), self.products);
        self.renderProducts();
        self.hideLoading();

        if (!self.hasMore && self.products.length > 0) {
          self.showNoMore();
        }
      })
      .catch(function (err) {
        console.error('[积分商城] 加载商品失败:', err);
        self.showError('加载失败: ' + err.message);
      })
      .finally(function () {
        self.loading = false;
      });
  },

  /**
   * 渲染商品列表
   */
  renderProducts: function () {
    var self = this;
    var grid = this.productList.querySelector('.product-grid');

    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'product-grid';
      this.productList.insertBefore(grid, this.loadingState);
    }

    if (this.products.length === 0) {
      grid.style.display = 'none';
      this.emptyState.style.display = '';
      return;
    }

    this.emptyState.style.display = 'none';
    grid.style.display = '';

    grid.innerHTML = this.products.map(function (product) {
      var imgHtml = product.imageUrl
        ? '<img src="' + product.imageUrl + '" alt="' + product.name + '" />'
        : '<span class="placeholder">📦</span>';

      var hasGroup = product.ptxz > 0;
      var groupFull = hasGroup && product.ptyh >= product.ptxz;
      var canExchange = self.userPoints >= product.boxPrice && !groupFull;
      var groupProgress = hasGroup ? product.ptyh + '/' + product.ptxz : '';
      var countdown = self._formatCountdown(product.ptrq);

      return '<div class="product-card" data-id="' + product.id + '">' +
        '<div class="product-image-wrap">' +
          imgHtml +
          (countdown ? '<span class="group-countdown">' + countdown + '</span>' : '') +
          '<button class="product-add-btn points-btn" data-id="' + product.id + '"' +
          (canExchange ? '' : ' disabled') + '>兑换</button>' +
        '</div>' +
        '<div class="product-info">' +
          '<div class="product-name">' + product.name + '</div>' +
          '<div class="product-price-row">' +
            '<span class="price-original">¥' + product.price.toFixed(1) + '</span>' +
            (hasGroup ? '<span class="group-progress">' + groupProgress + '</span>' : '') +
            '<span class="price-points">' + product.boxPrice + ' 积分</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    // 绑定兑换按钮
    var btns = grid.querySelectorAll('.points-btn:not([disabled])');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var pid = btn.getAttribute('data-id');
        self.exchangeProduct(pid);
      });
    });
  },

  /**
   * 兑换商品
   */
  exchangeProduct: function (productId) {
    var product = this.products.find(function (p) { return p.id === productId; });
    if (!product) return;

    if (this.userPoints < product.boxPrice) {
      alert('积分不足，需要 ' + product.boxPrice + ' 积分');
      return;
    }

    if (product.ptxz > 0 && product.ptyh >= product.ptxz) {
      alert('拼团人数已满，无法兑换');
      return;
    }

    var self = this;
    if (confirm('确认使用 ' + product.boxPrice + ' 积分兑换 "' + product.name + '" 吗？')) {
      // 获取 openid 和用户 rowid
      var openid = localStorage.getItem('fsj_openid') || '';
      var shangjiaRowid = localStorage.getItem('fsj_shangjia_rowid') || FsjApi.getShangjiaRowid() || '';

      if (!openid) {
        alert('请先登录');
        return;
      }
      if (!shangjiaRowid) {
        alert('商家配置未加载，请刷新页面');
        return;
      }

      // 获取用户 rowid
      var userRowid = '';
      var storedInfo = localStorage.getItem('fsj_user_info');
      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }

      var getUserRowidPromise = userRowid ? Promise.resolve(userRowid) : FsjApi.getUserRowidByOpenid(openid);

      getUserRowidPromise.then(function (jueseRowid) {
        // 1. 创建订单主表
        return FsjApi.createOrder({
          shangjiaRowid: shangjiaRowid,
          jueseRowid: jueseRowid,
          zhuangtai: '已完成',
          fkfs: '积分兑换',
          yue: 0,
          jine: 0,
          jinfen: product.boxPrice
        }).then(function (orderRowid) {
          // 2. 创建订单明细
          var detailItems = [{
            productRowid: product.id,
            shuliang: 1,
            tejia: 0,
            shoujia: 0,
            goumaijia: 0,
            zhuangtai: '已完成',
            fkfs: '积分兑换'
          }];
          return FsjApi.createOrderDetails(orderRowid, jueseRowid, detailItems).then(function () {
            // 3. 扣减本地积分并刷新显示
            self.userPoints -= product.boxPrice;
            if (self.pointsBalance) {
              self.pointsBalance.textContent = self.userPoints + ' 积分';
            }
            try {
              var info = localStorage.getItem('fsj_user_info');
              if (info) {
                var parsed = JSON.parse(info);
                if (parsed.raw) parsed.raw.jifen = self.userPoints;
                localStorage.setItem('fsj_user_info', JSON.stringify(parsed));
              }
            } catch (e) {}

            self.renderProducts();
            alert('兑换成功！');
          });
        });
      }).catch(function (err) {
        console.error('[积分兑换] 创建订单失败:', err);
        alert('兑换失败: ' + err.message);
      });
    }
  },

  /**
   * 显示加载状态
   */
  showLoading: function () {
    this.loadingState.innerHTML = '<div class="loading-spinner"></div><p>加载中...</p>';
    this.loadingState.style.display = '';
  },

  showLoadingMore: function () {
    this.loadingState.innerHTML = '<div class="loading-spinner"></div><p>加载更多...</p>';
    this.loadingState.style.display = '';
  },

  hideLoading: function () {
    this.loadingState.style.display = 'none';
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
    if (window.App) {
      window.App.switchPage('profile');
    }
  }
};

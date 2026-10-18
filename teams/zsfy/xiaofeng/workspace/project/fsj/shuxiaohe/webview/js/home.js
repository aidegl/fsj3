/**
 * 同檐er 2.0 - 首页
 * 功能：商品列表、分类筛选、搜索、购物车
 */
(function () {
  'use strict';

  var categories = ['全部', '饮品', '零食', '主食', '日用品'];

  var HomePage = {
    // 状态
    currentCategory: 0,
    searchKeyword: '',
    products: [],
    cart: {},  // { productId: { info, quantity } }
    pageIndex: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    searchTimer: null,

    // DOM
    searchInput: null,
    searchClear: null,
    categoryNav: null,
    productList: null,
    loadingState: null,
    emptyState: null,
    cartBar: null,
    cartText: null,
    cartBtn: null,

    init: function () {
      this.searchInput = document.getElementById('search-input');
      this.searchClear = document.getElementById('search-clear');
      this.categoryNav = document.getElementById('category-nav');
      this.productList = document.getElementById('product-list');
      this.loadingState = document.getElementById('loading-state');
      this.emptyState = document.getElementById('empty-state');
      this.cartBar = document.getElementById('cart-bar');
      this.cartText = document.getElementById('cart-text');
      this.cartBtn = document.getElementById('cart-btn');

      this.bindEvents();
      this.loadProducts();
    },

    bindEvents: function () {
      var self = this;

      // 搜索输入（防抖）
      this.searchInput.addEventListener('input', function (e) {
        self.onSearchInput(e.target.value);
      });

      // 清除搜索
      this.searchClear.addEventListener('click', function () {
        self.clearSearch();
      });

      // 分类切换
      var items = this.categoryNav.querySelectorAll('.category-item');
      items.forEach(function (item) {
        item.addEventListener('click', function () {
          var index = parseInt(item.getAttribute('data-index'));
          self.switchCategory(index);
        });
      });

      // 滚动加载更多
      this.productList.addEventListener('scroll', function () {
        self.onScroll();
      });

      // 监听父页面发来的支付结果
      window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'fsj:paymentResult') {
          console.log('[首页] 收到支付结果:', JSON.stringify(e.data.data));
          CheckoutPage.handlePaymentResult(e.data.data);
        }
      });

      // 去结算 — 直接打开下单弹窗
      this.cartBtn.addEventListener('click', function () {
        CheckoutPage.open();
      });

      // 结算弹窗关闭
      document.getElementById('checkout-overlay').addEventListener('click', function () {
        CheckoutPage.close();
      });
      document.getElementById('checkout-close').addEventListener('click', function () {
        CheckoutPage.close();
      });

      // 地址选择：点击地址栏打开地址选择
      document.getElementById('checkout-address').addEventListener('click', function () {
        CheckoutPage.openAddressPicker();
      });

      // 地址选择弹窗关闭
      document.getElementById('address-overlay').addEventListener('click', function () {
        CheckoutPage.closeAddressPicker();
      });
      document.getElementById('address-close').addEventListener('click', function () {
        CheckoutPage.closeAddressPicker();
      });

      // 提交订单
      document.getElementById('footer-btn').addEventListener('click', function () {
        CheckoutPage.submit();
      });
    },

    /**
     * 搜索输入（防抖 500ms）
     */
    onSearchInput: function (keyword) {
      keyword = keyword.trim();
      this.searchKeyword = keyword;
      this.searchClear.style.display = keyword ? '' : 'none';

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
     * 切换分类
     */
    switchCategory: function (index) {
      if (index === this.currentCategory) return;

      var items = this.categoryNav.querySelectorAll('.category-item');
      items.forEach(function (item) {
        item.classList.toggle('active', parseInt(item.getAttribute('data-index')) === index);
      });

      this.currentCategory = index;
      this.pageIndex = 1;
      this.products = [];
      this.hasMore = true;
      this.loadProducts();

      this.productList.scrollTop = 0;
    },

    /**
     * 滚动事件：到达底部加载更多
     */
    onScroll: function () {
      if (!this.hasMore || this.loading) return;
      var el = this.productList;
      // 距离底部 50px 以内时触发
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

      var categoryName = this.currentCategory === 0 ? '' : categories[this.currentCategory];

      FsjApi.getProductList(this.pageIndex, this.pageSize, categoryName, this.searchKeyword)
        .then(function (res) {
          if (!res.success || !res.data) {
            self.showError('加载失败');
            return;
          }

          var rows = res.data.rows || [];
          var total = res.data.totalCount || res.data.total || 0;

          // 转换数据
          var newProducts = rows.map(function (row) {
            return FsjApi.mapProduct(row);
          });

          // 合并
          var allProducts = self.pageIndex === 1
            ? newProducts
            : self.products.concat(newProducts);

          self.products = allProducts;
          self.hasMore = allProducts.length < total;

          self.renderProducts();
          self.hideLoading();

          // 没有更多了提示
          if (!self.hasMore && self.products.length > 0) {
            self.showNoMore();
          }
        })
        .catch(function (err) {
          console.error('[首页] 加载商品失败:', err);
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
        // 插入到 loading 和 empty 之前
        this.productList.insertBefore(grid, this.loadingState);
      }

      if (this.products.length === 0) {
        grid.style.display = 'none';
        this.emptyState.style.display = '';
        this.cartBar.style.display = 'none';
        return;
      }

      this.emptyState.style.display = 'none';
      grid.style.display = '';

      grid.innerHTML = this.products.map(function (product) {
        var imgHtml = product.imageUrl
          ? '<img src="' + product.imageUrl + '" alt="' + product.name + '" />'
          : '<span class="placeholder">📦</span>';

        var cartItem = self.cart[product.id];
        var qtyHtml = '';
        if (cartItem) {
          qtyHtml = '<div class="qty-control">' +
            '<button class="qty-btn qty-minus" data-id="' + product.id + '">−</button>' +
            '<span class="qty-num">' + cartItem.quantity + '</span>' +
            '<button class="qty-btn qty-plus" data-id="' + product.id + '">+</button>' +
          '</div>';
        } else {
          qtyHtml = '<button class="product-add-btn" data-id="' + product.id + '">+</button>';
        }

        return '<div class="product-card" data-id="' + product.id + '">' +
          '<div class="product-image-wrap">' +
            imgHtml +
            qtyHtml +
          '</div>' +
          '<div class="product-info">' +
            '<div class="product-name">' + product.name + '</div>' +
            '<div class="product-price-row">' +
              '<span class="price-full">¥' + product.price.toFixed(2) + '</span>' +
              '<span class="price-box">盒子价¥' + product.boxPrice.toFixed(2) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      // 绑定加购按钮
      var addBtns = grid.querySelectorAll('.product-add-btn');
      addBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var pid = btn.getAttribute('data-id');
          self.addToCart(pid);
        });
      });

      // 绑定减号按钮
      var minusBtns = grid.querySelectorAll('.qty-minus');
      minusBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var pid = btn.getAttribute('data-id');
          self.decreaseFromCart(pid);
        });
      });

      // 绑定加号按钮
      var plusBtns = grid.querySelectorAll('.qty-plus');
      plusBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var pid = btn.getAttribute('data-id');
          self.addToCart(pid);
        });
      });

      // 更新购物车栏
      this.updateCartBar();
    },

    /**
     * 加入购物车
     */
    addToCart: function (productId) {
      var product = this.products.find(function (p) { return p.id === productId; });
      if (!product) return;

      if (product.stock <= 0) {
        alert('商品已售罄');
        return;
      }

      if (this.cart[productId]) {
        if (this.cart[productId].quantity >= product.stock) {
          alert('库存不足');
          return;
        }
        this.cart[productId].quantity++;
      } else {
        this.cart[productId] = {
          info: product,
          quantity: 1
        };
      }

      this.updateCartBar();
      this.renderProducts(); // 重新渲染显示数量控件
    },

    /**
     * 减少购物车数量
     */
    decreaseFromCart: function (productId) {
      var item = this.cart[productId];
      if (!item) return;

      if (item.quantity > 1) {
        item.quantity--;
        this.updateCartBar();
        this.renderProducts();
      } else {
        delete this.cart[productId];
        this.updateCartBar();
        this.renderProducts();
      }
    },

    /**
     * 更新购物车栏显示
     */
    updateCartBar: function () {
      var items = Object.values(this.cart);
      var totalCount = 0;

      items.forEach(function (item) {
        totalCount += item.quantity;
      });

      this.cartText.textContent = '共 ' + totalCount + ' 件商品';
      this.cartBar.style.display = totalCount > 0 ? '' : 'none';
    },

    /**
     * 显示加载状态
     */
    showLoading: function () {
      this.loadingState.innerHTML = '<div class="loading-spinner"></div><p>加载中...</p>';
      this.loadingState.style.display = '';
    },

    /**
     * 显示加载更多状态
     */
    showLoadingMore: function () {
      this.loadingState.innerHTML = '<div class="loading-spinner"></div><p>加载更多...</p>';
      this.loadingState.style.display = '';
    },

    /**
     * 隐藏加载状态
     */
    hideLoading: function () {
      this.loadingState.style.display = 'none';
    },

    /**
     * 显示没有更多了
     */
    showNoMore: function () {
      this.loadingState.innerHTML = '<p style="color:#999;font-size:12px;">— 没有更多了 —</p>';
      this.loadingState.style.display = '';
    },

    /**
     * 显示错误
     */
    showError: function (msg) {
      this.hideLoading();
      this.emptyState.innerHTML = '<p>' + msg + '</p>';
      this.emptyState.style.display = '';
    }
  };

  // 系统配置
  var SYSTEM_CONFIG = {
    minOrderAmount: 10,  // 起送门槛
    balance: 0           // 默认余额（通过 API 从后端获取）
  };

  /**
   * 从 URL hash 参数解析用户身份和余额
   */
  function parseHashParams() {
    var hash = window.location.hash.substring(1);
    var params = {};
    hash.split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv[0]) params[kv[0]] = decodeURIComponent(kv[1] || '');
    });
    return params;
  }

  /**
   * 下单结算弹窗
   */
  var CheckoutPage = {
    payMode: 'box',  // box / full
    cartItems: [],
    userBalance: SYSTEM_CONFIG.balance,  // 初始默认值，通过 loadUserBalance 从后端加载
    userRowid: '',
    selectedAddress: null,  // { rowid, mingcheng1, mingcheng2, mingcheng3, dzqc, dianhua }

    /**
     * 从后端加载用户余额（通过用户 rowid 实时查询，不依赖缓存）
     */
    loadUserBalance: function () {
      var self = this;
      var storedInfo = localStorage.getItem('fsj_user_info');
      var userRowid = '';

      console.log('[结算] loadUserBalance 开始');
      console.log('[结算] localStorage fsj_user_info:', storedInfo);

      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }
      console.log('[结算] 解析 userRowid:', userRowid);

      // 兜底：从 URL hash 读取用户 rowid
      if (!userRowid) {
        var hashParams = parseHashParams();
        console.log('[结算] hashParams:', hashParams);
        if (hashParams.fsj_user) userRowid = hashParams.fsj_user;
        console.log('[结算] 从 hash 获取 userRowid:', userRowid);
      }

      if (!userRowid) {
        console.log('[结算] 未获取到 userRowid，跳过余额查询');
        return Promise.resolve(self.userBalance);
      }

      console.log('[结算] 开始调用 getUserInfoByRowid, rowid:', userRowid);

      return FsjApi.getUserInfoByRowid(userRowid).then(function (info) {
        console.log('[结算] getUserInfoByRowid 返回:', JSON.stringify(info));
        self.userBalance = info.balance;
        console.log('[结算] 用户余额:', info.balance, ', 积分:', info.jifen);
        return info.balance;
      }).catch(function (err) {
        console.error('[结算] getUserInfoByRowid 失败:', err);
        console.warn('[结算] 加载用户余额失败:', err.message);
        return self.userBalance;
      });
    },

    open: function () {
      var self = this;
      console.log('[结算] CheckoutPage.open 被调用');

      // 检查登录状态
      var storedInfo = localStorage.getItem('fsj_user_info');
      var hashParams = parseHashParams();
      var userRowid = '';
      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }
      if (!userRowid && hashParams.fsj_user) userRowid = hashParams.fsj_user;

      if (!userRowid) {
        alert('请先登录');
        return;
      }

      // 保存用户 rowid，供地址加载使用
      this.userRowid = userRowid;

      this.cartItems = Object.values(HomePage.cart);
      if (this.cartItems.length === 0) {
        alert('购物车是空的');
        return;
      }
      console.log('[结算] 购物车商品数:', this.cartItems.length);
      // 打开前先加载真实余额
      this.loadUserBalance().then(function (balance) {
        console.log('[结算] loadUserBalance 完成, 余额:', balance);
        document.getElementById('checkout-modal').style.display = '';
        self.render();
        // 加载默认收货地址
        self.loadUserAddress();
      });
    },

    close: function () {
      document.getElementById('checkout-modal').style.display = 'none';
    },

    /**
     * 加载用户默认收货地址
     */
    loadUserAddress: function () {
      var self = this;
      if (!this.userRowid) return;

      FsjApi.getUserAddressRowid(this.userRowid).then(function (addressRowid) {
        if (!addressRowid) {
          self.selectedAddress = null;
          self.renderAddress();
          return;
        }
        // 通过地址 rowid 查询详情
        FsjApi.getUserAddresses(self.userRowid).then(function (list) {
          var addr = list.find(function (a) { return a.rowid === addressRowid; });
          if (addr) {
            self.selectedAddress = addr;
          } else {
            // 默认地址不在用户地址列表中，清空
            self.selectedAddress = null;
            FsjApi.setUserAddressRowid(self.userRowid, '');
          }
          self.renderAddress();
        });
      });
    },

    /**
     * 打开地址选择弹窗
     */
    openAddressPicker: function () {
      var self = this;
      if (!this.userRowid) return;

      document.getElementById('address-modal').style.display = 'flex';
      document.getElementById('address-loading').style.display = '';
      document.getElementById('address-empty').style.display = 'none';
      document.getElementById('address-list').innerHTML = '<div class="address-loading" id="address-loading">加载中...</div>';

      FsjApi.getUserAddresses(this.userRowid).then(function (list) {
        var listEl = document.getElementById('address-list');
        if (!list || list.length === 0) {
          listEl.innerHTML = '<div class="address-empty" id="address-empty">暂无收货地址</div>';
          return;
        }

        var html = list.map(function (addr) {
          var name = addr.mingcheng1 || '未知地址';
          var detail = addr.dzqc || (addr.mingcheng2 || '') + ' ' + (addr.mingcheng3 || '');
          return '<div class="address-item" data-rowid="' + addr.rowid + '">' +
            '<div class="address-item-left">' +
              '<div class="address-item-name">' + name + '</div>' +
              '<div class="address-item-detail">' + detail + '</div>' +
              (addr.dianhua ? '<div class="address-item-phone">' + addr.dianhua + '</div>' : '') +
            '</div>' +
          '</div>';
        }).join('');

        listEl.innerHTML = html;

        // 绑定点击事件
        listEl.querySelectorAll('.address-item').forEach(function (el) {
          el.addEventListener('click', function () {
            var rowid = el.getAttribute('data-rowid');
            var addr = list.find(function (a) { return a.rowid === rowid; });
            self.selectAddress(addr);
          });
        });
      });
    },

    /**
     * 选择地址并关闭地址选择弹窗
     */
    selectAddress: function (addr) {
      this.selectedAddress = addr;
      // 更新用户的默认地址
      if (this.userRowid && addr) {
        FsjApi.setUserAddressRowid(this.userRowid, addr.rowid);
      }
      // 关闭地址选择弹窗
      document.getElementById('address-modal').style.display = 'none';
      // 刷新结算弹窗的地址显示
      this.renderAddress();
    },

    /**
     * 关闭地址选择弹窗
     */
    closeAddressPicker: function () {
      document.getElementById('address-modal').style.display = 'none';
    },

    /**
     * 渲染地址栏
     */
    renderAddress: function () {
      var roomEl = document.getElementById('address-room');
      var detailEl = document.getElementById('address-detail');
      if (!roomEl || !detailEl) return;

      if (this.selectedAddress) {
        roomEl.textContent = this.selectedAddress.mingcheng3 || '';
        var parts = [];
        if (this.selectedAddress.mingcheng1) parts.push(this.selectedAddress.mingcheng1);
        if (this.selectedAddress.mingcheng2) parts.push(this.selectedAddress.mingcheng2);
        if (this.selectedAddress.dianhua) parts.push(this.selectedAddress.dianhua);
        detailEl.textContent = parts.join(' · ');
      } else {
        roomEl.textContent = '请选择';
        detailEl.textContent = '点击选择收货地址';
      }
    },

    selectPayMode: function (mode) {
      this.payMode = mode;
      this.render();
    },

    /**
     * 提交订单
     */
    submit: function () {
      var btn = document.getElementById('footer-btn');
      if (btn && btn.classList.contains('disabled')) return;

      var items = this.cartItems;
      var fullTotal = 0;
      var boxTotal = 0;
      items.forEach(function (item) {
        fullTotal += item.info.price * item.quantity;
        boxTotal += item.info.boxPrice * item.quantity;
      });

      var balanceToUse = 0;
      var remainAmount = 0;
      var payModeName = '';

      if (this.payMode === 'box') {
        // 先享后付
        payModeName = '先享后付';
      } else if (this.payMode === 'balance') {
        // 余额支付：先用余额，不足走微信
        balanceToUse = Math.min(fullTotal, this.userBalance);
        remainAmount = Math.max(0, fullTotal - this.userBalance);
        payModeName = remainAmount > 0 ? '余额+微信支付' : '余额支付';
      } else if (this.payMode === 'wechat') {
        // 纯微信支付
        remainAmount = fullTotal;
        payModeName = '微信支付';
      }

      this._createOrderAndPay(fullTotal, balanceToUse, remainAmount, payModeName, boxTotal);
    },

    /**
     * 创建订单并处理支付
     */
    _createOrderAndPay: function (fullTotal, balanceToUse, remainAmount, payModeName, boxTotal) {
      var self = this;

      var openid = '';
      var userRowid = '';

      // 优先从 localStorage 读取
      var storedOpenid = localStorage.getItem('fsj_openid');
      if (storedOpenid) openid = storedOpenid;

      var storedInfo = localStorage.getItem('fsj_user_info');
      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }

      // 兜底：从 URL hash 参数读取（测试/调试用）
      var hashParams = parseHashParams();
      if (!openid && hashParams.fsj_openid) openid = hashParams.fsj_openid;
      if (!userRowid && hashParams.fsj_user) userRowid = hashParams.fsj_user;

      // 纯微信支付（无余额参与）：先拉起支付，付款成功后再创建订单
      if (remainAmount > 0 && balanceToUse === 0) {
        this._pendingOrder = {
          orderRowid: null,
          jueseRowid: null,
          fullTotal: fullTotal,
          balanceToUse: 0,
          remainAmount: remainAmount,
          payModeName: payModeName,
          cartSnapshot: this.cartItems.map(function (item) {
            return {
              productRowid: item.info.id,
              shuliang: item.quantity,
              tejia: item.info.boxPrice,
              shoujia: item.info.price,
              goumaijia: item.info.price
            };
          })
        };
        this._launchWechatPayment();
        return;
      }

      // 余额参与（纯余额 / 余额+微信）或 盒子价先享后付：先创建订单
      var getUserRowidPromise = userRowid ? Promise.resolve(userRowid) : FsjApi.getUserRowidByOpenid(openid);

      getUserRowidPromise.then(function (jueseRowid) {
        var shangjiaRowid = localStorage.getItem('fsj_shangjia_rowid') || FsjApi.getShangjiaRowid();

        if (remainAmount > 0) {
          // 余额+微信支付：订单先设为"待送达"，支付完成后保持待送达
          var orderZhuangtai = '待送达';
          var detailItems = self.cartItems.map(function (item) {
            return {
              productRowid: item.info.id,
              shuliang: item.quantity,
              tejia: item.info.boxPrice,
              shoujia: item.info.price,
              goumaijia: item.info.price,
              zhuangtai: orderZhuangtai,
              fkfs: payModeName
            };
          });

          return FsjApi.createOrder({
            shangjiaRowid: shangjiaRowid,
            jueseRowid: jueseRowid,
            shdz: self.selectedAddress ? self.selectedAddress.dzqc : '',
            zhuangtai: orderZhuangtai,
            fkfs: payModeName,
            yue: balanceToUse > 0 ? balanceToUse : 0,
            jine: remainAmount,
            jinfen: 0
          }).then(function (orderRowid) {
            console.log('[下单] 订单创建成功, rowid:', orderRowid);
            return FsjApi.createOrderDetails(orderRowid, jueseRowid, detailItems).then(function (detailRowids) {
              console.log('[下单] 订单明细创建成功, 明细数:', detailRowids.length);
              // 走微信支付
              self._payWithWechat(orderRowid, jueseRowid, fullTotal, balanceToUse, remainAmount);
            });
          });
        } else if (balanceToUse > 0) {
          // 纯余额支付：设为"待送达"
          var orderZhuangtai = '待送达';
          var detailItems = self.cartItems.map(function (item) {
            return {
              productRowid: item.info.id,
              shuliang: item.quantity,
              tejia: item.info.boxPrice,
              shoujia: item.info.price,
              goumaijia: item.info.price,
              zhuangtai: orderZhuangtai,
              fkfs: payModeName
            };
          });

          return FsjApi.createOrder({
            shangjiaRowid: shangjiaRowid,
            jueseRowid: jueseRowid,
            shdz: self.selectedAddress ? self.selectedAddress.dzqc : '',
            zhuangtai: orderZhuangtai,
            fkfs: payModeName,
            yue: balanceToUse,
            jine: 0,
            jinfen: 0
          }).then(function (orderRowid) {
            console.log('[下单] 订单创建成功, rowid:', orderRowid);
            return FsjApi.createOrderDetails(orderRowid, jueseRowid, detailItems).then(function (detailRowids) {
              console.log('[下单] 订单明细创建成功, 明细数:', detailRowids.length);
              // 余额支付
              self._payWithBalance(orderRowid, jueseRowid, fullTotal, balanceToUse);
            });
          });
        } else {
          // 盒子价先享后付：设为"待送达"
          var orderZhuangtai = '待送达';
          var detailItems = self.cartItems.map(function (item) {
            return {
              productRowid: item.info.id,
              shuliang: item.quantity,
              tejia: item.info.boxPrice,
              shoujia: item.info.price,
              goumaijia: item.info.price,
              zhuangtai: orderZhuangtai,
              fkfs: payModeName
            };
          });

          return FsjApi.createOrder({
            shangjiaRowid: shangjiaRowid,
            jueseRowid: jueseRowid,
            shdz: self.selectedAddress ? self.selectedAddress.dzqc : '',
            zhuangtai: orderZhuangtai,
            fkfs: payModeName,
            yue: 0,
            jine: 0,
            jinfen: 0
          }).then(function (orderRowid) {
            console.log('[下单] 订单创建成功, rowid:', orderRowid);
            return FsjApi.createOrderDetails(orderRowid, jueseRowid, detailItems).then(function (detailRowids) {
              console.log('[下单] 订单明细创建成功, 明细数:', detailRowids.length);
              alert('下单成功！开封后支付');
              self.close();
              HomePage.cart = {};
              HomePage.updateCartBar();
            });
          });
        }
      }).catch(function (err) {
        console.error('[下单] 订单创建失败:', err);
        alert('下单失败: ' + err.message);
      });
    },

    /**
     * 拉起微信支付（纯微信支付，订单尚未创建）
     */
    _launchWechatPayment: function () {
      var self = this;
      console.log('[下单] 纯微信支付，先拉起支付，成功后再创建订单');

      var itemNames = this.cartItems.map(function (item) { return item.info.name; }).join(', ');
      var orderInfo = {
        body: itemNames || '商品购买',
        total_fee: Math.round(this._pendingOrder.remainAmount * 100),
        items: this._pendingOrder.cartSnapshot,
        addressDzqc: this.selectedAddress ? this.selectedAddress.dzqc : ''
      };
      console.log('[下单] Bridge.doPayment, orderInfo:', JSON.stringify(orderInfo));

      if (window.parent && window.parent.Bridge && window.parent.Bridge.doPayment) {
        console.log('[下单] 调用 parent.Bridge.doPayment');
        window.parent.Bridge.doPayment(orderInfo);
      } else if (window.Bridge && window.Bridge.doPayment) {
        console.log('[下单] 调用 window.Bridge.doPayment');
        window.Bridge.doPayment(orderInfo);
      } else {
        console.warn('[下单] Bridge.doPayment 不可用，降级为 alert');
        alert('下单成功！需微信支付 ¥' + this._pendingOrder.remainAmount.toFixed(2) + '\n（Bridge 不可用）');
        self.close();
        HomePage.cart = {};
        HomePage.updateCartBar();
      }
    },

    /**
     * 微信支付 — 通过 Bridge 通知小程序拉起真实微信支付
     */
    _payWithWechat: function (orderRowid, jueseRowid, fullTotal, balanceToUse, remainAmount) {
      var self = this;
      console.log('[下单] 调起真实微信支付, 金额:', remainAmount);

      // 构建商品快照
      var cartSnapshot = this.cartItems.map(function (item) {
        return {
          productRowid: item.info.id,
          shuliang: item.quantity,
          tejia: item.info.boxPrice,
          shoujia: item.info.price,
          goumaijia: item.info.price
        };
      });

      // 保存订单信息，等支付结果返回时使用
      this._pendingOrder = {
        orderRowid: orderRowid,
        jueseRowid: jueseRowid,
        fullTotal: fullTotal,
        balanceToUse: balanceToUse,
        cartSnapshot: cartSnapshot
      };

      // 构建支付参数：商品名 + 金额（分）+ 明细
      var itemNames = this.cartItems.map(function (item) { return item.info.name; }).join(', ');
      var orderInfo = {
        body: itemNames || '商品购买',
        total_fee: Math.round(remainAmount * 100), // 转为分
        items: cartSnapshot,
        addressDzqc: self.selectedAddress ? self.selectedAddress.dzqc : ''
      };
      console.log('[下单] Bridge.doPayment, orderInfo:', JSON.stringify(orderInfo));

      if (window.parent && window.parent.Bridge && window.parent.Bridge.doPayment) {
        console.log('[下单] 调用 parent.Bridge.doPayment');
        window.parent.Bridge.doPayment(orderInfo);
      } else if (window.Bridge && window.Bridge.doPayment) {
        console.log('[下单] 调用 window.Bridge.doPayment');
        window.Bridge.doPayment(orderInfo);
      } else {
        console.warn('[下单] Bridge.doPayment 不可用，降级为 alert');
        alert('下单成功！需微信支付 ¥' + remainAmount.toFixed(2) + '\n（Bridge 不可用）');
        self.close();
        HomePage.cart = {};
        HomePage.updateCartBar();
      }

      // 注意：不在这里关闭弹窗，等小程序支付完成后再处理
    },

    /**
     * 处理支付结果（从父页面返回）
     */
    handlePaymentResult: function (result) {
      var self = this;
      console.log('[结算] 处理支付结果, success:', result.success);

      var order = this._pendingOrder;
      if (!order) {
        console.warn('[结算] 没有待处理的订单信息');
        return;
      }

      if (result.success) {
        // 纯微信支付：订单尚未创建，先创建订单再标记已支付
        if (!order.orderRowid) {
          console.log('[结算] 支付成功，创建订单（纯微信支付）');
          this._createOrderAfterPayment(order, function () {
            alert('支付成功！感谢您的购买');
            self.close();
            HomePage.cart = {};
            HomePage.updateCartBar();
          });
          this._pendingOrder = null;
          return;
        }

        // 余额+微信支付：订单已创建，更新状态即可
        console.log('[结算] 支付成功，更新订单状态');
        FsjApi.updateOrderStatus(order.orderRowid, '待送达').then(function () {
          alert('支付成功！感谢您的购买');
          self.close();
          HomePage.cart = {};
          HomePage.updateCartBar();
        }).catch(function (err) {
          console.warn('[结算] 更新订单状态失败（支付已成功）:', err);
          alert('支付成功！');
          self.close();
          HomePage.cart = {};
          HomePage.updateCartBar();
        });
      } else {
        // 支付失败/取消
        console.log('[结算] 支付失败/取消:', result.error);
        if (!order.orderRowid) {
          // 纯微信支付，订单未创建，直接提示
          alert(result.error || '支付未完成');
        } else {
          // 余额+微信支付，订单已创建，保持"待支付"状态
          alert(result.error || '支付未完成，订单已保留');
        }
      }

      // 清除待处理订单
      this._pendingOrder = null;
    },

    /**
     * 支付成功后创建订单（纯微信支付场景）
     */
    _createOrderAfterPayment: function (order, onSuccess) {
      var openid = '';
      var userRowid = '';

      var storedOpenid = localStorage.getItem('fsj_openid');
      if (storedOpenid) openid = storedOpenid;

      var storedInfo = localStorage.getItem('fsj_user_info');
      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }

      var hashParams = parseHashParams();
      if (!openid && hashParams.fsj_openid) openid = hashParams.fsj_openid;
      if (!userRowid && hashParams.fsj_user) userRowid = hashParams.fsj_user;

      var getUserRowidPromise = userRowid ? Promise.resolve(userRowid) : FsjApi.getUserRowidByOpenid(openid);

      getUserRowidPromise.then(function (jueseRowid) {
        var shangjiaRowid = localStorage.getItem('fsj_shangjia_rowid') || FsjApi.getShangjiaRowid();

        // 纯微信支付：订单和明细尚未创建，需要创建
        if (!order.orderRowid) {
          // 先创建订单
          return FsjApi.createOrder({
            shangjiaRowid: shangjiaRowid,
            jueseRowid: jueseRowid,
            shdz: self.selectedAddress ? self.selectedAddress.dzqc : '',
            zhuangtai: '待送达',
            fkfs: order.payModeName,
            yue: 0,
            jine: order.remainAmount,
            jinfen: 0
          }).then(function (orderRowid) {
            console.log('[结算] 订单创建成功, rowid:', orderRowid);

            // 再创建订单明细，通过 dingdan 关联订单
            return FsjApi.createOrderDetails(orderRowid, jueseRowid, order.cartSnapshot).then(function (detailRowids) {
              console.log('[结算] 订单明细创建成功, 明细数:', detailRowids.length);
              onSuccess();
            });
          });
        } else {
          // 余额+微信支付：订单和明细已在 _createOrderAndPay 中创建，只需更新状态
          return FsjApi.updateOrderStatus(order.orderRowid, '待送达').then(function () {
            onSuccess();
          });
        }
      }).catch(function (err) {
        console.error('[结算] 支付成功后创建订单失败:', err);
        alert('支付成功，但订单创建失败: ' + err.message);
      });
    },

    /**
     * 余额支付
     */
    _payWithBalance: function (orderRowid, jueseRowid, fullTotal, balanceToUse) {
      var self = this;
      console.log('[下单] 余额支付, 扣减:', balanceToUse);
      // 余额由后台自动扣减，前端不主动更新
      FsjApi.updateOrderStatus(orderRowid, '待送达').then(function () {
        alert('下单成功！已使用余额支付 ¥' + balanceToUse.toFixed(2));
        self.close();
        HomePage.cart = {};
        HomePage.updateCartBar();
      });
    },

    render: function () {
      var items = this.cartItems;
      var totalQty = 0;
      var fullTotal = 0;
      var boxTotal = 0;

      items.forEach(function (item) {
        totalQty += item.quantity;
        fullTotal += item.info.price * item.quantity;
        boxTotal += item.info.boxPrice * item.quantity;
      });

      var fullTotalStr = fullTotal.toFixed(2);
      var boxTotalStr = boxTotal.toFixed(2);
      var boxSaved = (fullTotal - boxTotal).toFixed(2);

      // 地址
      document.getElementById('goods-count').textContent = '共' + totalQty + '件';

      // 商品列表
      var goodsHtml = items.map(function (item) {
        var imgHtml = item.info.imageUrl
          ? '<img class="checkout-goods-img" src="' + item.info.imageUrl + '" />'
          : '<div class="checkout-goods-img-placeholder">📦</div>';
        var subtotal = (item.info.price * item.quantity).toFixed(2);
        return '<div class="checkout-goods-item">' +
          imgHtml +
          '<div class="checkout-goods-info">' +
            '<div class="checkout-goods-name">' + item.info.name + '</div>' +
            '<div class="checkout-goods-price-row">' +
              '<span class="checkout-goods-full-price">¥' + item.info.price.toFixed(2) + '</span>' +
              '<span class="checkout-goods-box-price">盒子价 ¥' + item.info.boxPrice.toFixed(2) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="checkout-goods-right">' +
            '<div class="checkout-goods-qty">×' + item.quantity + '</div>' +
            '<div class="checkout-goods-subtotal">¥' + subtotal + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      document.getElementById('goods-list').innerHTML = goodsHtml;

      // 支付卡片选中状态
      var boxActive = this.payMode === 'box';
      var balActive = this.payMode === 'balance';
      var weActive = this.payMode === 'wechat';

      var boxCard = document.getElementById('pay-card-box');
      var balCard = document.getElementById('pay-card-balance');
      var weCard = document.getElementById('pay-card-wechat');
      if (boxCard) boxCard.classList.toggle('active', boxActive);
      if (balCard) balCard.classList.toggle('active', balActive);
      if (weCard) weCard.classList.toggle('active', weActive);

      var boxRadio = document.getElementById('pay-radio-box');
      var balRadio = document.getElementById('pay-radio-balance');
      var weRadio = document.getElementById('pay-radio-wechat');
      if (boxRadio) boxRadio.classList.toggle('checked', boxActive);
      if (balRadio) balRadio.classList.toggle('checked', balActive);
      if (balRadio) balRadio.textContent = balActive ? '✓' : '';
      if (weRadio) weRadio.classList.toggle('checked', weActive);

      // 支付详情区域显示/隐藏
      var boxTips = document.getElementById('pay-tips-box');
      var balTips = document.getElementById('pay-tips-balance');
      var weTips = document.getElementById('pay-tips-wechat');
      if (boxTips) boxTips.style.display = boxActive ? '' : 'none';
      if (balTips) balTips.style.display = balActive ? '' : 'none';
      if (weTips) weTips.style.display = weActive ? '' : 'none';
      document.getElementById('price-box-row').style.display = boxActive ? '' : 'none';
      // 选中盒子价时不显示"可用余额"行
      document.getElementById('tip-balance-row').style.display = boxActive ? 'none' : '';

      // 盒子价详情
      document.getElementById('tip-balance').textContent = '¥' + this.userBalance.toFixed(2);
      document.getElementById('tip-box-total').textContent = '¥' + boxTotalStr;

      var isThresholdMet = boxTotal >= SYSTEM_CONFIG.minOrderAmount;
      var thresholdGap = (SYSTEM_CONFIG.minOrderAmount - boxTotal).toFixed(2);
      var warningEl = document.getElementById('tip-warning');
      warningEl.style.display = boxActive ? (isThresholdMet ? 'none' : '') : 'none';
      if (!isThresholdMet) {
        document.getElementById('tip-gap').textContent = thresholdGap;
      }

      // 余额支付详情
      var deductAmount = Math.min(fullTotal, this.userBalance);
      var wechatRemain = Math.max(0, fullTotal - this.userBalance);
      document.getElementById('tip-balance-val').textContent = '¥' + this.userBalance.toFixed(2);
      document.getElementById('tip-deduct-val').textContent = '¥' + deductAmount.toFixed(2);
      var wechatRow = document.getElementById('tip-wechat-row');
      if (wechatRemain > 0) {
        wechatRow.style.display = '';
        document.getElementById('tip-wechat-val').textContent = '¥' + wechatRemain.toFixed(2);
      } else {
        wechatRow.style.display = 'none';
      }

      // 微信支付详情
      document.getElementById('tip-wechat-total').textContent = '¥' + fullTotalStr;

      // 价格明细
      document.getElementById('price-full').textContent = '¥' + fullTotalStr;
      document.getElementById('price-box').textContent = '¥' + boxTotalStr;

      // 底部栏
      var finalAmount = 0;
      var canSubmit = false;
      var tipText = '';
      var btnText = '';

      if (boxActive) {
        finalAmount = 0;
        canSubmit = isThresholdMet;
        tipText = '0元下单，开封后支付';
        btnText = '0元下单';
      } else if (balActive) {
        finalAmount = deductAmount;
        canSubmit = true;
        tipText = wechatRemain > 0 ? '余额不足部分需微信支付' : '';
        btnText = '立即支付 ¥' + deductAmount.toFixed(2);
      } else {
        finalAmount = fullTotal;
        canSubmit = true;
        tipText = '';
        btnText = '立即支付 ¥' + fullTotalStr;
      }

      document.getElementById('footer-amount').textContent = boxActive
        ? '¥0'
        : '¥' + finalAmount.toFixed(2);
      document.getElementById('footer-tip').textContent = tipText;
      document.getElementById('footer-tip').style.display = tipText ? '' : 'none';
      document.getElementById('footer-btn').textContent = btnText;
      document.getElementById('footer-btn').classList.toggle('disabled', !canSubmit);

      // 节省信息
      var saveEl = document.getElementById('footer-save');
      if (boxActive && parseFloat(boxSaved) > 0) {
        saveEl.style.display = '';
        document.getElementById('footer-saved').textContent = boxSaved;
        document.getElementById('footer-balance-used').textContent =
          this.userBalance > 0 ? '+余额¥' + this.userBalance.toFixed(2) : '';
      } else {
        saveEl.style.display = 'none';
      }
    }
  };

  // 暴露全局方法
  window.CheckoutPage = CheckoutPage;

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      HomePage.init();
    });
  } else {
    HomePage.init();
  }
})();

/**
 * 盒子页面 - 先享后付订单明细展示、多选、批量支付
 * 展示用户所有"先享后付"订单明细，每条明细铺开展示为一个格子
 * 待送达 = 灰色不可选，已送达 = 彩色可选可支付
 */
(function () {
  'use strict';

  var categories = ['全部', '饮品', '零食', '主食', '日用品'];

  function logDebug(msg) {
    if (typeof window.logDebug === 'function') {
      window.logDebug(msg);
    } else {
      console.log('[盒子-debug]', msg);
    }
  }

  var HeziPage = {
    selectedCells: new Set(),
    detailExpanded: false,
    items: [],
    currentCategory: 0,

    // 支付方式选择
    payMode: 'wechat',  // 'balance' | 'wechat'
    userBalance: 0,

    // DOM
    productList: null,
    loadingState: null,
    emptyState: null,
    payBar: null,
    payCount: null,
    payTotal: null,
    detailToggle: null,
    detailPanel: null,
    detailBody: null,
    detailClose: null,
    payBtn: null,
    categoryNav: null,

    // 支付方式选择 DOM
    payModeMask: null,
    payModeModal: null,
    payModeBalanceRow: null,
    payModeBalanceValue: null,
    payModePreviewAmount: null,

    init: function () {
      this.productList = document.getElementById('product-list');
      this.loadingState = document.getElementById('loading-state');
      this.emptyState = document.getElementById('empty-state');
      this.payBar = document.getElementById('pay-bar');
      this.payCount = document.getElementById('pay-count');
      this.payTotal = document.getElementById('pay-total');
      this.detailToggle = document.getElementById('detail-toggle');
      this.detailPanel = document.getElementById('detail-panel');
      this.detailBody = document.getElementById('detail-body');
      this.detailClose = document.getElementById('detail-close');
      this.payBtn = document.getElementById('pay-btn');
      this.categoryNav = document.getElementById('category-nav');

      // 支付方式选择 DOM
      this.payModeMask = document.getElementById('pay-mode-mask');
      this.payModeModal = document.getElementById('pay-mode-modal');
      this.payModeBalanceRow = document.getElementById('pay-mode-balance-row');
      this.payModeBalanceValue = document.getElementById('pay-mode-balance-value');
      this.payModePreviewAmount = document.getElementById('pay-mode-preview-amount');

      // 检测 wx SDK 是否加载
      console.log('[盒子] init: typeof wx =', typeof wx, ', wx.miniProgram =', !!(window.wx && window.wx.miniProgram));

      this.bindEvents();
      logDebug('盒子页面初始化');
      this.loadItems();
      this.checkPaymentResult();
      this.loadUserBalance();
    },

    /**
     * 检查是否有支付结果返回（仅用于清理 localStorage 标记和刷新页面）
     * 订单和明细的创建由 SPA 的 app.js 统一处理
     */
    checkPaymentResult: function () {
      var pendingInfo = localStorage.getItem('hezi_pendingOrder');
      if (pendingInfo) {
        // SPA 尚未处理，不清除标记，等待 SPA 处理
        return;
      }

      // hezi_pendingOrder 已被 SPA 清除，检查是否有成功的支付结果标记
      var payResult = localStorage.getItem('hezi_payResult');
      if (payResult === 'success') {
        console.log('[盒子] 检测到支付成功标记，SPA 应已处理订单创建，刷新页面');
        localStorage.removeItem('hezi_payResult');
        this.loadItems();
      }
    },

    bindEvents: function () {
      var self = this;

      // 监听父窗口发来的消息（SPA 通知 iframe 检查支付结果或刷新）
      window.addEventListener('message', function (event) {
        var data = event.data || {};
        if (data.type === 'hezi:checkPaymentResult') {
          console.log('[盒子] 收到父窗口通知，检查支付结果');
          self.checkPaymentResult();
        }
        if (data.type === 'hezi:clearSelection') {
          console.log('[盒子] 收到父窗口清空选中通知');
          self.selectedCells.clear();
          self.updatePayBar();
        }
        if (data.type === 'hezi:refresh') {
          console.log('[盒子] 收到父窗口刷新通知，重新加载数据');
          self.loadItems();
        }
      });

      // 页面可见性变化时检查支付结果
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
          self.checkPaymentResult();
        }
      });

      // 兼容方式：定期轮询
      this._checkTimer = setInterval(function () {
        self.checkPaymentResult();
      }, 2000);

      this.categoryNav.querySelectorAll('.category-item').forEach(function (item) {
        item.addEventListener('click', function () {
          var index = parseInt(item.getAttribute('data-index'));
          self.switchCategory(index);
        });
      });

      this.detailToggle.addEventListener('click', function () {
        self.toggleDetail();
      });

      this.detailClose.addEventListener('click', function () {
        self.toggleDetail();
      });

      this.payBtn.addEventListener('click', function () {
        self.doPay();
      });

      // 支付方式选择关闭按钮
      var payModeClose = document.getElementById('pay-mode-close');
      if (payModeClose) {
        payModeClose.addEventListener('click', function () {
          self.hidePayModeModal();
        });
      }
    },

    loadItems: function () {
      var self = this;

      // 重新加载时清空所有选中
      this.selectedCells.clear();

      // 获取用户信息
      var userRowid = '';
      var storedInfo = localStorage.getItem('fsj_user_info');
      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }

      if (!userRowid) {
        this.hideLoading();
        this.emptyState.style.display = '';
        this.emptyState.querySelector('p').textContent = '请先登录';
        return;
      }

      // 调用 API 获取先享后付订单明细
      FsjApi.getOrderDetails(userRowid).then(function (items) {
        logDebug('获取到 ' + items.length + ' 条订单明细');
        self.hideLoading();
        // 过滤掉全部已支付的明细，按待支付数量展开
        var expandedItems = [];
        items.forEach(function (item) {
          var paid = item.yizhifuShuliang || 0;
          var total = item.shuliang || 1;
          var remain = total - paid;
          if (remain <= 0) return; // 已全部支付
          for (var i = 0; i < remain; i++) {
            var copy = Object.assign({}, item);
            copy.cellId = item.rowid + '_' + i; // 每个格子独立ID
            expandedItems.push(copy);
          }
        });
        self.items = expandedItems;
        self.renderGrid();
      }).catch(function (err) {
        console.error('[盒子] 加载订单明细失败:', err);
        self.hideLoading();
        self.emptyState.style.display = '';
        self.emptyState.querySelector('p').textContent = '加载失败，请重试';
      });
    },

    renderGrid: function () {
      var self = this;
      var grid = this.productList.querySelector('.product-grid');

      if (!grid) {
        grid = document.createElement('div');
        grid.className = 'product-grid';
        this.productList.insertBefore(grid, this.loadingState);
      }

      if (this.items.length === 0) {
        grid.style.display = 'none';
        this.emptyState.style.display = '';
        this.emptyState.querySelector('p').textContent = '暂无商品';
        this.payBar.style.display = 'none';
        return;
      }

      this.emptyState.style.display = 'none';
      grid.style.display = '';

      grid.innerHTML = this.items.map(function (item) {
        var imgHtml = item.imageUrl
          ? '<img src="' + item.imageUrl + '" />'
          : '<span class="placeholder">📦</span>';

        // 待送达 = pending 样式（灰色不可选）
        // 已送达 = payable 样式（彩色可选 + 支付角标）
        var statusClass = item.zhuangtai === '待送达' ? ' pending' : ' payable';

        return '<div class="product-cell' + statusClass + '" data-cell-id="' + item.cellId + '">' +
          imgHtml +
        '</div>';
      }).join('');

      grid.querySelectorAll('.product-cell').forEach(function (cell) {
        cell.addEventListener('click', function () {
          var cellId = cell.getAttribute('data-cell-id');
          self.toggleCell(cellId, cell);
        });
      });

      this.updatePayBar();
    },

    toggleCell: function (cellId, el) {
      // 待送达状态不可选中
      if (el.classList.contains('pending')) return;

      if (this.selectedCells.has(cellId)) {
        this.selectedCells.delete(cellId);
        el.classList.remove('selected');
      } else {
        this.selectedCells.add(cellId);
        el.classList.add('selected');
      }
      this.updatePayBar();
    },

    updatePayBar: function () {
      var selectedItems = this.getSelectedItems();
      var totalCount = selectedItems.length;
      var totalPrice = 0;

      selectedItems.forEach(function (item) {
        totalPrice += item.boxPrice;
      });

      this.payCount.textContent = '共 ' + totalCount + ' 件';
      this.payTotal.textContent = '¥' + totalPrice.toFixed(2);
      this.payBar.style.display = totalCount > 0 ? '' : 'none';

      if (totalCount === 0) {
        this.detailPanel.classList.remove('show');
        this.detailExpanded = false;
      }

      this.renderDetail();
    },

    getSelectedItems: function () {
      var self = this;
      return this.items.filter(function (item) {
        return self.selectedCells.has(item.cellId);
      });
    },

    toggleDetail: function () {
      this.detailExpanded = !this.detailExpanded;
      this.detailPanel.classList.toggle('show', this.detailExpanded);
    },

    renderDetail: function () {
      var items = this.getSelectedItems();

      this.detailBody.innerHTML = items.map(function (item) {
        var imgHtml = item.imageUrl
          ? '<img class="detail-item-img" src="' + item.imageUrl + '" />'
          : '<div class="detail-item-img" style="display:flex;align-items:center;justify-content:center;">📦</div>';

        return '<div class="detail-item">' +
          imgHtml +
          '<div class="detail-item-info">' +
            '<div class="detail-item-name">' + item.productName + '</div>' +
            '<div class="detail-item-price">盒子价 ¥' + item.boxPrice.toFixed(2) + '</div>' +
          '</div>' +
          '<div class="detail-item-right">' +
            '<div class="detail-item-subtotal">¥' + item.boxPrice.toFixed(2) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    },

    doPay: function () {
      var selectedItems = this.getSelectedItems();
      if (selectedItems.length === 0) return;

      var total = 0;
      selectedItems.forEach(function (item) { total += item.boxPrice; });
      logDebug('点击立即下单, 选中 ' + selectedItems.length + ' 件, 金额: ¥' + total.toFixed(2));

      // 弹出支付方式选择
      this.showPayModeModal();
    },

    /**
     * 支付成功后创建订单和明细（由 SPA 调用，仅用于微信支付返回后的流程）
     * 余额支付不走此方法，直接在 _doPayBalance 中处理
     */
    createOrderAndDetails: function (pending) {
      var self = this;
      var selectedItems = pending.selectedItems;
      var userRowid = pending.userRowid;
      var total = pending.total;
      var payMode = pending.payMode || 'wechat';
      var fkfs = payMode === 'balance' ? '余额支付' : '微信支付';
      var shangjiaRowid = localStorage.getItem('fsj_shangjia_rowid') || '';

      // 第一步：构建明细数据
      var detailItems = selectedItems.map(function (item) {
        return {
          productRowid: item.productId || '',
          shuliang: 1,
          tejia: item.boxPrice,
          shoujia: item.boxPrice,
          goumaijia: item.boxPrice,
          zhuangtai: '待送达',
          fkfs: fkfs
        };
      });

      console.log('[盒子] 准备创建订单, 明细数:', detailItems.length, ', 金额:', total, ', 支付方式:', fkfs);
      logDebug('准备创建订单, 明细数: ' + detailItems.length + ', 金额: ¥' + total.toFixed(2) + ', 支付方式: ' + fkfs);
      console.log('[盒子] 订单状态: 待送达, fkfs: ' + fkfs);

      // 第二步：先创建订单
      FsjApi.createOrder({
        shangjiaRowid: shangjiaRowid,
        jueseRowid: userRowid,
        zhuangtai: '待送达',
        fkfs: fkfs,
        yue: payMode === 'balance' ? total : 0,
        jine: total,
        jinfen: 0
      }).then(function (orderRowid) {
        console.log('[盒子] 订单创建成功, rowid:', orderRowid);
        logDebug('订单创建成功, rowid: ' + orderRowid);

        // 第三步：创建订单明细，通过 dingdan 关联订单
        return FsjApi.createOrderDetails(orderRowid, userRowid, detailItems).then(function (detailRowids) {
          console.log('[盒子] 订单明细创建成功, 明细数:', detailRowids.length);
          logDebug('订单明细创建成功, 明细数: ' + detailRowids.length);

          // 第四步：统计每个原始明细被选中了几个，更新已支付数量
          var countByRowid = {};
          selectedItems.forEach(function (item) {
            var rid = item.rowid;
            countByRowid[rid] = (countByRowid[rid] || 0) + 1;
            logDebug('原始明细 rowid: ' + rid + ', yzfsl: ' + item.yizhifuShuliang);
          });

          var updatePromises = Object.keys(countByRowid).map(function (rid) {
            var currentPaid = selectedItems.filter(function (item) { return item.rowid === rid; })[0].yizhifuShuliang || 0;
            var newCount = currentPaid + countByRowid[rid];
            logDebug('更新明细 yzfsl, rowid: ' + rid + ', 原: ' + currentPaid + ', 本次: ' + countByRowid[rid] + ', 新值: ' + newCount);
            return FsjApi.updateOrderDetailYzfsl(rid, newCount).then(function () {
              logDebug('yzfsl 更新成功: ' + rid + ' -> ' + newCount);
              return true;
            }).catch(function (err) {
              logDebug('yzfsl 更新失败: ' + err.message);
              return false;
            });
          });

          return Promise.all(updatePromises).then(function (results) {
            logDebug('yzfsl 更新结果: ' + JSON.stringify(results));
            console.log('[盒子-微信支付] 已支付数量已更新');
            self.selectedCells.clear();
            alert('支付成功！');
            self.loadItems();
          });
        });
      }).catch(function (err) {
        console.error('[盒子] 创建失败:', err);
        alert('创建订单失败: ' + err.message);
      });
    },

    /**
     * 跳转支付页
     */
    navigateToPay: function (orderInfo) {
      var shangjiaRowid = localStorage.getItem('fsj_shangjia_rowid') || '';
      var params = 'body=' + encodeURIComponent(orderInfo.body || '') + '&fee=' + (orderInfo.total_fee || 1);
      if (shangjiaRowid) params += '&shangjia=' + encodeURIComponent(shangjiaRowid);
      var payUrl = '/pages/pay/index?' + params;

      console.log('[盒子] 跳转支付页:', payUrl);

      // 方式1: wx.miniProgram.navigateTo（webview 内嵌页面）
      if (typeof wx !== 'undefined' && wx.miniProgram && wx.miniProgram.navigateTo) {
        wx.miniProgram.navigateTo({
          url: payUrl,
          success: function () {
            console.log('[盒子] 跳转支付页成功');
          },
          fail: function (err) {
            console.error('[盒子] navigateTo 失败:', JSON.stringify(err));
            // 尝试用 reLaunch
            wx.miniProgram.reLaunch({ url: payUrl });
          }
        });
      } else {
        console.log('[盒子] wx.miniProgram 不可用，尝试 postMessage');
        // 方式2: postMessage（需要小程序端 onMessage 处理 doPayment）
        wx.miniProgram.postMessage({
          data: { type: 'doPayment', data: orderInfo }
        });
        // 延迟跳转
        setTimeout(function () {
          wx.miniProgram.reLaunch({ url: '/pages/index/index' });
        }, 200);
      }
    },

    switchCategory: function (index) {
      if (index === this.currentCategory) return;

      var self = this;
      this.categoryNav.querySelectorAll('.category-item').forEach(function (item) {
        item.classList.toggle('active', parseInt(item.getAttribute('data-index')) === index);
      });

      this.currentCategory = index;

      // TODO: 后续按分类筛选
      // 当前先不做分类筛选
    },

    hideLoading: function () {
      this.loadingState.style.display = 'none';
    },

    // ========== 支付方式选择 ==========

    loadUserBalance: function () {
      var self = this;
      var userRowid = '';
      var storedInfo = localStorage.getItem('fsj_user_info');
      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }
      if (!userRowid) return;

      if (typeof FsjApi !== 'undefined' && FsjApi.getUserInfoByRowid) {
        FsjApi.getUserInfoByRowid(userRowid).then(function (info) {
          self.userBalance = info.balance || 0;
        }).catch(function () {
          self.userBalance = 0;
        });
      }
    },

    showPayModeModal: function () {
      var selectedItems = this.getSelectedItems();
      var total = 0;
      selectedItems.forEach(function (item) { total += item.boxPrice; });

      this.payModePreviewAmount.textContent = '¥' + total.toFixed(2);
      this.payModeBalanceValue.textContent = '¥' + this.userBalance.toFixed(2);

      // 余额不足时提示并默认选中微信支付
      if (this.userBalance < total) {
        this.selectPayMode('wechat');
      }

      this.payModeMask.style.display = '';
      this.payModeModal.style.display = '';
    },

    hidePayModeModal: function () {
      this.payModeMask.style.display = 'none';
      this.payModeModal.style.display = 'none';
    },

    selectPayMode: function (mode) {
      this.payMode = mode;

      // 切换卡片高亮
      document.getElementById('pay-mode-card-balance').classList.toggle('pay-mode-card-active', mode === 'balance');
      document.getElementById('pay-mode-card-wechat').classList.toggle('pay-mode-card-active', mode === 'wechat');

      // 切换单选按钮状态
      var radioBalance = document.getElementById('pay-mode-radio-balance');
      var radioWechat = document.getElementById('pay-mode-radio-wechat');
      radioBalance.className = 'pay-mode-radio' + (mode === 'balance' ? ' pay-mode-radio-active' : '');
      radioWechat.className = 'pay-mode-radio' + (mode === 'wechat' ? ' pay-mode-radio-active' : '');

      // 余额不足时隐藏余额行
      var selectedItems = this.getSelectedItems();
      var total = 0;
      selectedItems.forEach(function (item) { total += item.boxPrice; });
      this.payModeBalanceRow.style.display = (mode === 'balance' && this.userBalance < total) ? 'none' : '';
    },

    confirmPayMode: function () {
      var self = this;
      var selectedItems = this.getSelectedItems();
      if (selectedItems.length === 0) return;

      var total = 0;
      selectedItems.forEach(function (item) { total += item.boxPrice; });

      // 余额支付：检查余额是否充足
      if (this.payMode === 'balance' && this.userBalance < total) {
        alert('余额不足，当前余额 ¥' + this.userBalance.toFixed(2) + '，需支付 ¥' + total.toFixed(2));
        return;
      }

      this.hidePayModeModal();

      logDebug('确认支付方式: ' + this.payMode + ', 金额: ¥' + total.toFixed(2));

      if (this.payMode === 'balance') {
        this._doPayBalance(selectedItems, total);
      } else {
        this._doPayWechat(selectedItems, total);
      }
    },

    /**
     * 余额支付流程：创建订单 → 标记已支付 → 创建明细
     */
    _doPayBalance: function (selectedItems, total) {
      var self = this;
      var userRowid = '';
      var storedInfo = localStorage.getItem('fsj_user_info');
      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }
      if (!userRowid) {
        alert('请先登录');
        return;
      }

      var shangjiaRowid = localStorage.getItem('fsj_shangjia_rowid') || '';
      var itemNames = selectedItems.map(function (item) { return item.productName; }).join(', ');

      var detailItems = selectedItems.map(function (item) {
        return {
          productRowid: item.productId || '',
          shuliang: 1,
          tejia: item.boxPrice,
          shoujia: item.boxPrice,
          goumaijia: item.boxPrice,
          zhuangtai: '已开封',
          fkfs: '余额支付'
        };
      });

      console.log('[盒子] 余额支付, 用户:', userRowid, '明细数:', selectedItems.length, '金额:', total);
      console.log('[盒子] 订单状态: 已开封, fkfs: 余额支付');

      FsjApi.createOrder({
        shangjiaRowid: shangjiaRowid,
        jueseRowid: userRowid,
        zhuangtai: '已开封',
        fkfs: '余额支付',
        yue: total,
        jine: total,
        jinfen: 0
      }).then(function (orderRowid) {
        if (!orderRowid) {
          throw new Error('订单创建成功但返回的 rowid 为空');
        }
        return FsjApi.createOrderDetails(orderRowid, userRowid, detailItems).then(function () {
          // 更新已支付数量（非关键步骤）
          var countByRowid = {};
          selectedItems.forEach(function (item) {
            var rid = item.rowid;
            countByRowid[rid] = (countByRowid[rid] || 0) + 1;
            logDebug('原始明细 rowid: ' + rid + ', yzfsl: ' + item.yizhifuShuliang);
          });

          var updatePromises = Object.keys(countByRowid).map(function (rid) {
            var currentPaid = selectedItems.filter(function (item) { return item.rowid === rid; })[0].yizhifuShuliang || 0;
            var newCount = currentPaid + countByRowid[rid];
            logDebug('[余额] 更新明细 yzfsl, rowid: ' + rid + ', 原: ' + currentPaid + ', 本次: ' + countByRowid[rid] + ', 新值: ' + newCount);
            return FsjApi.updateOrderDetailYzfsl(rid, newCount).then(function () {
              logDebug('[余额] yzfsl 更新成功: ' + rid + ' -> ' + newCount);
              return true;
            }).catch(function (err) {
              logDebug('[余额] yzfsl 更新失败: ' + err.message);
              return false;
            });
          });

          return Promise.all(updatePromises).then(function (results) {
            logDebug('[余额] yzfsl 更新结果: ' + JSON.stringify(results));
            alert('支付成功！已使用余额支付 ¥' + total.toFixed(2));
            self.selectedCells.clear();
            self.loadItems();
          });
        });
      }).catch(function (err) {
        console.error('[盒子] 余额支付失败:', err);
        alert('支付失败: ' + err.message);
      });
    },

    /**
     * 微信支付流程：保存待处理订单信息 → 跳转支付页
     */
    _doPayWechat: function (selectedItems, total) {
      var self = this;
      var userRowid = '';
      var storedInfo = localStorage.getItem('fsj_user_info');
      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }
      if (!userRowid) {
        alert('请先登录');
        return;
      }

      var itemNames = selectedItems.map(function (item) { return item.productName; }).join(', ');

      var orderData = {
        selectedItems: selectedItems,
        userRowid: userRowid,
        total: total,
        itemNames: itemNames,
        payMode: 'wechat'
      };

      localStorage.setItem('hezi_pendingOrder', JSON.stringify(orderData));

      var orderInfo = {
        body: itemNames || '商品购买',
        total_fee: Math.round(total * 100)
      };

      self.navigateToPay(orderInfo);
    }
  };

  window.HeziPage = HeziPage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { HeziPage.init(); });
  } else {
    HeziPage.init();
  }
})();

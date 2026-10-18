/**
 * 我的订单页面 - 二级页面（真实数据）
 */
(function () {
  'use strict';

  var STATUS_STYLE_MAP = {
    '待付款': { bg: '#FEF3C7', color: '#B45309' },
    '待发货': { bg: '#DBEAFE', color: '#1D4ED8' },
    '待送达': { bg: '#DBEAFE', color: '#1D4ED8' },
    '已发货': { bg: '#EDE9FE', color: '#6D28D9' },
    '已送达': { bg: '#D1FAE5', color: '#047857' },
    '已完成': { bg: '#D1FAE5', color: '#047857' },
    '已取消': { bg: '#F3F4F6', color: '#6B7280' },
    '已退款': { bg: '#FEE2E2', color: '#B91C1C' },
    '已开封': { bg: '#D1FAE5', color: '#047857' },
    '明细': { bg: '#F3F4F6', color: '#4B5563' }
  };

  function getStatusStyle(status) {
    return STATUS_STYLE_MAP[status] || { bg: '#F3F4F6', color: '#999' };
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    return dateStr.substring(0, 16);
  }

  function parseRelName(field) {
    if (!field) return '';
    // 如果是纯字符串且不是 JSON 格式，直接返回
    if (typeof field === 'string' && field.indexOf('[') !== 0 && field.indexOf('{') !== 0) {
      return field;
    }
    try {
      var arr = typeof field === 'string' ? JSON.parse(field) : field;
      return Array.isArray(arr) && arr.length > 0 ? (arr[0].name || arr[0].val || '') : '';
    } catch (e) {
      // JSON 解析失败，如果是字符串直接返回原值
      return typeof field === 'string' ? field : '';
    }
  }

  var OrdersPage = {
    init: function () {
      this.backBtn = document.getElementById('orders-back-btn');
      this.ordersList = document.getElementById('orders-list');
      this.ordersEmpty = document.getElementById('orders-empty');

      if (!this.ordersList) return;

      this.bindEvents();
      this.bindLoginChange();
      this.loadOrders();
    },

    bindEvents: function () {
      var self = this;
      if (this.backBtn) {
        this.backBtn.addEventListener('click', function () {
          self._backToProfile();
        });
      }
    },

    /**
     * 监听登录状态变化，重新加载订单
     */
    bindLoginChange: function () {
      var self = this;
      window.addEventListener('wechatlogin:change', function (e) {
        var detail = e.detail;
        if (detail.type === 'login' || detail.type === 'restore' || detail.type === 'logout') {
          self.loadOrders();
        }
      });
    },

    loadOrders: function () {
      var self = this;
      // 未登录时直接显示空状态，不请求订单数据
      var token = localStorage.getItem('fsj_token');
      console.log('[Orders] loadOrders 调用, token:', token ? '有 (' + token.substring(0, 8) + '...)' : '无');
      if (!token) {
        console.log('[Orders] 未登录，显示空状态');
        this.renderOrders([]);
        return;
      }

      var shangjiaRowid = FsjApi.getShangjiaRowid();
      console.log('[Orders] shangjiaRowid:', shangjiaRowid ? '有' : '无');
      if (!shangjiaRowid) {
        this.renderOrders([]);
        return;
      }

      this.ordersList.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>加载中...</p></div>';
      this.ordersEmpty.style.display = 'none';
      this.ordersList.style.display = '';

      // 先获取订单列表
      FsjApi.getOrders(shangjiaRowid).then(function (orderRows) {
        console.log('[Orders] getOrders 返回数量:', orderRows ? orderRows.length : 0);
        if (orderRows && orderRows.length > 0) {
          console.log('[Orders] 第一条订单原始数据:', JSON.stringify(orderRows[0]));
        }
        if (!orderRows || orderRows.length === 0) {
          self.renderOrders([]);
          return;
        }

        // 对每个订单通过 dingdan 关联字段查询其明细
        var promises = orderRows.map(function (row) {
          console.log('[Orders] 订单 row.zhuangtai 原始值:', row.zhuangtai);
          var status = parseRelName(row.zhuangtai);
          console.log('[Orders] 解析后 status:', status);
          var fkfs = parseRelName(row.fkfs) || '';
          return FsjApi.getOrderItemsByOrder(row.rowid).then(function (items) {
            return {
              id: row.ddid || row.rowid || '',
              rowid: row.rowid || '',
              status: status,
              fkfs: fkfs,
              date: row.ctime || row.createdate || '',
              items: items,
              total: items.reduce(function (sum, item) {
                return sum + item.price * item.quantity;
              }, 0)
            };
          });
        });

        return Promise.all(promises);
      }).then(function (orders) {
        console.log('[Orders] 最终 orders 数量:', orders ? orders.length : 0);
        if (orders) {
          console.log('[Orders] 最终 orders:', JSON.stringify(orders));
        }
        if (!orders) return;
        self.renderOrders(orders);
      }).catch(function (err) {
        console.error('[Orders] 加载订单失败:', err);
        self.renderOrders([]);
      });
    },

    renderOrders: function (orders) {
      if (!orders || orders.length === 0) {
        this.ordersList.style.display = 'none';
        this.ordersEmpty.style.display = '';
        return;
      }

      this.ordersEmpty.style.display = 'none';
      this.ordersList.style.display = '';

      // 按创建时间倒序
      var sorted = orders.slice().sort(function (a, b) {
        return (b.date || '').localeCompare(a.date || '');
      });

      var self = this;

      this.ordersList.innerHTML = sorted.map(function (order) {
        var statusStyle = getStatusStyle(order.status);
        var itemsHtml = order.items.map(function (item) {
          var imgSrc = item.image || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect fill="%23f0f0f0" width="120" height="120"/><text x="60" y="60" text-anchor="middle" fill="%23999" font-size="14">暂无图片</text></svg>';
          return '<div class="order-item">' +
            '<img class="order-item-img" src="' + imgSrc + '" alt="' + item.name + '" onerror="this.style.display=\'none\'" />' +
            '<div class="order-item-info">' +
              '<div class="order-item-name">' + item.name + '</div>' +
              '<div class="order-item-qty">x' + item.quantity + '</div>' +
            '</div>' +
            '<div class="order-item-price">¥' + item.price.toFixed(2) + '</div>' +
          '</div>';
        }).join('');

        var dateStr = formatDate(order.date);
        var fkfsClass = 'order-footer-default';
        if (order.fkfs) {
          if (order.fkfs.indexOf('先享') !== -1 || order.fkfs.indexOf('后付') !== -1) {
            fkfsClass = 'order-footer-xianxiang';
          } else if (order.fkfs.indexOf('余额') !== -1) {
            fkfsClass = 'order-footer-yue';
          } else if (order.fkfs.indexOf('微信') !== -1 || order.fkfs.indexOf('现金') !== -1 || order.fkfs === '已支付') {
            fkfsClass = 'order-footer-WECHAT';
          }
        }
        var fkfsText = order.fkfs || '';
        var actionHtml = '';

        // 待发货/待送达状态显示"确认收货"按钮（积分兑换/已开封订单不显示）
        if ((order.status === '待发货' || order.status === '待送达') && order.fkfs !== '积分兑换' && order.status !== '已开封') {
          actionHtml = '<button class="order-action-btn" data-rowid="' + order.rowid + '">确认收货</button>';
        }

        // 积分兑换订单不显示状态，已开封订单显示状态标签
        var statusHtml = '';
        if (order.fkfs !== '积分兑换') {
          statusHtml = '<span class="order-status" style="background:' + statusStyle.bg + ';color:' + statusStyle.color + '">' + order.status + '</span>';
        }

        // 底部三栏：左边日期，中间付款方式，右边合计
        var dateHtml = '<span class="order-date">' + dateStr + '</span>';
        var fkfsHtml = '';
        var totalHtml = '';
        if (order.fkfs !== '积分兑换') {
          fkfsHtml = '<span class="order-fkfs">' + fkfsText + '</span>';
          totalHtml = '<span class="order-total">合计: ¥' + order.total.toFixed(2) + '</span>';
        }

        return '<div class="order-card" data-id="' + order.id + '">' +
          '<div class="order-header">' +
            '<span class="order-id">' + order.id + '</span>' +
            statusHtml +
          '</div>' +
          '<div class="order-items">' + itemsHtml + '</div>' +
          '<div class="order-footer ' + fkfsClass + '">' +
            dateHtml +
            fkfsHtml +
            totalHtml +
          '</div>' +
          (actionHtml ? '<div class="order-actions">' + actionHtml + '</div>' : '') +
        '</div>';
      }).join('');

      // 绑定"确认收货"按钮事件
      this.ordersList.querySelectorAll('.order-action-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var rowid = btn.getAttribute('data-rowid');
          self.confirmReceive(rowid);
        });
      });
    },

    /**
     * 确认收货：更新订单状态为"已送达"
     */
    confirmReceive: function (orderRowid) {
      var self = this;
      if (!confirm('确认收货？')) return;

      // 同时更新主订单状态和明细状态
      Promise.all([
        FsjApi.updateOrderStatus(orderRowid, '已送达'),
        FsjApi.updateOrderDetailStatus(orderRowid, '已送达')
      ]).then(function () {
        alert('确认收货成功！');
        self.loadOrders();
      }).catch(function (err) {
        console.error('[Orders] 确认收货失败:', err);
        alert('确认收货失败: ' + err.message);
      });
    },

    _backToProfile: function () {
      if (window.App) {
        window.App.switchPage('profile');
      }
    }
  };

  window.OrdersPage = OrdersPage;
})();

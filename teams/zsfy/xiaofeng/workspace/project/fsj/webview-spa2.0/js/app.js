/**
 * Webview SPA 2.0 - 应用入口
 * 功能：tab 切换 + 登录后动态加载不同底部菜单
 */
(function () {
  'use strict';

  var App = {
    /**
     * 页面标识映射
     */
    pageMap: {
      'home': 'home',
      'agent': 'agent',
      'message': 'message',
      'mine': 'profile',
      'profile': 'profile',
      'orders': 'orders',
      'dingdan': 'orders',
      'points': 'points',
      'address': 'address',
      'shdz': 'address',
      'xiangce': 'album',
      'publish': 'publish',
    },

    /**
     * 默认底部导航栏配置（未登录/通用）
     */
    defaultTabBar: [
      { name: '首页', sort: '0', page: 'home', mode: '0' },
      { name: '智能体', sort: '1', page: 'agent', mode: '0' },
      { name: '消息', sort: '2', page: 'message' },
      { name: '我的', sort: '3', page: 'mine' },
    ],

    /**
     * 当前 TabBar 配置
     */
    tabBarConfig: [],

    init: function () {
      logDebug('=== App.init 开始 ===');
      logDebug('URL: ' + window.location.href.substring(0, 150));

      // 检查是否有从支付页返回的结果（URL query 中的 _pay 参数 或 hash 中的 paymentResult）
      this.checkPaymentResult();

      // 恢复缓存的商家名称，登录后也能立即显示标题
      var cachedName = localStorage.getItem('fsj_shangjia_name');
      if (cachedName) {
        document.title = cachedName;
        logDebug('恢复缓存标题: ' + cachedName);
      }
      // 恢复缓存的主题色
      var cachedColor = localStorage.getItem('fsj_theme_color');
      if (cachedColor) {
        this.applyThemeColor(cachedColor);
      }
      // 清理沉浸模式残留状态（防止 CSS 隐藏 tab bar）
      this.clearImmersiveResidue();
      // 初始化微信登录服务（监听 hash 回调）
      if (window.WechatLoginService) WechatLoginService.init();
      console.log('[App] WechatLoginService.init() 完成');

      // 监听 hashchange 中的支付结果（小程序返回时可能携带 paymentResult）
      var self = this;
      window.addEventListener('hashchange', function () {
        self.checkPaymentResult();
      });

      // 轮询检查支付结果（防止 hashchange 事件被吞）
      this._payPollTimer = setInterval(function () {
        self.checkPaymentResult();
      }, 500);

      // 从 URL 获取 shangjia 参数，尝试获取商家配置
      this.loadShangjiaFromUrl();
      // 开发调试：支持通过 URL 参数 ?profileMenu=... 直接设置自定义菜单
      this.loadProfileMenuFromUrl();
      logDebug('=== App.init 完成 ===');
    },

    /**
     * 从 URL 参数读取 profileMenu 配置（开发调试用）
     * 用法: ?profileMenu=[{"name":"我的订单","sort":"0","page":"dingdan","mode":"1","url":"..."}]
     */
    loadProfileMenuFromUrl: function () {
      var params = window.location.search.substring(1);
      // 用 indexOf 找到第一个 = 后的完整值（JSON 中包含多个 = 号）
      var idx = params.indexOf('profileMenu=');
      if (idx === -1) return;
      var value = params.substring(idx + 12); // "profileMenu=" 长度 12
      var ampIdx = value.indexOf('&');
      if (ampIdx !== -1) value = value.substring(0, ampIdx);
      try {
        var menu = JSON.parse(decodeURIComponent(value));
        if (Array.isArray(menu)) {
          localStorage.setItem('fsj_profile_menu', JSON.stringify(menu));
          console.log('[App] 从 URL 设置 profileMenu:', menu);
        }
      } catch (e) {
        console.error('[App] 解析 profileMenu 参数失败:', e);
      }
    },

    /**
     * 检查支付结果（URL query 中的 _pay 参数 或 hash 中的 paymentResult）
     */
    checkPaymentResult: function () {
      // 优先检查 URL query 中的 _pay 参数（小程序 setData 重载方式）
      var search = window.location.search;
      if (search && search.indexOf('_pay=') !== -1) {
        try {
          var params = search.substring(1).split('&');
          for (var i = 0; i < params.length; i++) {
            var kv = params[i].split('=');
            if (kv[0] === '_pay') {
              var result = JSON.parse(decodeURIComponent(kv[1] || ''));
              logDebug('[App] _pay 支付结果: ' + JSON.stringify(result).substring(0, 200) + ', hezi_pendingOrder: ' + (localStorage.getItem('hezi_pendingOrder') ? '有' : '无'));
              console.log('[App] 收到支付结果 (_pay 参数):', JSON.stringify(result));

              if (result.success && result._needCreateOrder) {
                // 先检查是否有盒子页面的待支付订单
                var heziPending = localStorage.getItem('hezi_pendingOrder');
                logDebug('[App] 需要创建订单! heziPending: ' + (heziPending ? '有' : '无'));
                console.log('[App] _pay 支付结果, heziPending:', heziPending ? heziPending.substring(0, 200) : '无');
                if (heziPending) {
                  console.log('[App] 检测到盒子待支付订单, 直接处理');
                  try {
                    var pending = JSON.parse(heziPending);
                    localStorage.removeItem('hezi_pendingOrder');
                    // 调用 FsjApi 创建订单和明细
                    this._createHeziOrder(pending);
                  } catch (e) {
                    console.error('[App] 解析盒子待支付订单失败:', e);
                  }
                } else {
                  console.log('[App] 无盒子待支付订单, 走普通流程');
                  this.createOrderAfterPayment(result);
                }
              } else {
                logDebug('[App] 不需要创建订单, success=' + result.success + ', _needCreateOrder=' + result._needCreateOrder);
              }

              // 通知 iframe 支付结果
              var iframe = document.getElementById('webview-iframe');
              if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                  type: 'fsj:paymentResult',
                  data: result
                }, '*');
                console.log('[App] 已通过 postMessage 通知 iframe 支付结果');

                // 额外通知盒子页面
                iframe.contentWindow.postMessage({
                  type: 'hezi:checkPaymentResult'
                }, '*');
                console.log('[App] 已通知盒子页面检查支付结果');
              }

              // 清理 _pay 参数，防止重复处理
              var cleanUrl = window.location.pathname + window.location.hash;
              window.history.replaceState(null, '', cleanUrl);
              logDebug('已处理并清理 _pay 参数');
              return;
            }
          }
        } catch (e) {
          console.warn('[App] 解析 _pay 参数失败:', e);
        }
      }

      // 兼容旧方式：检查 hash 中的 paymentResult
      var hash = window.location.hash.substring(1);
      if (!hash || hash.indexOf('paymentResult=') === -1) return;

      logDebug('检测到 paymentResult hash，开始处理');

      try {
        var hashParams = {};
        hash.split('&').forEach(function (part) {
          var hkv = part.split('=');
          if (hkv[0]) hashParams[hkv[0]] = decodeURIComponent(hkv[1] || '');
        });

        if (hashParams.paymentResult) {
          var result = JSON.parse(hashParams.paymentResult);
          console.log('[App] 收到支付结果 (hash):', JSON.stringify(result));

          // 如果需要创建订单（从 pay/index.js 返回，携带 _needCreateOrder）
          if (result.success && result._needCreateOrder) {
            // 先检查是否有盒子页面的待支付订单
            var heziPending = localStorage.getItem('hezi_pendingOrder');
            if (heziPending) {
              console.log('[App] 检测到盒子待支付订单, 直接处理');
              try {
                var pending = JSON.parse(heziPending);
                localStorage.removeItem('hezi_pendingOrder');
                this._createHeziOrder(pending);
              } catch (e) {
                console.error('[App] 解析盒子待支付订单失败:', e);
              }
            } else {
              this.createOrderAfterPayment(result);
            }
          }

          // 通知 iframe 支付结果
          var iframe = document.getElementById('webview-iframe');
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              type: 'fsj:paymentResult',
              data: result
            }, '*');
            console.log('[App] 已通过 postMessage 通知 iframe 支付结果');

            // 额外通知盒子页面
            iframe.contentWindow.postMessage({
              type: 'hezi:checkPaymentResult'
            }, '*');
            console.log('[App] 已通知盒子页面检查支付结果');
          }

          // 清理 hash 中的 paymentResult，防止重复处理
          var baseUrl = window.location.href.split('#')[0];
          window.history.replaceState(null, '', baseUrl);
          logDebug('已清理 paymentResult hash');
        }
      } catch (e) {
        console.warn('[App] 解析支付结果失败:', e);
      }
    },

    /**
     * 支付成功后创建订单（通过 FsjApi/Dify 代理）
     * 参考 shuxiaohe/home.js 的 _createOrderAfterPayment 完整流程
     */
    createOrderAfterPayment: function (result) {
      var self = this;
      var openid = localStorage.getItem('fsj_openid') || '';
      var shangjiaRowid = localStorage.getItem('fsj_shangjia_rowid') || FsjApi.getShangjiaRowid() || '';
      var body = result.body || '商品购买';
      var amount = result.amount || '0.00';

      console.log('[App] 支付成功后创建订单, openid:', openid, ', shangjia:', shangjiaRowid, ', body:', body, ', amount:', amount);

      if (!openid) {
        console.warn('[App] 无 openid，跳过订单创建');
        return;
      }

      if (!shangjiaRowid) {
        console.warn('[App] 无 shangjiaRowid，跳过订单创建');
        return;
      }

      // 优先从 localStorage 获取用户 rowid（登录时保存的 fsj_user_info.id）
      var userRowid = '';
      var storedInfo = localStorage.getItem('fsj_user_info');
      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }

      // 尝试从 localStorage 恢复待支付订单明细（bridge.js doPayment 时保存的）
      var pendingOrderItems = [];
      var pendingOrderStr = localStorage.getItem('fsj_pendingOrder');
      if (pendingOrderStr) {
        try {
          var pendingOrder = JSON.parse(pendingOrderStr);
          pendingOrderItems = (pendingOrder.items || []).map(function (item) {
            // 给每个明细补充状态和付款方式（与订单主表一致）
            return Object.assign({}, item, {
              zhuangtai: '待送达',
              fkfs: '微信支付'
            });
          });
          localStorage.removeItem('fsj_pendingOrder');
        } catch (e) {}
      }

      logDebug('创建订单: juese=' + (userRowid || '未找到') + ', 明细=' + pendingOrderItems.length + '条');

      // 内部方法：创建订单头 + 明细
      function doCreateOrder(jueseRowid) {
        // 获取下单时用户选中的收货地址全称（由 checkout 页面通过 bridge.doPayment 保存）
        var addressDzqc = localStorage.getItem('fsj_selectedAddressDzqc') || '';
        if (addressDzqc) console.log('[App] 使用收货地址:', addressDzqc);

        return FsjApi.createOrder({
          shangjiaRowid: shangjiaRowid,
          jueseRowid: jueseRowid,
          shdz: addressDzqc,
          zhuangtai: '待送达',
          fkfs: '微信支付',
          yue: 0,
          jine: parseFloat(amount),
          jinfen: 0
        }).then(function (orderRowid) {
          console.log('[App] 订单创建成功, rowid:', orderRowid, ', juese:', jueseRowid || '(无)');

          // 支付成功后清除地址缓存
          localStorage.removeItem('fsj_selectedAddressDzqc');

          // 如果有明细，创建订单明细
          if (pendingOrderItems.length > 0) {
            console.log('[App] 开始创建', pendingOrderItems.length, '条订单明细');
            return FsjApi.createOrderDetails(orderRowid, jueseRowid, pendingOrderItems).then(function () {
              console.log('[App] 订单明细全部创建成功');
              logDebug('[App] 订单创建成功: ' + orderRowid + ', 明细: ' + pendingOrderItems.length + '条');
            });
          } else {
            logDebug('[App] 订单创建成功: ' + orderRowid + '（无明细）');
          }
        });
      }

      // 获取用户 rowid：本地有就用，没有就调 API（找不到也不影响订单创建）
      var getUserRowidPromise = userRowid ? Promise.resolve(userRowid) : FsjApi.getUserRowidByOpenid(openid);

      getUserRowidPromise.then(function (jueseRowid) {
        return doCreateOrder(jueseRowid);
      }).catch(function (err) {
        // 用户未找到，不关联 juese 创建订单
        console.warn('[App] 未找到用户 rowid，不关联用户创建订单:', err.message);
        return doCreateOrder('');
      }).catch(function (err) {
        console.error('[App] 支付成功后创建订单最终失败:', err);
        logDebug('[App] 订单创建失败: ' + err.message);
      });
    },

    /**
     * 处理盒子页面的待支付订单（支付成功后创建订单+明细）
     */
    _createHeziOrder: function (pending) {
      var self = this;
      var selectedItems = pending.selectedItems || [];
      var userRowid = pending.userRowid || '';
      var total = pending.total || 0;
      var payMode = pending.payMode || 'wechat';
      var fkfs = payMode === 'balance' ? '余额支付' : '微信支付';
      var shangjiaRowid = localStorage.getItem('fsj_shangjia_rowid') || FsjApi.getShangjiaRowid() || '';

      logDebug('[App] _createHeziOrder 被调用! 明细数:' + selectedItems.length + ', 金额:' + total);
      console.log('[App] 处理盒子订单, userRowid:', userRowid, ', 明细数:', selectedItems.length, ', 金额:', total, ', 支付方式:', fkfs);

      if (!userRowid) {
        console.warn('[App] 盒子订单无用户 rowid，跳过');
        return;
      }

      // 构建明细数据
      var detailItems = selectedItems.map(function (item) {
        return {
          productRowid: item.productId || '',
          shuliang: 1,
          tejia: item.boxPrice,
          shoujia: item.boxPrice,
          goumaijia: item.boxPrice,
          zhuangtai: '已开封',
          fkfs: fkfs
        };
      });

      // 先创建订单
      var addressDzqc = localStorage.getItem('fsj_selectedAddressDzqc') || '';
      FsjApi.createOrder({
        shangjiaRowid: shangjiaRowid,
        jueseRowid: userRowid,
        shdz: addressDzqc,
        zhuangtai: '已开封',
        fkfs: fkfs,
        yue: payMode === 'balance' ? total : 0,
        jine: total,
        jinfen: 0
      }).then(function (orderRowid) {
        console.log('[App] 盒子订单创建成功, rowid:', orderRowid);

        if (!orderRowid) {
          throw new Error('订单创建成功但返回的 rowid 为空');
        }

        // 再创建订单明细
        return FsjApi.createOrderDetails(orderRowid, userRowid, detailItems).then(function (detailRowids) {
          console.log('[App] 盒子订单明细创建成功, 明细数:', detailRowids.length);

          // 更新原始明细的已支付数量（非关键步骤，失败不影响支付成功）
          var countByRowid = {};
          selectedItems.forEach(function (item) {
            var rid = item.rowid;
            countByRowid[rid] = (countByRowid[rid] || 0) + 1;
            console.log('[App-debug] 原始明细 rowid:', rid, ', yzfsl:', item.yizhifuShuliang);
          });

          var updatePromises = Object.keys(countByRowid).map(function (rid) {
            var currentPaid = selectedItems.filter(function (item) { return item.rowid === rid; })[0].yizhifuShuliang || 0;
            var newCount = currentPaid + countByRowid[rid];
            console.log('[App-盒子] 更新明细 yzfsl, rowid:', rid, ', 原已支付:', currentPaid, ', 本次支付:', countByRowid[rid], ', 新值:', newCount);
            return FsjApi.updateOrderDetailYzfsl(rid, newCount).then(function () {
              console.log('[App-盒子] yzfsl 更新成功:', rid, '->', newCount);
              return true;
            }).catch(function (err) {
              console.warn('[App-盒子] yzfsl 更新失败:', err.message);
              return false;
            });
          });

          return Promise.all(updatePromises).then(function (results) {
            console.log('[App] yzfsl 更新结果:', results);
            alert('支付成功！');
            // 通知 iframe 清空选中并刷新数据
            var iframe = document.getElementById('webview-iframe');
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({ type: 'hezi:clearSelection' }, '*');
              iframe.contentWindow.postMessage({ type: 'hezi:refresh' }, '*');
            }
          });
        });
      }).catch(function (err) {
        console.error('[App] 盒子订单/明细创建失败:', err);
        alert('订单创建失败: ' + err.message);
      });
    },

    /**
     * 从 URL 获取 shangjia rowid 并加载商家配置
     */
    loadShangjiaFromUrl: function () {
      var self = this;
      var params = window.location.search.substring(1);
      var shangjiaRowid = '';
      params.split('&').forEach(function (p) {
        var parts = p.split('=');
        if (parts[0] === 'shangjia') shangjiaRowid = decodeURIComponent(parts[1] || '');
      });

      // 如果 URL 有 shangjia 参数，保存并刷新配置
      if (shangjiaRowid) {
        console.log('[App] 从 URL 获取 shangjia:', shangjiaRowid);
        this.fetchShangjiaConfig(shangjiaRowid, function (config) {
          // 先保存"我的页面"自定义菜单（字段名: wode）
          if (config) {
            var wode = config.wode;
            // 只要商家返回了 wode 字段，就标记为已配置（即使是空数组）
            if (wode !== undefined && wode !== null) {
              localStorage.setItem('fsj_wode_configured', 'true');
              if (typeof wode === 'string') {
                try { wode = JSON.parse(wode); } catch (e) { wode = null; }
              }
              if (Array.isArray(wode) && wode.length > 0) {
                localStorage.setItem('fsj_profile_menu', JSON.stringify(wode));
                console.log('[App] 已保存 wode 菜单:', wode);
              }
              // 缓存优先（2026-09-05）：wode 未配置/为空时保留已有菜单，不再清除（避免闪没）
            }

            // 保存 sjkb 数据看板配置
            console.log('[App] config.sjkb =', config.sjkb);
            if (config.sjkb) {
              var sjkb = typeof config.sjkb === 'string' ? JSON.parse(config.sjkb) : config.sjkb;
              console.log('[App] 解析后 sjkb =', JSON.stringify(sjkb));
              if (Array.isArray(sjkb) && sjkb.length > 0) {
                localStorage.setItem('fsj_board_config', JSON.stringify(sjkb));
                console.log('[App] 已保存 sjkb 看板配置:', sjkb);
              }
              // 缓存优先（2026-09-05）：sjkb 缺失时保留已有看板配置，不再清除（避免来回切页看板闪没）
            }

            // 看板配置加载后，如果用户已登录，刷新统计看板
            if (localStorage.getItem('fsj_user_info') && window.ProfilePage) {
              setTimeout(function () {
                ProfilePage.renderStatsCard();
              }, 200);
            }
          }

          if (config && config.shangjia) {
            var tabs = config.shangjia;
            if (typeof tabs === 'string') {
              try { tabs = JSON.parse(tabs); } catch (e) { tabs = null; }
            }
            // 保存图标资源
            if (config.icons) {
              var icons = typeof config.icons === 'string' ? JSON.parse(config.icons) : config.icons;
              if (Array.isArray(icons)) self.setIcons(icons);
            }
            if (tabs && tabs.length) {
              self.updateTabBar(tabs);
              self.initPages();
              self.loadInitialPage();
              return;
            }
          }
          // 获取失败，走默认流程
          self.loadTabBarConfig();
          self.initPages();
          self.loadInitialPage();
        });
      } else {
        // URL 没有 shangjia 参数，尝试从缓存读取 rowid 刷新配置
        var cachedRowid = localStorage.getItem('fsj_shangjia_rowid');
        if (cachedRowid) {
          console.log('[App] URL 无 shangjia 参数，使用缓存 rowid:', cachedRowid);
          this.fetchShangjiaConfig(cachedRowid, function (config) {
            // 更新 wode 菜单配置
            if (config) {
              var wode = config.wode;
              if (wode !== undefined && wode !== null) {
                localStorage.setItem('fsj_wode_configured', 'true');
                if (typeof wode === 'string') {
                  try { wode = JSON.parse(wode); } catch (e) { wode = null; }
                }
                if (Array.isArray(wode) && wode.length > 0) {
                  localStorage.setItem('fsj_profile_menu', JSON.stringify(wode));
                } else {
                  localStorage.removeItem('fsj_profile_menu');
                }
              }

              // 更新 sjkb 看板配置
              if (config.sjkb) {
                var sjkb = typeof config.sjkb === 'string' ? JSON.parse(config.sjkb) : config.sjkb;
                if (Array.isArray(sjkb) && sjkb.length > 0) {
                  localStorage.setItem('fsj_board_config', JSON.stringify(sjkb));
                } else {
                  localStorage.removeItem('fsj_board_config');
                }
              } else {
                localStorage.removeItem('fsj_board_config');
              }

              // 设置商家名称标题
              var shopName = config.mingcheng || config.name || config.shopName || '';
              if (shopName) {
                document.title = shopName;
                localStorage.setItem('fsj_shangjia_name', shopName);
                console.log('[App] 设置页面标题:', shopName);
              }
            }
            // 看板配置加载后，如果用户已登录，刷新统计看板
            if (localStorage.getItem('fsj_user_info') && window.ProfilePage) {
              setTimeout(function () {
                ProfilePage.renderStatsCard();
              }, 200);
            }
            // 走缓存流程
            self.loadTabBarConfig();
            self.initPages();
            self.loadInitialPage();
          });
        } else {
          // 无缓存 rowid，走默认流程
          this.loadTabBarConfig();
          this.initPages();
          this.loadInitialPage();
        }
      }
    },

    /**
     * 通过 Node 通用 API 代理获取商家配置
     */
    fetchShangjiaConfig: function (rowid, callback) {
      var self = this;
      console.log('[App] 正在获取商家配置, rowid:', rowid);

      var body = {
        url: 'https://api.mingdao.com/v2/open/worksheet/getRowByIdPost',
        input: {
          worksheetId: '69f549c69f1956fc0e171aa6',
          rowId: rowid,
          getSystemControl: 'false'
        }
      };

      fetch('https://100000whys.cn/mingdao', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      .then(function (res) {
        if (!res.ok) throw new Error('网络请求失败: ' + res.status);
        return res.json();
      })
      .then(function (mingdaoResult) {
        if (mingdaoResult.success && mingdaoResult.data) {
          var raw = mingdaoResult.data;

          // 字段映射（明道云字段名 → 前端使用的字段名）
          var config = {
            shangjia: raw.dbdhl || raw.shangjia,          // 底部导航栏
            appid: raw.wxappid || raw.appid,               // 微信appid
            appsecret: raw.wxsecret || raw.appsecret,      // 微信appsecret
            color: raw.color,
            sjkb: raw.sjkb,
            wode: raw.wode,
            icons: raw.icons,
            mingcheng: raw.mingcheng,
            sjbh: raw.sjbh,
            shenhe: raw.shenhe,                             // 审核状态
            _raw: raw
          };

          console.log('[App] 商家配置获取成功, 字段:', Object.keys(raw).join(', '));

          // ===== 获取用户 jrdzz（加入的组织）供 kjzz 过滤使用 =====
          var _uid = '';
          try { _uid = JSON.parse(localStorage.getItem('fsj_user_info') || '{}').id || ''; } catch(e) {}
          if (_uid) {
            fetch('https://100000whys.cn/mingdao', { method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ url:'https://api.mingdao.com/v2/open/worksheet/getRowByIdPost',
                input:{ worksheetId:'69b0077358322d512e60bad0', rowId:_uid, controls:['jrdzz'], getSystemControl:'false' } }) })
            .then(function(r){ return r.json(); })
            .then(function(d){
              var raw = (d.data || {}).jrdzz || '[]';
              var orgRowids = [];
              try {
                var parsed = JSON.parse(raw);
                orgRowids = (Array.isArray(parsed) ? parsed : []).map(function(item) {
                  return (typeof item === 'object') ? (item.sid || item.rowid || '') : String(item);
                }).filter(function(x){ return x; });
              } catch(e) {}
              localStorage.setItem('fsj_user_jrdzz', JSON.stringify(orgRowids));
              console.log('[jrdzz] 已缓存', orgRowids.length, '个组织 rowid:', JSON.stringify(orgRowids));
            }).catch(function(e){ console.warn('[jrdzz] 获取失败:', e); });
          }
      var _uid = '';
      try { _uid = JSON.parse(localStorage.getItem('fsj_user_info') || '{}').id || ''; } catch(e) {}
      if (_uid) {
        fetch('https://100000whys.cn/mingdao', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ url:'https://api.mingdao.com/v2/open/worksheet/getRowByIdPost',
            input:{ worksheetId:'69b0077358322d512e60bad0', rowId:_uid, controls:['jrdzz'], getSystemControl:'false' } }) })
        .then(function(r){ return r.json(); })
        .then(function(d){
          var val = (d.data || {}).jrdzz || '空';
          try { val = JSON.stringify(JSON.parse(val), null, 1); } catch(e) {}
          console.log('[jrdzz] 用户已加入的组织:', val);
        }).catch(function(e){ console.log('[jrdzz] 获取失败:', e); });
      }
          console.log('[App] shangjia(dbdhl) =', config.shangjia ? config.shangjia.substring(0, 100) : '空');
          console.log('[App] appid =', config.appid);
          console.log('[App] color =', config.color);
          console.log('[App] wode =', config.wode ? config.wode.substring(0, 100) : '空');
          console.log('[App] sjkb =', config.sjkb ? config.sjkb.substring(0, 100) : '空');
          // 缓存到 localStorage
          localStorage.setItem('fsj_shangjia_rowid', rowid);
          if (config.appid) localStorage.setItem('fsj_appid', config.appid);
          if (config.appsecret) localStorage.setItem('fsj_appsecret', config.appsecret);
          if (config.color) {
            localStorage.setItem('fsj_theme_color', config.color);
            self.applyThemeColor(config.color);
          }
          // 缓存审核状态（用于控制头像显示）
          localStorage.setItem('fsj_shenhe', config.shenhe || '');

          // 提取商家名称，设置页面标题
          var shopName = config.mingcheng || '';
          if (shopName) {
            document.title = shopName;
            localStorage.setItem('fsj_shangjia_name', shopName);
            console.log('[App] 设置页面标题:', shopName);
          }

          callback(config);
        } else {
          console.error('[App] 未找到有效商家配置');
          callback(null);
        }
      })
      .catch(function (e) {
        console.error('[App] 商家配置请求失败:', e);
        callback(null);
      });
    },

    /**
     * 应用主题色
     */
    applyThemeColor: function (color) {
      console.log('[App] 应用主题色:', color);
      var root = document.documentElement;
      root.style.setProperty('--color-primary', color);
      // 计算浅色变体（12% 透明度）
      var r = parseInt(color.slice(1, 3), 16);
      var g = parseInt(color.slice(3, 5), 16);
      var b = parseInt(color.slice(5, 7), 16);
      root.style.setProperty('--color-primary-light', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.15)');
      root.style.setProperty('--color-primary-lighter', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.3)');
      root.style.setProperty('--color-primary-super-light', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.08)');
    },

    /**
     * 清理沉浸模式残留状态
     */
    clearImmersiveResidue: function () {
      var pageAgent = document.getElementById('page-agent');
      if (pageAgent) pageAgent.classList.remove('immersive-active');
      var container = document.getElementById('chat-container');
      if (container) container.classList.remove('immersive-active');
    },

    /**
     * 初始化各页面
     */
    initPages: function () {
      // 首页由 loadInitialPage 统一初始化（可能携带组件配置）
      if (window.MessagePage) MessagePage.init();
      if (window.ProfilePage) ProfilePage.init();
      if (window.PointsPage) PointsPage.init();
      if (window.OrdersPage) OrdersPage.init();
      if (window.AddressPage) AddressPage.init();
      if (window.AlbumPage) AlbumPage.init();
      if (window.AgentPage) AgentPage.initWithoutRestore();
      // 如果 URL 有 profileMenu 参数，重新渲染 profile 页面
      if (localStorage.getItem('fsj_profile_menu') && window.ProfilePage) {
        ProfilePage.renderSettingsList();
      }
    },

    /**
     * 跳转到订单页面（二级页面，不高亮任何 tab）
     */
    switchToOrders: function () {
      document.querySelectorAll('#app .page').forEach(function (p) {
        p.classList.remove('active');
      });
      var target = document.getElementById('page-orders');
      if (target) {
        target.classList.add('active');
      }
      // 清除所有 tab 的 active 状态
      document.querySelectorAll('#tab-bar .tab-item').forEach(function (tab) {
        tab.classList.remove('active');
      });
      // 隐藏底部导航栏
      var tabBar = document.getElementById('tab-bar');
      if (tabBar) tabBar.classList.add('hidden');
      // 每次进入订单页面都重新加载数据
      if (window.OrdersPage) {
        OrdersPage.loadOrders();
      }
      console.log('[App] 已跳转到订单页面');
    },

    /**
     * 跳转到积分商城页面（二级页面，不高亮任何 tab）
     */
    switchToPoints: function () {
      document.querySelectorAll('#app .page').forEach(function (p) {
        p.classList.remove('active');
      });
      var target = document.getElementById('page-points');
      if (target) {
        target.classList.add('active');
      }
      // 清除所有 tab 的 active 状态
      document.querySelectorAll('#tab-bar .tab-item').forEach(function (tab) {
        tab.classList.remove('active');
      });
      // 隐藏底部导航栏
      var tabBar = document.getElementById('tab-bar');
      if (tabBar) tabBar.classList.add('hidden');
      // 刷新积分商城数据
      if (window.PointsPage) PointsPage.init();
      console.log('[App] 已跳转到积分商城');
    },

    /**
     * 跳转到发布页面（二级页面，不高亮任何 tab）
     */
    /**
     * 打开底部悬浮窗（mode:"2" 的 tab 点击后调用）
     * @param {Object} sheetConfig - { title, items: [{name, page?, category?, url?}] }
     */
    openTabSheet: function (sheetConfig) {
      var self = this;
      if (!sheetConfig || !Array.isArray(sheetConfig.items) || sheetConfig.items.length === 0) return;
      if (document.querySelector('.org-sheet')) return; // 已打开则忽略

      // 遮罩
      var mask = document.createElement('div');
      mask.className = 'org-dropdown-mask';
      document.body.appendChild(mask);

      // 底部面板（复用 org-sheet 系列样式）
      var sheet = document.createElement('div');
      sheet.className = 'org-sheet';
      var html =
        '<div class="org-sheet-header">' +
          '<span class="org-sheet-title">' + (sheetConfig.title || '') + '</span>' +
          '<span class="org-sheet-close">×</span>' +
        '</div>' +
        '<div class="org-sheet-list">';
      sheetConfig.items.forEach(function (item) {
        var st = (item.style && typeof item.style === 'object' && !Array.isArray(item.style)) ? item.style : {};
        var styleAttr = '';
        if (st.bgColor) styleAttr += 'background:' + st.bgColor + ';';
        if (st.textColor) styleAttr += 'color:' + st.textColor + ';';
        if (st.borderRadius) styleAttr += 'border-radius:' + parseInt(st.borderRadius, 10) + 'px;';
        html += '<div class="org-dropdown-item tab-sheet-item"' + (styleAttr ? ' style="' + styleAttr + '"' : '') + '>' + (item.name || '') + '</div>';
      });
      html += '</div>';
      sheet.innerHTML = html;
      document.body.appendChild(sheet);

      // 进入动画
      setTimeout(function () {
        mask.classList.add('show');
        sheet.classList.add('show');
      }, 10);

      // 关闭（带退出动画）
      function closeSheet() {
        mask.classList.remove('show');
        sheet.classList.remove('show');
        setTimeout(function () { mask.remove(); sheet.remove(); }, 250);
      }

      mask.addEventListener('click', closeSheet);
      var closeBtn = sheet.querySelector('.org-sheet-close');
      if (closeBtn) closeBtn.addEventListener('click', closeSheet);

      // 选项点击：分发到对应页面
      sheet.querySelectorAll('.tab-sheet-item').forEach(function (el, index) {
        el.addEventListener('click', function () {
          var item = sheetConfig.items[index] || {};
          closeSheet();
          if (item.url && typeof item.url === 'string') {
            // 外部链接（取当前所在页作为 webview 返回来路）
            var activePage = document.querySelector('#app .page.active');
            var fromPage = activePage ? activePage.id.replace(/^page-/, '') : 'home';
            self.switchToWebview(item.url.match(/^https?:\/\//) ? item.url : 'https://' + item.url, fromPage);
          } else if (item.page === 'publish') {
            // 发布页（带默认分类）
            self.switchToPublish({ category: item.category || '' });
          } else if (item.page) {
            // 内置页面
            self.switchPage(self.pageMap[item.page] || item.page);
          }
        });
      });

      console.log('[App] 打开底部悬浮窗, 选项数:', sheetConfig.items.length);
    },

    /**
     * 切换到发布页面（二级页面，不高亮任何 tab）
     * @param {Object} [options] - { category?: string 默认分类 rowid }
     */
    switchToPublish: function (options) {
      options = options || {};
      document.querySelectorAll('#app .page').forEach(function (p) {
        p.classList.remove('active');
      });
      var target = document.getElementById('page-publish');
      if (target) {
        target.classList.add('active');
      }
      // 清除所有 tab 的 active 状态
      document.querySelectorAll('#tab-bar .tab-item').forEach(function (tab) {
        tab.classList.remove('active');
      });
      // 隐藏底部导航栏
      var tabBar = document.getElementById('tab-bar');
      if (tabBar) tabBar.classList.add('hidden');

      // 绑定返回按钮（只绑定一次）
      var backBtn = document.getElementById('publish-back-btn');
      if (backBtn && !backBtn._bound) {
        var self = this;
        backBtn._bound = true;
        backBtn.addEventListener('click', function () {
          self.switchPage('profile');
        });
      }

      // 初始化发布页面（传入默认分类）
      if (window.PublishPage) PublishPage.init({ category: options.category || '' });

      console.log('[App] 已跳转到发布页面, category:', options.category || '(默认)');
    },

    /**
     * 跳转到收货地址页面（二级页面，不高亮任何 tab）
     */
    switchToAddress: function () {
      document.querySelectorAll('#app .page').forEach(function (p) {
        p.classList.remove('active');
      });
      var target = document.getElementById('page-address');
      if (target) {
        target.classList.add('active');
      }
      // 清除所有 tab 的 active 状态
      document.querySelectorAll('#tab-bar .tab-item').forEach(function (tab) {
        tab.classList.remove('active');
      });
      // 隐藏底部导航栏
      var tabBar = document.getElementById('tab-bar');
      if (tabBar) tabBar.classList.add('hidden');
      // 刷新地址数据
      if (window.AddressPage) AddressPage.loadAddresses();
      console.log('[App] 已跳转到收货地址页面');
    },

    /**
     * 跳转到内容详情页面（二级页面，不高亮任何 tab）
     * @param {string} rowid - 内容 rowid
     * @param {string} prevPage - 返回时跳回的页面
     */
    switchToContentDetail: function (rowid, prevPage) {
      if (prevPage) localStorage.setItem('fsj_prev_page', prevPage);

      document.querySelectorAll('#app .page').forEach(function (p) {
        p.classList.remove('active');
      });
      var target = document.getElementById('page-content-detail');
      if (target) {
        target.classList.add('active');
      }
      // 清除所有 tab 的 active 状态
      document.querySelectorAll('#tab-bar .tab-item').forEach(function (tab) {
        tab.classList.remove('active');
      });
      // 隐藏底部导航栏
      var tabBar = document.getElementById('tab-bar');
      if (tabBar) tabBar.classList.add('hidden');

      // 加载内容详情
      if (window.ContentDetailPage) {
        ContentDetailPage.init();
        ContentDetailPage.loadContent(rowid);
      }
      console.log('[App] 已跳转到内容详情页面, rowid:', rowid);
    },

    /**
     * 显示底部导航栏
     */
    showTabBar: function () {
      var tabBar = document.getElementById('tab-bar');
      if (tabBar) tabBar.classList.remove('hidden');
    },

    /**
     * 加载 TabBar 配置
     */
    loadTabBarConfig: function () {
      var stored = localStorage.getItem('fsj_shangjia_tabs');
      var storedIcons = localStorage.getItem('fsj_shangjia_icons');
      var config;
      var self = this;
      try {
        config = stored ? JSON.parse(stored) : null;
        if (!Array.isArray(config)) config = null;
      } catch (e) {
        config = null;
      }
      if (!config) {
        config = this.defaultTabBar;
      }
      // 恢复图标缓存
      if (storedIcons) {
        try {
          var icons = JSON.parse(storedIcons);
          if (Array.isArray(icons)) this.iconCache = icons;
        } catch (e) {}
      }
      // 统一做 pageMap 映射
      config = config.map(function (item) {
        return {
          name: item.name,
          sort: item.sort,
          page: self.pageMap[item.page] || item.page,
          mode: item.mode,
          icon: item.icon || null,
          hideLabel: item.hide_label === true,
          style: (item.style && typeof item.style === 'object') ? item.style : null,
          // mode 0：内置 SPA 页（url 存组件配置）；mode 2：底部悬浮窗（url 存悬浮窗配置）；其余：外部 webview
          url: (item.mode === '0' || item.mode === 0 || item.mode === '2' || item.mode === 2)
            ? (typeof item.url === 'object' ? item.url : null)
            : (item.url ? (item.url.match(/^https?:\/\//) ? item.url : 'https://' + item.url) : null),
        };
      });
      this.renderTabBar(config);
    },

    /**
     * 渲染底部导航栏
     */
    renderTabBar: function (tabBarConfig) {
      var tabBar = document.getElementById('tab-bar');
      if (!tabBar) return;

      var self = this;
      var sorted = tabBarConfig.sort(function (a, b) {
        return parseInt(a.sort) - parseInt(b.sort);
      });

      this.tabBarConfig = sorted;

      tabBar.innerHTML = sorted.map(function (item, index) {
        var modeAttr = item.mode != null ? ' data-mode="' + item.mode + '"' : '';
        var urlAttr = item.url ? ' data-url="' + (typeof item.url === 'string' ? item.url : '[object Object]') + '"' : '';
        var iconAttr = item.icon ? ' data-icon="' + item.icon + '"' : '';
        var hideLabelAttr = item.hideLabel ? ' data-hide-label="1"' : '';
        var isFirst = index === 0;
        var labelHtml = item.hideLabel
          ? ''
          : '<span class="tab-label">' + item.name + '</span>';
        return '<div class="tab-item' + (isFirst ? ' active' : '') + '"' +
          ' data-page="' + item.page + '" data-tab-index="' + index + '"' + modeAttr + urlAttr + iconAttr + hideLabelAttr + '>' +
          '<div class="tab-icon-img"></div>' +
          labelHtml +
          '</div>';
      }).join('');

      // 为动态图标应用 URL
      this.applyTabIcons();

      // 应用 tab.style 自定义样式（注入 CSS 规则，含 .active 选中态）
      this.applyTabStyles(sorted);

      this.bindTabBar();
      console.log('[App] TabBar 已渲染:', sorted.map(function (i) { return i.name; }).join(', '));
    },

    /**
     * 为 TabBar 各 tab 应用图标（优先使用动态 URL，回退到 CSS mask）
     */
    applyTabIcons: function () {
      var self = this;
      var tabs = document.querySelectorAll('#tab-bar .tab-item');
      tabs.forEach(function (tab) {
        var iconEl = tab.querySelector('.tab-icon-img');
        if (!iconEl) return;
        var iconKey = tab.getAttribute('data-icon');
        var isActive = tab.classList.contains('active');
        var url = iconKey ? self.resolveIconUrl(iconKey, isActive) : null;
        if (url) {
          iconEl.style.webkitMaskImage = 'url(' + url + ')';
          iconEl.style.maskImage = 'url(' + url + ')';
        }
        // 否则走 CSS mask 回退（内置 icon 如 home/agent/message/profile）
      });
    },

    /**
     * 应用 tab.style 自定义样式
     * 以 data-tab-index 为锚点注入 <style> 规则；.active 规则交给 class 切换，无需逐处改内联样式
     */
    applyTabStyles: function (sorted) {
      var styleEl = document.getElementById('tab-style-overrides');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'tab-style-overrides';
        document.head.appendChild(styleEl);
      }
      var css = [];
      (sorted || []).forEach(function (item, index) {
        var st = (item.style && typeof item.style === 'object' && !Array.isArray(item.style)) ? item.style : {};
        if (!Object.keys(st).length) return;
        var base = '';
        if (st.bgColor) base += 'background:' + st.bgColor + ';';
        if (st.textColor) base += 'color:' + st.textColor + ';';
        if (st.borderRadius) base += 'border-radius:' + parseInt(st.borderRadius, 10) + 'px;';
        if (base) css.push('#tab-bar .tab-item[data-tab-index="' + index + '"]{' + base + '}');
        // 图标是 CSS mask 渲染，颜色走 background 而非 color，需单独覆盖
        if (st.textColor) {
          css.push('#tab-bar .tab-item[data-tab-index="' + index + '"] .tab-icon-img{background:' + st.textColor + ';}');
        }
        var active = '';
        if (st.activeBg) active += 'background:' + st.activeBg + ' !important;';
        if (st.activeText) active += 'color:' + st.activeText + ' !important;';
        if (active) {
          css.push('#tab-bar .tab-item[data-tab-index="' + index + '"].active .tab-icon-img{' + active + '}' +
            '#tab-bar .tab-item[data-tab-index="' + index + '"].active .tab-label{' + active + '}');
        }
      });
      styleEl.textContent = css.join('\n');
    },

    /**
     * 缓存商家图标资源
     * @param {Array} icons - 图标数组，每项包含 original_file_name 和 large_thumbnail_full_path
     */
    setIcons: function (icons) {
      this.iconCache = icons || [];
      localStorage.setItem('fsj_shangjia_icons', JSON.stringify(this.iconCache));
      console.log('[App] 已缓存图标:', this.iconCache.length, '个');
    },

    /**
     * 图标资源缓存
     */
    iconCache: [],

    /**
     * 根据 tab 配置解析图标 URL
     * @param {string} iconKey - tab 的 icon 字段，如 "home", "hezi"
     * @param {boolean} selected - 是否选中状态
     * @returns {string|null} 图标 URL 或 null
     */
    resolveIconUrl: function (iconKey, selected) {
      if (!iconKey || !this.iconCache || !this.iconCache.length) return null;
      var suffix = selected ? '1' : '0';
      var targetName = iconKey + suffix;
      for (var i = 0; i < this.iconCache.length; i++) {
        var icon = this.iconCache[i];
        if (icon.original_file_name && icon.original_file_name.indexOf(targetName) !== -1) {
          return icon.large_thumbnail_full_path;
        }
      }
      return null;
    },

    /**
     * 更新 TabBar 配置（登录后调用）
     * @param {Array} shangjia - tab 配置数组
     * @param {Array} icons - 图标资源数组（可选）
     */
    updateTabBar: function (shangjia, icons) {
      if (!shangjia || !shangjia.length) return;

      // 先保存图标
      if (icons && Array.isArray(icons)) {
        this.setIcons(icons);
      }

      var self = this;
      var mapped = shangjia.map(function (item) {
        return {
          name: item.name,
          sort: item.sort,
          page: self.pageMap[item.page] || item.page,
          mode: item.mode,
          icon: item.icon || null,
          style: (item.style && typeof item.style === 'object') ? item.style : null,
          // mode 0：内置 SPA 页（url 存组件配置）；mode 2：底部悬浮窗（url 存悬浮窗配置）；其余：外部 webview
          url: (item.mode === '0' || item.mode === 0 || item.mode === '2' || item.mode === 2)
            ? (typeof item.url === 'object' ? item.url : null)
            : (item.url ? (item.url.match(/^https?:\/\//) ? item.url : 'https://' + item.url) : null),
        };
      });

      localStorage.setItem('fsj_shangjia_tabs', JSON.stringify(mapped));
      this.renderTabBar(mapped);
    },

    /**
     * 初始加载：判断是否登录，决定显示哪个页面
     */
    loadInitialPage: function () {
      var token = localStorage.getItem('fsj_token');
      var firstItem = this.tabBarConfig[0];
      var page = token && firstItem ? firstItem.page : 'profile';
      console.log('[App] 初始页面:', page, '已登录:', !!token);

      if (token && firstItem && firstItem.url) {
        // url 是对象 → 内置 SPA 页面 + 组件配置
        if (typeof firstItem.url === 'object') {
          this.switchPage(firstItem.page);
          if (firstItem.page === 'home' && window.HomePage) {
            HomePage.init(firstItem.url);
          }
        } else {
          this.switchToWebview(firstItem.url);
        }
      } else {
        this.switchPage(page);
      }
    },

    /**
     * 绑定 tab 点击
     */
    bindTabBar: function () {
      var self = this;
      var tabs = document.querySelectorAll('#tab-bar .tab-item');
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          var page = tab.getAttribute('data-page');
          var tabIndex = parseInt(tab.getAttribute('data-tab-index'));
          var tabConfig = self.tabBarConfig[tabIndex] || {};
          var url = tabConfig.url;
          var mode = tabConfig.mode;

          // mode 2 → 弹出底部悬浮窗（不跳转）
          if ((mode === '2' || mode === 2) && url && typeof url === 'object' && Array.isArray(url.items)) {
            self.openTabSheet(url);
            return;
          }

          // url 是对象 → 内置 SPA 页面 + 组件配置（传入 HomePage）
          if (typeof url === 'object' && url !== null) {
            self.switchPage(page);
            if (page === 'home' && window.HomePage) {
              HomePage.init(url);
            }
          } else if (page === 'publish') {
            // 发布页面（二级页面）
            self.switchToPublish();
          } else if (url) {
            // url 是字符串 → 外部 webview
            self.switchToWebview(url);
          } else {
            self.switchPage(page);
          }
        });
      });
    },

    /**
     * 切换到内嵌网页
     * @param {string} url 外部页面地址
     * @param {string} [fromPage] 来路页面（二级入口必传，如 'home'）；tab 直切不传 → 隐藏返回按钮
     */
    switchToWebview: function (url, fromPage) {
      // 防御（2026-09-05）：拒绝把应用自身嵌进 webview iframe——会造成每 300ms 一次的
      // 无限镜像重载（实测），打断登录等所有进行中的请求
      if (typeof url === 'string' && /index\.html/.test(url)) {
        console.error('[App] 拒绝自引用 webview 地址（防止无限镜像）:', url);
        return;
      }
      // 恢复底部导航栏
      this.showTabBar();

      // 顶栏返回按钮：tab 直切（fromPage 为空）= 根页面无返回；二级入口 = 显示返回 + 记录来路
      var backBtn = document.getElementById('webview-back-btn');
      var titleEl = document.getElementById('webview-title');
      this._webviewFrom = fromPage || null;
      if (backBtn) {
        backBtn.style.display = this._webviewFrom ? '' : 'none';
        if (!this._webviewBackBound) {
          this._webviewBackBound = true;
          var appSelf = this;
          backBtn.addEventListener('click', function () {
            // 回到来源页；iframe 不清空，外部页保留在后台（支付等 postMessage 流程依赖）
            appSelf.switchPage(appSelf._webviewFrom || 'home');
          });
        }
      }
      if (titleEl) {
        var host = '';
        try { host = new URL(url).hostname; } catch (e) {}
        titleEl.textContent = host || '外部页面';
      }

      document.querySelectorAll('#app .page').forEach(function (p) {
        p.classList.remove('active');
      });

      var webviewPage = document.getElementById('page-webview');
      if (webviewPage) {
        webviewPage.classList.add('active');
        var iframe = document.getElementById('webview-iframe');
        var self = this;
        if (iframe) {
          // 直接拼接用户身份到 URL hash（从 localStorage 读取）
          var openid = localStorage.getItem('fsj_openid') || '';
          var shangjiaRowid = localStorage.getItem('fsj_shangjia_rowid') || '';
          var userBalance = localStorage.getItem('fsj_user_balance') || '';
          var userName = '';
          var storedInfo = localStorage.getItem('fsj_user_info');
          if (storedInfo) {
            try { userName = JSON.parse(storedInfo).name || ''; } catch (e) {}
          }
          var cleanUrl = url.replace(/#.*$/, '').replace(/\?.*$/, '');
          var queryStart = url.indexOf('?');
          var queryString = queryStart > -1 ? url.substring(queryStart) : '';
          var hash = '#fsj_openid=' + openid + '&fsj_user=' + encodeURIComponent(userName) + '&fsj_shangjia=' + shangjiaRowid + '&fsj_balance=' + userBalance;
          iframe.src = cleanUrl + queryString + hash;
          console.log('[App] switchToWebview: openid=', openid || '(空)', ', url=', iframe.src);

          // onload 后检查登录是否完成
          iframe.onload = function () {
            // 传递用户身份给 iframe（postMessage 方式）
            var openid3 = localStorage.getItem('fsj_openid') || '';
            var shangjiaRowid3 = localStorage.getItem('fsj_shangjia_rowid') || '';
            var storedInfo3 = localStorage.getItem('fsj_user_info');
            var userName3 = '';
            var userId3 = '';
            if (storedInfo3) {
              try {
                var info = JSON.parse(storedInfo3);
                userName3 = info.name || '';
                userId3 = info.rowid || '';
              } catch (e) {}
            }
            try {
              var iframeWindow = iframe.contentWindow;
              if (iframeWindow) {
                iframeWindow.postMessage({
                  type: 'fsj:userData',
                  data: {
                    openid: openid3,
                    userId: userId3,
                    userName: userName3,
                    shangjiaRowid: shangjiaRowid3
                  }
                }, '*');
                console.log('[App] 已通过 postMessage 传递用户身份给 iframe');
              }
            } catch (e) {
              console.log('[App] postMessage 传递用户身份失败:', e.message);
            }

            setTimeout(function () {
              var openid2 = localStorage.getItem('fsj_openid') || '';
              if (openid2 && !openid) {
                // iframe 加载时 openid 为空，但现在 localStorage 已有值 → 登录完成了
                console.log('[App] iframe onload: 登录完成，更新 identity');
                var cleanUrl2 = url.replace(/#.*$/, '').replace(/\?.*$/, '');
                var queryStart2 = url.indexOf('?');
                var queryString2 = queryStart2 > -1 ? url.substring(queryStart2) : '';
                var storedInfo2 = localStorage.getItem('fsj_user_info');
                var userName2 = '';
                if (storedInfo2) {
                  try { userName2 = JSON.parse(storedInfo2).name || ''; } catch (e) {}
                }
                var hash2 = '#fsj_openid=' + openid2 + '&fsj_user=' + encodeURIComponent(userName2) + '&fsj_shangjia=' + localStorage.getItem('fsj_shangjia_rowid') + '&fsj_balance=' + (localStorage.getItem('fsj_user_balance') || '');
                iframe.src = cleanUrl2 + queryString2 + hash2;
              }
            }, 1000);
          };
        }
      }

      document.querySelectorAll('#tab-bar .tab-item').forEach(function (tab) {
        tab.classList.toggle('active', tab.getAttribute('data-url') === url);
      });

      // 更新图标选中状态
      this.applyTabIcons();

      console.log('[App] 切换到 webview:', url);
    },

    /**
     * 向 iframe 传递用户身份数据（已废弃，改用 hash 参数）
     */
    postUserDataToIframe: function (iframe) {
      // 保留兼容性，实际不再使用
    },

    _sendToIframe: function (iframe, payload) {
      // 保留兼容性，实际不再使用
    },

    /**
     * 切换页面
     */
    switchPage: function (pageKey) {
      // 恢复底部导航栏
      this.showTabBar();

      // 切换页面 active
      document.querySelectorAll('#app .page').forEach(function (p) {
        p.classList.remove('active');
      });
      var target = document.getElementById('page-' + pageKey);
      if (target) {
        target.classList.add('active');
      }

      // 切换 tab active
      document.querySelectorAll('#tab-bar .tab-item').forEach(function (tab) {
        var tp = tab.getAttribute('data-page');
        tab.classList.toggle('active', tp === pageKey);
      });

      // 更新图标选中状态
      this.applyTabIcons();

      // 切换到"我的"页面时，从后端刷新用户数据
      if (pageKey === 'profile' && window.ProfilePage) {
        ProfilePage.refreshUserInfo();
      }

      console.log('[App] 页面已切换到:', pageKey);
    },

    /**
     * 处理登录结果
     */
    handleLoginResult: function (loginData) {
      console.log('[App] handleLoginResult 被调用, loginData:', JSON.stringify(loginData));
      // 保存登录信息
      if (loginData.rowid) localStorage.setItem('fsj_token', loginData.rowid);
      if (loginData.openid) localStorage.setItem('fsj_openid', loginData.openid);
      if (loginData.name) localStorage.setItem('fsj_user_name', loginData.name);
      if (loginData.icons) localStorage.setItem('fsj_shangjia_icons', JSON.stringify(loginData.icons));
      if (loginData.agent) localStorage.setItem('fsj_agent_id', loginData.agent);
      if (loginData.shuohua) localStorage.setItem('fsj_shuohua_id', loginData.shuohua);
      if (loginData.bushuohua) localStorage.setItem('fsj_bushuohua_id', loginData.bushuohua);
      if (loginData.jifen !== undefined) localStorage.setItem('fsj_user_points', String(loginData.jifen));
      if (loginData.yue !== undefined) localStorage.setItem('fsj_user_balance', String(loginData.yue));

      // 自定义菜单来自商家配置（config.wode），不从登录返回的数据获取
      // 只在明确传入了 profileMenu 时才更新（兼容旧接口）
      if (loginData.profileMenu && Array.isArray(loginData.profileMenu) && loginData.profileMenu.length > 0) {
        localStorage.setItem('fsj_profile_menu', JSON.stringify(loginData.profileMenu));
      }

      // 更新底部导航栏：只更新图标，不覆盖已有 tab 配置
      if (loginData.icons && Array.isArray(loginData.icons)) {
        this.setIcons(loginData.icons);
        this.applyTabIcons();
      }

      // 更新"我的"页面用户信息（调用 ProfilePage.renderUserCard 从 fsj_user_info 读取真实头像）
      if (window.ProfilePage) {
        ProfilePage.renderUserCard();
      } else {
        var userCard = document.getElementById('profile-user-card');
        if (userCard) {
          // 审核期间不显示头像
          var shenhe = localStorage.getItem('fsj_shenhe') || '';
          var avatarHtml = '';
          if (shenhe !== '1') {
            avatarHtml = '<div class="avatar">👤</div>';
            try {
              var storedInfo = localStorage.getItem('fsj_user_info');
              if (storedInfo) {
                var parsed = JSON.parse(storedInfo);
                if (parsed && parsed.avatar && (parsed.avatar.startsWith('http') || parsed.avatar.startsWith('data:'))) {
                  avatarHtml = '<div class="avatar"><img src="' + parsed.avatar + '" alt="avatar" /></div>';
                }
              }
            } catch (e) {}
          }
          userCard.innerHTML =
            avatarHtml +
            '<div class="nickname">' + (loginData.name || '用户') + '</div>' +
            '<div class="role">已登录</div>';
        }
      }

      // 更新智能体页面
      if (window.AgentPage) {
        AgentPage.renderAgentTopBar();
        if (localStorage.getItem('fsj_agent_mode') === '1') {
          AgentPage.videoResources = null;
          AgentPage.loadVideoResources();
        }
      }

      console.log('[App] 登录成功:', loginData.name);

      // 刷新 iframe hash，传递新的用户身份
      this.refreshIframeHash();
    },

    /**
     * 刷新 iframe URL 的 hash 参数（登录后调用）
     */
    refreshIframeHash: function () {
      var iframe = document.getElementById('webview-iframe');
      if (!iframe) {
        console.log('[App] refreshIframeHash: iframe 不存在，先切换到 webview 页面');
        var self = this;
        // 切换到 webview 页面会创建 iframe
        var firstTab = this.tabBarConfig[0];
        if (firstTab && firstTab.url) {
          this.switchToWebview(firstTab.url);
          // 等 iframe 创建后再刷新 hash
          setTimeout(function () { self.refreshIframeHash(); }, 500);
        }
        return;
      }
      if (!iframe.src) {
        console.log('[App] refreshIframeHash: iframe.src 为空，500ms后重试');
        var self = this;
        setTimeout(function () { self.refreshIframeHash(); }, 500);
        return;
      }

      var openid = localStorage.getItem('fsj_openid') || '';
      var shangjiaRowid = localStorage.getItem('fsj_shangjia_rowid') || '';
      var userName = '';
      var userBalance = localStorage.getItem('fsj_user_balance') || '';
      var storedInfo = localStorage.getItem('fsj_user_info');
      if (storedInfo) {
        try { userName = JSON.parse(storedInfo).name || ''; } catch (e) {}
      }

      console.log('[App] refreshIframeHash: openid=', openid, ', userName=', userName, ', shangjia=', shangjiaRowid, ', balance=', userBalance);

      if (!openid) {
        console.log('[App] refreshIframeHash: openid 为空，跳过');
        return;
      }

      var hash = 'fsj_openid=' + openid + '&fsj_user=' + encodeURIComponent(userName) + '&fsj_shangjia=' + shangjiaRowid + '&fsj_balance=' + userBalance;

      // 同域 iframe 直接设置 hash（不触发页面重载，只触发 hashchange）
      iframe.contentWindow.location.hash = '#' + hash;
      console.log('[App] refreshIframeHash: 已刷新 iframe hash');
    }
  };

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      App.init();
    });
  } else {
    App.init();
  }

  // bfcache 恢复：手机浏览器切回来时重新初始化
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      App.clearImmersiveResidue();
      var tabBar = document.getElementById('tab-bar');
      if (tabBar) tabBar.style.display = '';
      App.init();
    }
  });

  window.App = App;
})();

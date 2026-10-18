/**
 * 登录服务
 * 调用 Dify 登录 API 获取用户信息
 */
var LoginService = {
  /**
   * 登录 API 配置
   */
  config: {
    url: 'https://dify.100000whys.cn/v1/workflows/run',
    token: 'app-jVwBLG5TYgdPk14IRSYaUDSD',
  },

  /**
   * 账号密码登录（2026-09-05 重写：直查用户表 + 前端比对密码）
   * 逻辑（东城拍板）：
   *   1. 服务端按 shangjia（商家 rowid，Relation 24 过滤，实测可靠）拉该商家全部用户
   *   2. 客户端匹配 dianhua === 输入手机号 → 无则「该手机号未注册」
   *   3. 比对 mima === 输入密码 → 不符「密码错误」；相符返回用户数据
   * 注：文本类字段（dianhua）的 HAP 服务端过滤实测全部无效，故电话/密码在客户端比对。
   * @param {string} phone - 手机号
   * @param {string} password - 密码
   * @param {string} shangjia - 商家ID
   * @returns {Promise<object>} 登录结果 { name, rowid, shangjia, agent, shuohua, bushuohua, jifen, yue, mrshdz, touxiang }
   */
  accountLogin: function (phone, password, shangjia) {
    var USER_WS = '69b0077358322d512e60bad0';
    var CONTROLS = ['rowid', 'nickname', 'dianhua', 'mima', 'shangjia',
                    'jifen', 'yue', 'mrshdz', 'mragent', 'shuohua', 'bushuohua', 'avatar'];
    var dbg = function (msg) {
      console.log('[登录调试] ' + msg);
      if (typeof window.logDebug === 'function') window.logDebug('[登录] ' + msg);
    };

    dbg('开始账号登录：phone=' + phone + ' | password=' + password + ' | shangjia=' + (shangjia || '(空!)'));

    var input = {
      worksheetId: USER_WS,
      pageSize: 200, pageIndex: 1, listType: 0,
      controls: CONTROLS,
      // 2026-09-06 实测：文本 filterType=2 是精确等于（可靠），电话由服务端直接过滤，只回匹配的 1 条
      filters: [
        { controlId: 'shangjia', dataType: 29, spliceType: 1, filterType: 24, value: shangjia || '' },
        { controlId: 'dianhua', dataType: 2, spliceType: 1, filterType: 2, value: String(phone).trim() }
      ]
    };

    var call = function (useProxy) {
      var url = useProxy ? 'https://100000whys.cn/mingdao' : 'https://api.mingdao.com/v2/open/worksheet/getFilterRows';
      dbg('请求 ' + (useProxy ? 'Node代理' : '直连HAP') + '：' + url);
      dbg('请求体: ' + JSON.stringify(input));
      return fetch(url, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(useProxy
          ? { url: 'https://api.mingdao.com/v2/open/worksheet/getFilterRows', input: input }
          : Object.assign({
              appKey: 'c156d7e78368cbc1',
              sign: 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ=='
            }, input))
      }).then(function (res) {
        dbg('响应 HTTP ' + res.status);
        if (!res.ok) throw new Error('查询请求失败: ' + res.status);
        return res.json();
      });
    };

    return call(true)
      .catch(function (e) {
        dbg('代理失败 → 切直连兜底：' + e.message);
        return call(false);
      })
      .then(function (parsed) {
        if (!parsed || !parsed.success) {
          dbg('❌ 查询失败: ' + JSON.stringify(parsed).slice(0, 200));
          throw new Error('用户查询失败');
        }
        var rows = (parsed.data && parsed.data.rows) || [];
        dbg('查询成功：total=' + (parsed.data && parsed.data.total) + '，本页 ' + rows.length + ' 个用户');
        rows.slice(0, 10).forEach(function (r, i) {
          dbg('  用户[' + i + '] rowid=' + String(r.rowid || '').slice(0, 8) +
              ' dianhua=' + JSON.stringify(r.dianhua) +
              ' mima=' + JSON.stringify(r.mima) +
              ' nickname=' + JSON.stringify(r.nickname));
        });
        if (rows.length > 10) dbg('  …其余 ' + (rows.length - 10) + ' 条省略');

        var hit = rows[0] || null;   // 服务端已按 dianhua 精确过滤
        if (!hit) {
          dbg('❌ 未命中：没有 dianhua === "' + phone + '" 的用户（共比对 ' + rows.length + ' 条）');
          throw new Error('该手机号未注册');
        }
        dbg('✓ 找到用户：' + (hit.nickname || '') + ' rowid=' + hit.rowid);
        var stored = String(hit.mima || '');
        var typed = String(password).trim();
        if (stored !== typed) {
          dbg('❌ 密码不符：库里 mima=' + JSON.stringify(stored) + ' vs 输入=' + JSON.stringify(typed));
          throw new Error('密码错误');
        }
        dbg('✅ 密码匹配，登录成功');

        var touxiang = '';
        try {
          var av = typeof hit.avatar === 'string' ? JSON.parse(hit.avatar) : hit.avatar;
          if (Array.isArray(av) && av[0]) {
            touxiang = av[0].large_thumbnail_full_path || av[0].thumbnail_full_path || '';
          }
        } catch (e) { /* 保持空 */ }

        return {
          name: hit.nickname || '用户',
          rowid: hit.rowid,
          shangjia: shangjia || '',
          agent: hit.mragent || '',
          shuohua: hit.shuohua || null,
          bushuohua: hit.bushuohua || null,
          jifen: Number(hit.jifen) || 0,
          yue: Number(hit.yue) || 0,
          mrshdz: hit.mrshdz || '',
          touxiang: touxiang
        };
      });
  },

  /**
   * 微信登录
   * @param {string} openid - 微信 openid
   * @param {string} shangjia - 商家ID
   * @returns {Promise<object>} 登录结果
   */
  wxLogin: function (openid, shangjia) {
    return this._doLogin(openid, shangjia || '');
  },

  /**
   * 执行登录请求
   * @param {string} userKey - 用户标识（openid 或 手机号）
   * @param {string} shangjia - 商家ID
   * @returns {Promise<object>} 登录结果
   */
  _doLogin: function (userKey, shangjia) {
    var self = this;
    var cfg = this.config;

    var body = {
      inputs: {
        openid: userKey,
        shangjia: shangjia,
      },
      response_mode: 'blocking',
      user: userKey,
    };

    return fetch(cfg.url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('登录请求失败: ' + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        return self._parseResult(data);
      });
  },

  /**
   * 解析 Dify 登录结果
   * @param {object} data - Dify 响应体
   * @returns {object} 登录结果 { name, rowid, shangjia, agent, shuohua, bushuohua }
   */
  _parseResult: function (data) {
    var outputs = data.data ? data.data.outputs : null;
    if (!outputs) {
      throw new Error('登录失败，未获取到用户信息');
    }

    var result = {
      name: outputs.name ? outputs.name.output : '',
      rowid: outputs.rowid ? outputs.rowid.output : '',
      agent: outputs.agent || null,
      shuohua: outputs.shuohua || null,
      bushuohua: outputs.bushuohua || null,
      jifen: outputs.jifen || null,
      yue: outputs.yue || null,
      mrshdz: outputs.mrshdz || null,
      touxiang: outputs.touxiang || null,
    };

    // 检查是否登录失败（rowid 为空）
    if (!result.rowid) {
      throw new Error('登录失败，请检查手机号、密码和商家ID是否正确');
    }

    // shangjia 可能是 JSON 字符串，需要额外解析（兼容旧调用方）
    if (typeof result.shangjia === 'string') {
      try {
        result.shangjia = JSON.parse(result.shangjia);
      } catch (e) {
        result.shangjia = [];
      }
    }

    // agent 字段保存（可能是字符串或对象）
    if (result.agent) {
      result.agent = result.agent.toString();
    }

    return result;
  },
};

/**
 * 收货地址页面
 * 功能：查看、新增、编辑、删除收货地址
 * 数据结构：商家自定义三级地址（如学校/楼栋/寝室）+ 用户自定义
 */
(function () {
  'use strict';

  var AddressPage = {
    // 状态
    addresses: [],
    addressLevels: { l1: [], l2: [], l3: [] },
    levelNames: { l1: '一级地址', l2: '二级地址', l3: '三级地址' },
    editingId: null,

    // DOM
    backBtn: null,
    addBtn: null,
    addressList: null,
    addressEmpty: null,
    modal: null,
    modalClose: null,
    modalCancel: null,
    modalConfirm: null,

    // 表单元素
    phoneInput: null,
    l1Select: null,
    l2Select: null,
    l3Select: null,
    detailInput: null,

    init: function () {
      this.backBtn = document.getElementById('address-back-btn');
      this.addBtn = document.getElementById('address-add-btn');
      this.addressList = document.getElementById('address-list');
      this.addressEmpty = document.getElementById('address-empty');
      this.modal = document.getElementById('address-modal');
      this.modalClose = document.getElementById('address-modal-close');
      this.modalCancel = document.getElementById('address-modal-cancel');
      this.modalConfirm = document.getElementById('address-modal-confirm');

      this.phoneInput = document.getElementById('addr-phone');
      this.l1Select = document.getElementById('addr-l1-select');
      this.l2Select = document.getElementById('addr-l2-select');
      this.l3Select = document.getElementById('addr-l3-select');
      this.detailInput = document.getElementById('addr-detail');

      if (!this.addressList) {
        console.error('[Address] addressList 不存在，跳过初始化');
        return;
      }

      this.bindEvents();
      this.bindLoginChange();
      this.loadAddressLevels();
      this.loadAddresses();
    },

    bindEvents: function () {
      var self = this;

      // 返回按钮
      if (this.backBtn) {
        this.backBtn.addEventListener('click', function () {
          self._backToProfile();
        });
      }

      // 新增按钮
      if (this.addBtn) {
        console.log('[Address] 新增按钮找到，绑定事件');
        this.addBtn.addEventListener('click', function () {
          console.log('[Address] 新增按钮被点击');
          self.openAddModal();
        });
      } else {
        console.warn('[Address] 未找到新增按钮元素 #address-add-btn');
      }

      // 弹窗关闭
      if (this.modalClose) {
        this.modalClose.addEventListener('click', function () { self.closeModal(); });
      }
      // 点击背景关闭
      if (this.modal) {
        this.modal.addEventListener('click', function (e) {
          if (e.target === self.modal) self.closeModal();
        });
      }
      if (this.modalCancel) {
        this.modalCancel.addEventListener('click', function () { self.closeModal(); });
      }
      if (this.modalConfirm) {
        this.modalConfirm.addEventListener('click', function () { self.saveAddress(); });
      }
    },

    /**
     * 监听登录状态变化
     */
    bindLoginChange: function () {
      var self = this;
      window.addEventListener('wechatlogin:change', function (e) {
        var detail = e.detail;
        if (detail.type === 'login' || detail.type === 'restore') {
          self.loadAddresses();
        } else if (detail.type === 'logout') {
          self.addresses = [];
          self.defaultAddressRowid = '';
          self.renderAddresses();
        }
      });
    },

    // ========== 数据加载 ==========

    /**
     * 加载商家自定义的地址级别选项
     */
    loadAddressLevels: function () {
      var self = this;
      var shangjiaRowid = FsjApi.getShangjiaRowid();
      if (!shangjiaRowid) {
        console.log('[Address] 无 shangjiaRowid，跳过地址级别加载');
        return;
      }

      console.log('[Address] 正在加载商家地址级别选项, shangjiaRowid:', shangjiaRowid);

      Promise.all([
        FsjApi.getAddressLevel('zdyyjdz', shangjiaRowid),
        FsjApi.getAddressLevel('zdyejdz', shangjiaRowid),
        FsjApi.getAddressLevel('zdysjdz', shangjiaRowid)
      ]).then(function (results) {
        self.addressLevels.l1 = results[0] || [];
        self.addressLevels.l2 = results[1] || [];
        self.addressLevels.l3 = results[2] || [];

        console.log('[Address] 地址级别加载完成:');
        console.log('[Address] L1 数据:', JSON.stringify(self.addressLevels.l1));
        console.log('[Address] L2 数据:', JSON.stringify(self.addressLevels.l2));
        console.log('[Address] L3 数据:', JSON.stringify(self.addressLevels.l3));

        // 如果商家配置了自定义名称，更新标签
        if (self.addressLevels.l1.length > 0 && self.addressLevels.l1[0]._levelName) {
          self.levelNames.l1 = self.addressLevels.l1[0]._levelName;
        }
        if (self.addressLevels.l2.length > 0 && self.addressLevels.l2[0]._levelName) {
          self.levelNames.l2 = self.addressLevels.l2[0]._levelName;
        }
        if (self.addressLevels.l3.length > 0 && self.addressLevels.l3[0]._levelName) {
          self.levelNames.l3 = self.addressLevels.l3[0]._levelName;
        }

        self._updateLevelLabels();
      }).catch(function (err) {
        console.warn('[Address] 加载地址级别失败:', err);
      });
    },

    /**
     * 加载用户的收货地址列表
     */
    loadAddresses: function () {
      var self = this;
      var shangjiaRowid = FsjApi.getShangjiaRowid();

      // 未登录时直接显示空列表
      var token = localStorage.getItem('fsj_token');
      if (!token) {
        this.addresses = [];
        this.defaultAddressRowid = '';
        this.renderAddresses();
        return;
      }

      console.log('[Address] 加载收货地址, shangjiaRowid:', shangjiaRowid ? '有' : '无');

      if (!shangjiaRowid) {
        this.renderAddresses();
        return;
      }

      // 同时获取地址列表和默认地址 rowid
      Promise.all([
        FsjApi.getAddresses(shangjiaRowid),
        FsjApi.getUserDefaultAddressRowid()
      ]).then(function (results) {
        self.addresses = results[0] || [];
        self.defaultAddressRowid = results[1] || '';
        console.log('[Address] 地址列表加载完成, 数量:', self.addresses.length);
        console.log('[Address] 默认地址 rowid:', self.defaultAddressRowid || '无');
        self.renderAddresses();
      }).catch(function (err) {
        console.error('[Address] 加载地址列表失败:', err);
        self.renderAddresses();
      });
    },

    // ========== 渲染 ==========

    /**
     * 更新表单中的级别标签
     */
    _updateLevelLabels: function () {
      var l1Label = document.getElementById('addr-l1-label');
      var l2Label = document.getElementById('addr-l2-label');
      var l3Label = document.getElementById('addr-l3-label');
      if (l1Label) l1Label.textContent = this.levelNames.l1;
      if (l2Label) l2Label.textContent = this.levelNames.l2;
      if (l3Label) l3Label.textContent = this.levelNames.l3;
    },

    /**
     * 渲染收货地址列表
     */
    renderAddresses: function () {
      var self = this;

      if (!this.addresses || this.addresses.length === 0) {
        this.addressList.style.display = 'none';
        this.addressEmpty.style.display = '';
        return;
      }

      this.addressEmpty.style.display = 'none';
      this.addressList.style.display = '';

      // 默认地址排在最前面
      var defaultRowid = this.defaultAddressRowid || '';
      var sorted = this.addresses.slice().sort(function (a, b) {
        if (a.id === defaultRowid && b.id !== defaultRowid) return -1;
        if (a.id !== defaultRowid && b.id === defaultRowid) return 1;
        return 0;
      });

      this.addressList.innerHTML = sorted.map(function (addr) {
        var addressText = self._buildAddressText(addr);
        var isDefault = addr.id === defaultRowid;

        return '<div class="address-card" data-id="' + addr.id + '">' +
          '<div class="address-card-main">' +
            '<div class="address-card-header">' +
              '<span class="address-card-name">' + (addr.name || '') + '</span>' +
              '<span class="address-card-phone">' + (addr.phone || '') + '</span>' +
              (isDefault ? '<span class="address-default-tag">默认</span>' : '') +
            '</div>' +
            '<div class="address-card-detail">' + addressText + '</div>' +
          '</div>' +
          '<div class="address-card-actions">' +
            (isDefault ? '<span class="address-default-label">默认地址</span>' : '<button class="address-btn-default" data-id="' + addr.id + '">设为默认</button>') +
            '<div class="address-actions-right">' +
              '<button class="address-btn-edit" data-id="' + addr.id + '">编辑</button>' +
              '<button class="address-btn-delete" data-id="' + addr.id + '">删除</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      // 绑定设为默认事件
      var defaultBtns = this.addressList.querySelectorAll('.address-btn-default');
      defaultBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-id');
          self.setDefaultAddress(id);
        });
      });

      // 绑定编辑/删除事件
      var editBtns = this.addressList.querySelectorAll('.address-btn-edit');
      editBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-id');
          self.openEditModal(id);
        });
      });

      var deleteBtns = this.addressList.querySelectorAll('.address-btn-delete');
      deleteBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-id');
          self.deleteAddress(id);
        });
      });
    },

    /**
     * 拼接地址显示文本
     */
    _buildAddressText: function (addr) {
      var parts = [];
      if (addr.addressFull) {
        return addr.addressFull;
      }
      if (addr.level1) parts.push(addr.level1);
      if (addr.level2) parts.push(addr.level2);
      if (addr.level3) parts.push(addr.level3);
      if (addr.detail) parts.push(addr.detail);
      return parts.join(' ') || '未填写详细地址';
    },

    // ========== 弹窗操作 ==========

    /**
     * 打开新增弹窗
     */
    openAddModal: function () {
      // 确保 modal 已获取（防止 init 未完成）
      if (!this.modal) {
        this.modal = document.getElementById('address-modal');
      }
      if (!this.modal) {
        console.error('[Address] 弹窗 DOM 未找到');
        return;
      }
      console.log('[Address] openAddModal 被调用');
      this.editingId = null;
      document.getElementById('address-modal-title').textContent = '新增收货地址';
      this._resetForm();
      this._populateSelects();
      this._updateLevelLabels();
      this.modal.style.display = 'flex';
      console.log('[Address] 弹窗已显示, display=' + this.modal.style.display);
    },

    /**
     * 打开编辑弹窗
     */
    openEditModal: function (id) {
      var addr = this.addresses.find(function (a) { return a.id === id; });
      if (!addr) return;

      this.editingId = id;
      document.getElementById('address-modal-title').textContent = '编辑收货地址';
      this._resetForm();
      this._updateLevelLabels();

      // 填充表单
      this.phoneInput.value = addr.phone || '';
      this.detailInput.value = addr.detail || '';

      // 先填充下拉选项，再设置选中值
      this._populateSelects();

      // 设置各级地址选中值（用 rowid 匹配）
      var self = this;
      ['l1', 'l2', 'l3'].forEach(function (level, index) {
        var n = index + 1;
        var rowid = addr['level' + n + 'Rowid'] || '';
        var select = self['l' + n + 'Select'];
        if (!select || !rowid) return;

        // 确认 rowid 在选项中存在
        var options = select.querySelectorAll('option');
        var found = false;
        for (var i = 0; i < options.length; i++) {
          if (options[i].value === rowid) { found = true; break; }
        }

        if (found) {
          select.value = rowid;
        }
      });

      this.modal.style.display = 'flex';
    },

    /**
     * 关闭弹窗
     */
    closeModal: function () {
      this.modal.style.display = 'none';
      this.editingId = null;
    },

    /**
     * 重置表单
     */
    _resetForm: function () {
      if (this.phoneInput) this.phoneInput.value = '';
      if (this.detailInput) this.detailInput.value = '';
      var self = this;
      ['l1', 'l2', 'l3'].forEach(function (level, index) {
        var n = index + 1;
        var sel = self['l' + n + 'Select'];
        if (sel) sel.value = '';
      });
    },

    /**
     * 填充下拉选项（value 用 rowid，因为关联记录需要填 rowid）
     */
    _populateSelects: function () {
      var self = this;
      ['l1', 'l2', 'l3'].forEach(function (level, index) {
        var n = index + 1;
        var select = self['l' + n + 'Select'];
        if (!select) return;
        var levels = self.addressLevels[level] || [];
        select.innerHTML = '<option value="">请选择</option>';
        levels.forEach(function (item) {
          var opt = document.createElement('option');
          opt.value = item.id;  // 填 rowid
          opt.textContent = item.name;
          opt.setAttribute('data-name', item.name);
          select.appendChild(opt);
        });
      });
    },

    // ========== 保存/删除 ==========

    /**
     * 保存地址
     */
    saveAddress: function () {
      var self = this;
      var phone = this.phoneInput.value.trim();

      console.log('[Address] 开始保存地址, 编辑模式:', !!this.editingId);

      if (!phone) {
        alert('请输入联系电话');
        return;
      }

      // 获取各级地址值（选择模式传 rowid，自定义模式传文本但关联记录不支持纯文本，暂时只允许选择模式）
      var l1Val = this.l1Select.value;
      var l2Val = this.l2Select.value;
      var l3Val = this.l3Select.value;

      console.log('[Address] 地址 rowid: L1=' + (l1Val || '(空)') + ', L2=' + (l2Val || '(空)') + ', L3=' + (l3Val || '(空)'));

      if (!l1Val) {
        alert('请至少选择一级地址');
        return;
      }

      var shangjiaRowid = FsjApi.getShangjiaRowid();
      var userRowid = '';
      var storedInfo = localStorage.getItem('fsj_user_info');
      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }

      console.log('[Address] 保存前状态: shangjiaRowid=' + (shangjiaRowid || '无') + ', userRowid=' + (userRowid || '无'));

      if (!shangjiaRowid) {
        console.error('[Address] 无商家rowid，无法保存');
        alert('商家信息缺失，无法保存地址');
        return;
      }
      if (!userRowid) {
        console.error('[Address] 未登录，无法保存');
        alert('请先登录后再保存地址');
        return;
      }

      var addressData = {
        shangjiaRowid: shangjiaRowid,
        userRowid: userRowid,
        phone: phone,
        level1: l1Val,
        level2: l2Val,
        level3: l3Val,
        detail: this.detailInput.value.trim()
      };

      console.log('[Address] 请求数据:', JSON.stringify(addressData));

      var promise;
      if (this.editingId) {
        addressData.id = this.editingId;
        console.log('[Address] 调用 updateAddress, id:', this.editingId);
        promise = FsjApi.updateAddress(addressData);
      } else {
        console.log('[Address] 调用 createAddress');
        promise = FsjApi.createAddress(addressData);
      }

      promise.then(function (result) {
        console.log('[Address] 地址保存成功, 返回:', JSON.stringify(result));
        self.closeModal();
        // 重新加载地址列表和默认地址
        Promise.all([
          FsjApi.getAddresses(shangjiaRowid),
          FsjApi.getUserDefaultAddressRowid()
        ]).then(function (results) {
          self.addresses = results[0] || [];
          self.defaultAddressRowid = results[1] || '';
          console.log('[Address] 刷新后地址数量:', self.addresses.length);
          self.renderAddresses();
        }).catch(function (err) {
          console.error('[Address] 刷新地址列表失败:', err);
        });
        alert('保存成功');
      }).catch(function (err) {
        console.error('[Address] 地址保存失败!');
        console.error('[Address] 错误类型:', err && err.constructor && err.constructor.name);
        console.error('[Address] 错误信息:', err && err.message ? err.message : JSON.stringify(err).substring(0, 500));
        if (err && err.response) {
          console.error('[Address] 响应内容:', err.response);
        }
        if (err && err.stack) {
          console.error('[Address] 错误堆栈:', err.stack);
        }
        alert('保存失败: ' + (err.message || '未知错误'));
      });
    },

    /**
     * 设为默认地址
     */
    setDefaultAddress: function (id) {
      var self = this;
      var addr = this.addresses.find(function (a) { return a.id === id; });
      if (!addr) return;

      var userRowid = '';
      var storedInfo = localStorage.getItem('fsj_user_info');
      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }
      if (!userRowid) {
        alert('请先登录后再设置默认地址');
        return;
      }

      FsjApi.setUserDefaultAddressRowid(userRowid, id).then(function () {
        self.defaultAddressRowid = id;
        self.renderAddresses();
      }).catch(function (err) {
        console.error('[Address] 设置默认地址失败:', err);
        alert('设置失败: ' + (err.message || '未知错误'));
      });
    },

    /**
     * 删除地址
     */
    deleteAddress: function (id) {
      var self = this;
      if (!confirm('确定要删除这个地址吗？')) return;

      FsjApi.deleteAddress(id).then(function () {
        console.log('[Address] 地址已删除');
        var shangjiaRowid = FsjApi.getShangjiaRowid();
        // 重新加载地址列表和默认地址
        Promise.all([
          FsjApi.getAddresses(shangjiaRowid),
          FsjApi.getUserDefaultAddressRowid()
        ]).then(function (results) {
          self.addresses = results[0] || [];
          self.defaultAddressRowid = results[1] || '';
          console.log('[Address] 删除后刷新地址列表, 数量:', self.addresses.length);
          self.renderAddresses();
        });
      }).catch(function (err) {
        console.error('[Address] 地址删除失败:', err);
        alert('删除失败: ' + err.message);
      });
    },

    _backToProfile: function () {
      if (window.App) {
        window.App.switchPage('profile');
      }
    }
  };

  window.AddressPage = AddressPage;
})();

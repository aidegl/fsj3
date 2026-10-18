/**
 * fsj-decoration 组件配置元数据
 * 以 webview-spa2.0 首页组件系统（home_sections JSON）的真实渲染逻辑为准，
 * 每个字段定义驱动右栏属性面板自动生成，是「JSON 定义样式逻辑」的单一事实来源。
 */
var DecorationSchema = (function () {
  'use strict';

  // 内容类型选项（content_list.content_types）
  var CONTENT_TYPES = [
    { value: 'article', label: '文章' },
    { value: 'product', label: '商品' },
    { value: 'task', label: '接单任务' },
    { value: 'points_product', label: '积分商品' }
  ];

  // 首页可添加的组件区块类型
  var sectionTypes = {
    search_box: {
      label: '搜索框',
      icon: 'fa-search',
      desc: '顶部搜索栏，可带组织切换',
      fields: [
        {
          key: 'show_org_switch',
          label: '显示组织切换',
          type: 'switch',
          default: false,
          hint: '开启后搜索框左侧显示「组织 ▾」下拉（当前版本仅展示，选择联动开发中）'
        }
      ]
    },

    banner_swiper: {
      label: '轮播图',
      icon: 'fa-image',
      desc: '精选内容图片轮播（高150px，自动播放）',
      fields: [
        {
          key: 'items',
          label: '轮播内容',
          type: 'content-picker',
          hint: '从内容表选择记录，小程序端按记录主图（zhutu）渲染轮播，点击进入内容详情'
        }
      ]
    },

    feature_list: {
      label: '功能列表',
      icon: 'fa-th-large',
      desc: '商家功能表驱动的快捷入口网格',
      fields: [
        {
          key: 'show_feature_list',
          label: '显示功能列表',
          type: 'switch',
          default: true,
          hint: '数据来自明道云功能表（gongnengbiao）按当前商家过滤'
        },
        {
          key: 'columns',
          label: '每行列数',
          type: 'number',
          default: 4,
          min: 2,
          max: 5
        }
      ]
    },

    content_list: {
      label: '内容列表',
      icon: 'fa-list-alt',
      desc: '文章/商品等内容流，支持分类导航',
      fields: [
        {
          key: 'content_types',
          label: '内容类型',
          type: 'multi-select',
          options: CONTENT_TYPES,
          default: ['article'],
          hint: '可多选混合渲染；当前小程序端文章类型数据最完整'
        },
        {
          key: 'card_layout',
          label: '卡片布局',
          type: 'radio-cards',
          default: 'horizontal',
          options: [
            { value: 'horizontal', label: '左图右文' },
            { value: 'vertical', label: '上图下文' }
          ]
        },
        {
          key: 'items_per_load',
          label: '每页加载数量',
          type: 'number',
          default: 10,
          min: 1,
          max: 50
        },
        {
          key: 'category_filter',
          label: '分类导航',
          type: 'category-list',
          hint: '顶部胶囊分类 tab，按 sort 升序排列；rowid 对应内容表分类记录，留空表示「全部」'
        }
      ]
    }
  };

  // TabBar / 我的页面菜单的 page 取值（对齐 spa2.0 app.js 的 pageMap）
  var pageOptions = [
    { value: 'home', label: '首页 (home)' },
    { value: 'agent', label: '智能体 (agent)' },
    { value: 'message', label: '消息 (message)' },
    { value: 'mine', label: '我的 (mine)' },
    { value: 'orders', label: '订单 (orders)' },
    { value: 'points', label: '积分 (points)' },
    { value: 'address', label: '地址 (address)' },
    { value: 'xiangce', label: '相册 (xiangce)' },
    { value: 'publish', label: '发布 (publish)' }
  ];

  // page 值 → 预览 TabBar 占位图标（Font Awesome）
  var pageIcons = {
    home: 'fa-home',
    agent: 'fa-android',
    message: 'fa-comment-o',
    mine: 'fa-user-o',
    profile: 'fa-user-o',
    orders: 'fa-file-text-o',
    dingdan: 'fa-file-text-o',
    points: 'fa-diamond',
    address: 'fa-map-marker',
    shdz: 'fa-map-marker',
    xiangce: 'fa-picture-o',
    publish: 'fa-plus-square-o'
  };

  // 我的页面菜单（wode）每项的字段
  var wodeFields = [
    { key: 'name', label: '菜单名称', type: 'text', placeholder: '如：我的相册' },
    { key: 'sort', label: '排序值 (sort)', type: 'number', default: 0 },
    {
      key: 'page',
      label: '跳转页面',
      type: 'page-select',
      hint: 'mode=0 内置页面按 page 路由；mode=1 外部链接'
    },
    {
      key: 'mode',
      label: '打开方式',
      type: 'radio-cards',
      default: '0',
      options: [
        { value: '0', label: '内置页面' },
        { value: '1', label: '外部链接' }
      ]
    },
    {
      key: 'url',
      label: '外部链接 URL',
      type: 'text',
      showWhen: function (item) { return String(item.mode) === '1'; },
      placeholder: 'https://...'
    }
  ];

  // TabBar 每个 tab 的字段
  var tabFields = [
    { key: 'name', label: '导航名称', type: 'text', placeholder: '如：首页' },
    { key: 'sort', label: '排序值 (sort)', type: 'number', default: 0, hint: '数字越小越靠前' },
    {
      key: 'page',
      label: '页面',
      type: 'page-select',
      hint: '内置页面按 page 值路由（home/agent/mine/orders 等）'
    },
    {
      key: 'mode',
      label: '打开方式',
      type: 'radio-cards',
      default: '0',
      options: [
        { value: '0', label: '内置页面' },
        { value: '1', label: '外部链接' },
        { value: '2', label: 'JSON 配置跳转' }
      ]
    },
    {
      key: 'url',
      label: '外部链接 URL',
      type: 'textarea',
      showWhen: function (item) { return String(item.mode) === '1'; },
      placeholder: 'https://...',
      hint: 'mode=1 填 URL'
    },
    {
      key: 'url',
      label: '跳转配置（可视化编辑）',
      type: 'sheet-items',
      showWhen: function (item) { return String(item.mode) === '2'; },
      hint: '标题和子项均可视化添加/编辑/删除/排序，子项支持自定义样式，系统自动生成 JSON 保存'
    },
    {
      key: 'icon',
      label: '图标 key',
      type: 'text',
      placeholder: '如：home',
      hint: '小程序端按 {key}1/{key}0 文件名从商家 icons 资源匹配选中/未选中图标，留空走内置图标'
    },
    {
      key: 'style',
      label: '样式定制',
      type: 'style-editor',
      hint: '留空走默认样式；「选中」指底部导航高亮当前 tab 时的样式'
    }
  ];

  // style-editor 支持的样式子字段（tab 及 mode=2 悬浮窗 items 共用）
  var styleSubFields = [
    { key: 'bgColor', label: '背景色', type: 'color' },
    { key: 'textColor', label: '文字颜色', type: 'color' },
    { key: 'borderRadius', label: '圆角 (px)', type: 'number', min: 0, max: 40 },
    { key: 'activeBg', label: '选中背景色', type: 'color' },
    { key: 'activeText', label: '选中文字颜色', type: 'color' }
  ];

  /** 新建首页区块时按 schema 生成默认 config */
  function defaultConfig(type) {
    var def = sectionTypes[type];
    var config = {};
    if (!def) return config;
    def.fields.forEach(function (f) {
      if (f.default !== undefined) config[f.key] = JSON.parse(JSON.stringify(f.default));
    });
    return config;
  }

  return {
    sectionTypes: sectionTypes,
    pageOptions: pageOptions,
    pageIcons: pageIcons,
    wodeFields: wodeFields,
    tabFields: tabFields,
    styleSubFields: styleSubFields,
    contentTypes: CONTENT_TYPES,
    defaultConfig: defaultConfig
  };
})();

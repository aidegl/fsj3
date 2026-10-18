# SPA 2.0 - 通用 Webview 框架文档

> 创建时间：2026-05-13
> 版本：v1.0
> 定位：通用商城 SaaS 架构的 Webview 层框架

---

## 一、框架概述

### 1.1 定位

SPA 2.0 是一套**通用的小程序内嵌 Webview 框架**，为所有电商项目提供可复用的 Web 页面基础架构。

```
SPA 2.0（通用框架）
    │
    ├── 同檐er（校园零食）  ← 首个落地项目
    ├── 项目B（餐饮外卖）   ← 后续复制
    ├── 项目C（社区零售）   ← 后续复制
    └── 项目N ...
```

### 1.2 核心价值

| 价值 | 说明 |
|------|------|
| **快速复制** | 新项目只需配置差异化，核心代码复用 |
| **统一规范** | 三分离架构、通信协议、缓存处理统一 |
| **低代码扩展** | JSON 扩展字段 + 项目自定义组件 |
| **热更新** | Webview 页面无需发版即可更新 |

---

## 二、架构设计

### 2.1 目录结构

```
webview-spa2.0/
├── index.html              # 应用入口（路由容器）
├── index.css               # 全局样式
├── index.js                # 应用入口（路由/生命周期管理）
├── pages/                  # 页面目录
│   ├── home/               # 首页
│   │   ├── home.html
│   │   ├── home.css
│   │   └── home.js
│   ├── hezi/               # 盒子页面（同檐er特有）
│   │   ├── hezi.html
│   │   ├── hezi.css
│   │   └── hezi.js
│   └── ...
├── components/             # 通用组件
│   ├── tab-bar/            # 底部导航栏
│   ├── product-card/       # 商品卡片
│   └── ...
├── services/               # 服务层
│   ├── hap-api.js          # 明道云 API 封装
│   ├── auth.js             # 认证服务
│   ├── cart.js             # 购物车服务
│   └── payment.js          # 支付服务
├── utils/                  # 工具函数
│   ├── format.js           # 格式化工具
│   ├── storage.js          # 存储工具
│   └── request.js          # 请求封装
├── config/                 # 配置
│   ├── app.config.js       # 应用配置
│   └── project.config.js   # 项目配置（运行时注入）
└── assets/                 # 静态资源
```

### 2.2 三分离架构

每个页面独立为 HTML + CSS + JS 三个文件：

**HTML（结构）：**
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>页面名称</title>
  <link rel="stylesheet" href="../index.css">
  <link rel="stylesheet" href="page.css">
</head>
<body>
  <div class="page-container">
    <!-- 页面内容 -->
  </div>
  <script src="../utils/request.js"></script>
  <script src="../services/hap-api.js"></script>
  <script src="page.js"></script>
</body>
</html>
```

**JS（逻辑）：**
```javascript
class PageName {
  constructor(container) {
    this.container = container;
    this.timer = null;
  }

  async init() {
    // 1. 绑定事件
    this.bindEvents();
    // 2. 加载数据
    await this.loadData();
  }

  bindEvents() {
    // 事件绑定
  }

  async loadData() {
    // 数据加载
  }

  destroy() {
    // 清理资源
    if (this.timer) clearInterval(this.timer);
  }
}

export default PageName;
```

### 2.3 应用入口（路由管理）

```javascript
// index.js - 应用入口
class App {
  constructor() {
    this.pages = {};
    this.currentPage = null;
    this.version = Date.now();
  }

  async init() {
    // 1. 加载项目配置
    this.config = await this.loadProjectConfig();
    
    // 2. 注册通用服务
    this.registerServices();
    
    // 3. 初始化当前页面
    const pageName = this.getPageFromURL();
    await this.navigateTo(pageName);
    
    // 4. 监听小程序通信
    this.bindMiniProgramEvents();
  }

  async navigateTo(pageName) {
    // 销毁当前页面
    if (this.currentPage) {
      this.currentPage.destroy();
    }
    
    // 加载新页面
    const pageModule = await import(`./pages/${pageName}/${pageName}.js`);
    const container = document.getElementById('app');
    container.innerHTML = '';
    
    const page = new pageModule.default(container);
    await page.init();
    this.currentPage = page;
  }

  registerServices() {
    // 注册通用服务到全局
    window.$auth = new AuthService();
    window.$cart = new CartService();
    window.$hap = new HapApi(this.config.hapConfig);
  }
}

// 启动
const app = new App();
app.init();
```

---

## 三、通用核心模块

### 3.1 明道云 HAP API 封装

```javascript
class HapApi {
  constructor(config) {
    this.baseURL = config.baseURL;
    this.appKey = config.appKey;
    this.sign = config.sign;
  }

  async getRows(worksheetId, filters = {}) {
    const res = await fetch(`${this.baseURL}/v3/app/worksheets/${worksheetId}/rows/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HAP-Appkey': this.appKey,
        'HAP-Sign': this.sign
      },
      body: JSON.stringify({ filters })
    });
    return res.json();
  }

  async createRow(worksheetId, controls) {
    const res = await fetch(`${this.baseURL}/v3/app/worksheets/${worksheetId}/rows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HAP-Appkey': this.appKey,
        'HAP-Sign': this.sign
      },
      body: JSON.stringify({ controls })
    });
    return res.json();
  }
}
```

### 3.2 购物车服务

```javascript
class CartService {
  constructor() {
    this.items = [];
  }

  add(product, quantity = 1) {
    const existing = this.items.find(item => item.id === product.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.push({ ...product, quantity });
    }
    this.sync();
  }

  remove(productId) {
    this.items = this.items.filter(item => item.id !== productId);
    this.sync();
  }

  getTotal() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  getBoxTotal() {
    return this.items.reduce((sum, item) => sum + item.boxPrice * item.quantity, 0);
  }

  getFullTotal() {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  sync() {
    // 同步到小程序
    if (window.wx && window.wx.miniProgram) {
      window.wx.miniProgram.postMessage({
        data: { action: 'cartUpdate', payload: this.items }
      });
    }
  }
}
```

### 3.3 认证服务

```javascript
class AuthService {
  constructor() {
    this.token = null;
    this.user = null;
  }

  async login(code) {
    const res = await fetch('/api/v1/auth/code2session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const { token, user } = await res.json();
    this.token = token;
    this.user = user;
    return user;
  }

  isLoggedIn() {
    return !!this.token;
  }

  getToken() {
    return this.token;
  }
}
```

---

## 四、小程序通信协议

### 4.1 Webview → 小程序

```javascript
// 发送数据
wx.miniProgram.postMessage({
  data: {
    action: '事件类型',
    payload: { /* 数据 */ }
  }
});
```

**支持的事件类型：**

| action | 说明 | payload |
|--------|------|---------|
| `cartUpdate` | 购物车更新 | 购物车商品列表 |
| `navigate` | 页面跳转 | `{ page: '目标页面' }` |
| `payRequest` | 发起支付 | `{ orderNo, amount, method }` |
| `loginRequest` | 请求登录 | `{ scene: '场景' }` |

### 4.2 小程序 → Webview

通过 URL 参数传递：

```javascript
// 小程序端
<web-view src="https://domain/webview/index.html?page=hezi&token=xxx"></web-view>
```

Webview 端解析：

```javascript
function getPageFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('page') || 'home';
}
```

---

## 五、缓存禁用方案

**三层防护：**

```javascript
// 第一层：HTML meta 头
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">

// 第二层：URL 版本号
window.__VERSION__ = Date.now();
<link rel="stylesheet" href="page.css?v=${window.__VERSION__}">
<script src="page.js?v=${window.__VERSION__}"></script>

// 第三层：fetch no-store
fetch(url, { cache: 'no-store' })
```

---

## 六、项目配置机制

### 6.1 配置文件结构

```javascript
// config/app.config.js - 应用级配置（通用）
export default {
  hapConfig: {
    baseURL: 'https://api.mingdao.com/v3',
  },
  apiBaseURL: '/api/v1',
  pageSize: 20,
};

// config/project.config.js - 项目级配置（运行时注入）
// 由后端根据 project_id 动态生成
export default {
  projectId: 'tongyaner',
  projectName: '同檐er',
  themeColor: '#FF6B35',
  features: {
    boxPrice: true,        // 启用盒子价
    points: true,          // 启用积分
    balance: true,         // 启用余额
    delivery: true,        // 启用配送
  },
  businessConfig: {
    minOrderAmount: 10,    // 起送门槛
    initialBalance: 5,     // 初始余额
    pointsRate: 1,         // 积分比例
  },
  customFields: {
    order: ['dormitory', 'school', 'building'],
    user: ['student_id', 'dormitory'],
  },
};
```

### 6.2 配置注入方式

**方式一：后端动态生成**
```javascript
// 后端根据 project_id 生成配置
app.get('/config.js', (req, res) => {
  const projectId = req.query.projectId;
  const config = getConfigByProject(projectId);
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.__PROJECT_CONFIG__ = ${JSON.stringify(config)};`);
});
```

**方式二：构建时注入**
```bash
# 构建命令指定项目
npm run build -- --project=tongyaner
```

---

## 七、通用页面组件

### 7.1 底部导航栏（Tab Bar）

```html
<div class="tab-bar">
  <div class="tab-item" data-page="home">
    <i class="icon-home"></i>
    <span>首页</span>
  </div>
  <div class="tab-item" data-page="hezi">
    <i class="icon-box"></i>
    <span>盒子</span>
  </div>
  <div class="tab-item" data-page="cart">
    <i class="icon-cart"></i>
    <span>购物车</span>
  </div>
  <div class="tab-item" data-page="mine">
    <i class="icon-user"></i>
    <span>我的</span>
  </div>
</div>
```

### 7.2 商品卡片

```html
<div class="product-card" data-id="xxx">
  <div class="product-image">
    <img src="xxx" />
  </div>
  <div class="product-info">
    <div class="product-name">商品名称</div>
    <div class="product-price">
      <span class="price-full">¥3.0</span>
      <span class="price-box">¥1.5</span>
    </div>
  </div>
  <button class="add-btn">+</button>
</div>
```

---

## 八、数据架构策略

### 8.1 数据集中原则

所有项目的核心数据（商品、订单、用户）统一存放在**服世界明道云 HAP**，通过 `shangjia_id` 和 `project_id` 区分归属，不形成数据孤岛。

```
服世界明道云 HAP（共享）
├── 商品表 → 所有商家的商品，通过 shangjia_id 标记
├── 订单表 → 所有订单，通过 shangjia_id 标记
└── 用户表 → 所有用户，通过 shangjia_id 标记
```

### 8.2 数据隔离方式

| 方式 | 适用场景 | 实现 |
|------|----------|------|
| 商家 ID 过滤 | 大多数商家 | 查询时加 `shangjia_id` 过滤 |
| 分类标签 | 全局数据分析 | 通过标签对商品/用户分类 |
| extra JSON 字段 | 定制化商家 | 差异化信息存 JSON |
| 项目自定义表 | 复杂差异化 | 如寝室表、餐桌表 |

### 8.3 API 代理

前端通过 **Coze Workflow** 调用明道云数据，密钥不暴露。详见服世界通用 API 文档：`../../../docs/通用API接口文档.md`

---

## 九、扩展机制

### 9.1 JSON 扩展字段

所有数据表都有 `extra` 字段（JSON），项目按需扩展：

```javascript
// 订单 extra 示例
const orderExtra = {
  // 同檐er项目特有
  dormitory: '梅园1舍301',
  school: '重庆建筑科技职业学院',
  
  // 餐饮项目特有
  // tableNumber: 'A12',
  // dineType: '堂食',
};
```

### 9.2 项目特有页面

项目可在 `pages/` 下添加特有页面：

```
pages/
├── home/          # 通用
├── cart/          # 通用
├── mine/          # 通用
├── hezi/          # 同檐er特有
└── delivery/      # 同檐er特有
```

### 9.3 项目特有服务

项目可注册特有服务：

```javascript
// 同檐er项目
class DormitoryService {
  async switchDormitory(dormId) {
    // 切换寝室逻辑
  }
}

// 注册
window.$dormitory = new DormitoryService();
```

---

## 十、开发规范

### 10.1 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 页面目录 | 小写+连字符 | `hezi-order/` |
| 类名 | 大驼峰 | `HeziPage` |
| 方法名 | 小驼峰 | `loadProducts()` |
| 常量 | 大写+下划线 | `CATEGORY_MAP` |
| CSS 类名 | 小写+连字符 | `product-card` |

### 10.2 代码规范

- 使用原生 JavaScript，不引入框架
- 使用 IIFE 或 Class 封装模块
- 事件绑定统一在 `bindEvents()` 中
- 资源清理统一在 `destroy()` 中
- API 调用统一使用 `request.js` 封装

### 10.3 样式规范

- 基于 rem 适配（`html { font-size: 100px }`）
- 禁止横向滚动（`body { overflow-x: hidden; }`）
- 主题色通过 CSS 变量定义
- 项目特有样式放在页面专属 CSS 中

---

## 十一、部署规范

### 11.1 目录结构

```
服务器根目录/
├── webview-spa2.0/       # SPA 2.0 框架
│   ├── index.html
│   ├── index.css
│   ├── index.js
│   ├── pages/
│   ├── services/
│   └── config/
├── api/                  # 后端 API
│   ├── index.js
│   └── routes/
└── nginx.conf            # 反向代理配置
```

### 11.2 nginx 配置

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    # Webview 静态文件
    location /webview/ {
        alias /path/to/webview-spa2.0/;
        try_files $uri $uri/ /webview/index.html;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 十二、快速开始新项目

### 11.1 复制框架

```bash
# 1. 复制 SPA 2.0 框架
cp -r webview-spa2.0 new-project-webview

# 2. 修改项目配置
# 编辑 config/project.config.js

# 3. 安装依赖
cd new-project-webview
npm install
```

### 11.2 配置项目

```javascript
// config/project.config.js
export default {
  projectId: 'new_project',
  projectName: '新项目名称',
  themeColor: '#你的主题色',
  features: {
    // 选择需要的功能
    boxPrice: false,
    points: true,
    balance: false,
  },
};
```

### 11.3 添加特有页面（可选）

```bash
# 创建特有页面
mkdir -p pages/custom-page
# 创建 custom-page.html, custom-page.css, custom-page.js
```

---

*文档版本：v1.0*
*创建时间：2026-05-13*

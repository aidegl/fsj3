/**
 * AI 服务 - Coze 工作流调用
 */
var AIService = {
  // TODO: 替换为实际 Coze 工作流 ID
  workflowId: 'YOUR_WORKFLOW_ID',
  apiUrl: 'https://api.coze.cn/v1/workflow/run',

  /**
   * 执行 AI 工作流（流式）
   * @param {Object} params - { content, mode }
   * @param {Function} onEvent - 事件回调
   */
  execute: function (params, onEvent) {
    var self = this;

    // Demo 模式：模拟流式返回
    if (this.workflowId === 'YOUR_WORKFLOW_ID') {
      this.simulateStream(params, onEvent);
      return;
    }

    // 真实调用
    fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_TOKEN'
      },
      body: JSON.stringify({
        workflow_id: this.workflowId,
        parameters: params
      })
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      if (data.code === 0) {
        onEvent({ type: 'result', content: data.data });
        onEvent({ type: 'done' });
      } else {
        onEvent({ type: 'error', message: data.msg });
      }
    }).catch(function (e) {
      onEvent({ type: 'error', message: e.message });
    });
  },

  /**
   * Demo 模式：模拟流式响应
   */
  simulateStream: function (params, onEvent) {
    var responses = {
      '上面有一道方程题': '这道题 2x + 3 = 7 的正确解法是：\n\n**第一步：** 移项\n2x + 3 = 7\n2x = 7 - 3\n2x = 4\n\n**第二步：** 求解\nx = 4 ÷ 2\nx = 2\n\n**错因分析：**\n学生选了 C. x=5，可能是把 7+3=10 后除以2得到5，搞反了移项方向。\n\n正确思路应该是先把常数项移到右边（减法），再除以系数。',
      '智能问答': '你好！我是你的数学AI助手小智。有什么问题都可以问我哦～',
      '错题分析': '好的，让我来分析一下这道错题...\n\n**题目分析：**\n这道题考察的是方程的基本解法。\n\n**错因诊断：**\n1. 移项方向错误\n2. 运算顺序混淆\n\n**正确解法：**\nx = 2',
    };

    var content = params.content || '';
    var reply = responses[content.substring(0, 10)] || '收到你的问题，让我来思考一下...\n\n这是一个很好的问题，我们可以从多个角度来分析。首先，让我们回顾一下相关的知识点，然后逐步推导解决方案。';

    var chars = reply.split('');
    var idx = 0;
    var accumulated = '';

    onEvent({ type: 'progress', content: '正在思考...' });

    var interval = setInterval(function () {
      if (idx < chars.length) {
        accumulated += chars[idx];
        idx++;
        onEvent({ type: 'delta', delta: chars[idx - 1] });
        onEvent({ type: 'progress', content: accumulated });
      } else {
        clearInterval(interval);
        onEvent({ type: 'result', content: accumulated });
        onEvent({ type: 'done' });
      }
    }, 50);
  }
};

export default AIService;

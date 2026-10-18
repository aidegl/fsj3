/**
 * 格式化时间为相对时间（仿微信）
 * @param {string|number|Date} time - 时间字符串、时间戳或 Date 对象
 * @returns {string} 相对时间描述
 *
 * 示例：
 *   "刚刚"       - 1分钟内
 *   "5分钟前"    - 1小时内
 *   "2小时前"    - 24小时内
 *   "昨天"       - 48小时内
 *   "前天"       - 72小时内
 *   "06-12"      - 7天内
 *   "2025-06-12" - 更早
 */
(function () {
  'use strict';

  function formatRelativeTime(time) {
    if (!time) return '';

    var now = Date.now();
    var target;

    // 支持多种输入
    if (time instanceof Date) {
      target = time.getTime();
    } else if (typeof time === 'number') {
      // 如果是秒级时间戳，转成毫秒
      target = time < 1e12 ? time * 1000 : time;
    } else if (typeof time === 'string') {
      // 明道云格式："2025-06-12 14:30" 或 "2025/06/12 14:30:00"
      var normalized = time.replace(/\//g, '-');
      target = new Date(normalized).getTime();
      if (isNaN(target)) return time; // 解析失败，返回原始值
    } else {
      return String(time);
    }

    var diff = now - target;
    if (isNaN(diff) || diff < 0) return '';

    var sec = Math.floor(diff / 1000);
    var min = Math.floor(sec / 60);
    var hour = Math.floor(min / 60);
    var day = Math.floor(hour / 24);

    if (sec < 60) return '刚刚';
    if (min < 60) return min + '分钟前';
    if (hour < 24) return hour + '小时前';
    if (day < 3) {
      var labels = ['', '昨天', '前天'];
      return labels[day];
    }
    if (day < 7) {
      // 显示月-日
      var d = new Date(target);
      var m = d.getMonth() + 1;
      var date = d.getDate();
      return (m < 10 ? '0' + m : m) + '-' + (date < 10 ? '0' + date : date);
    }

    // 更早：显示完整日期
    var fullD = new Date(target);
    var year = fullD.getFullYear();
    var month = fullD.getMonth() + 1;
    var date = fullD.getDate();
    return year + '-' + (month < 10 ? '0' + month : month) + '-' + (date < 10 ? '0' + date : date);
  }

  // 暴露到全局
  window.FormatUtils = window.FormatUtils || {};
  window.FormatUtils.formatRelativeTime = formatRelativeTime;

})();

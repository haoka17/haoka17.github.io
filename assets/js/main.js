/**
 * haoka-site 渐进增强脚本（原生 JS，零依赖，defer 加载）
 * - 卡片入场渐显：IntersectionObserver 进入视口时添加 .is-visible 可见类
 * - 页脚版权年份注入：[data-year] 更新为客户端当前年份
 * - 严格渐进增强：页面核心内容与全部链接**不依赖**此脚本；
 *   脚本禁用/加载失败/运行异常时一切功能完整可用（无 .js 类，卡片始终可见）
 * - 无任何外部网络请求、无 Cookie/localStorage 写入（NFR-09）
 */
(function () {
  'use strict';

  try {
    // 标记 JS 可用：CSS 仅在 .js 类存在时启用入场动画的初始隐藏态
    document.documentElement.classList.add('js');

    var init = function () {
      // 1. 页脚版权年份注入
      var yearSpan = document.querySelector('[data-year]');
      if (yearSpan) {
        yearSpan.textContent = String(new Date().getFullYear());
      }

      // 2. 卡片入场渐显（首页卡片 + 子页详情卡）
      var cards = Array.prototype.slice.call(
        document.querySelectorAll('.card-inner, .card-detail-inner')
      );
      if (cards.length === 0) return;

      if (typeof IntersectionObserver !== 'function') {
        // 回退：环境不支持 IntersectionObserver 时立即全部可见
        for (var i = 0; i < cards.length; i += 1) {
          cards[i].classList.add('is-visible');
        }
        return;
      }

      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target); // 一次性入场，之后不再观察
          }
        });
      }, { threshold: 0.1 });

      for (var j = 0; j < cards.length; j += 1) {
        observer.observe(cards[j]);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } catch (err) {
    /* 静默降级：页面内容与全部链接不依赖此脚本，无需处理 */
  }
})();

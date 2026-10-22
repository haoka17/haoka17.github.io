#!/usr/bin/env node
/**
 * haoka-site 构建脚本（Node.js ≥ 18，零第三方依赖，仅 node: 内置模块）
 *
 * 用法：
 *   node scripts/build.js           # 全量构建站点产物
 *   node scripts/build.js --verify  # 对已生成产物执行自检（不重新构建）
 *
 * 流程（对应 design.md 1.2.5 数据流）：
 *   require data.js → validateData 校验（E1~E6 失败则零产物）
 *   → toCardPairs 索引配对 → 全部产物先在内存渲染 → 校验断言 → 统一写盘。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/* ================================================================== */
/* 常量与类型契约                                                      */
/* ================================================================== */

/** 仓库根（= 站点根，GitHub Pages 用户站点，根绝对路径成立） */
const ROOT = path.resolve(__dirname, '..');
/** 唯一数据源 */
const DATA_PATH = path.join(ROOT, 'data.js');
/** 子页产物目录 */
const CARD_DIR = path.join(ROOT, 'card');

/** 站点级常量（唯一配置来源） */
const SITE = {
  baseUrl: 'https://haoka17.github.io',
  siteName: '好卡导航',
  ogImage: '/assets/img/og-default.png',
};

/** 站点主体（作者署名 / 身份聚合 sameAs / 联系信息，用于 AI 引证信任信号） */
const SITE_AUTHOR = {
  name: '好卡导航团队',
  alternateName: '好卡导航站',
  contactWechat: 'wcbbll',
  sameAs: ['https://github.com/haoka17'],
};

/** 内容首次公开日期（YYYY-MM-DD，机器可读新鲜度信号 datePublished） */
const SITE_PUBLISHED = '2026-10-22';

/** 平台名 → 子页 slug 内置映射（现有 10 个平台固化，design.md 4.2） */
const SLUG_MAP = {
  '电信星卡': 'dianxin-xingka',
  '172号卡': '172-haoka',
  '好卡新耀': 'haoka-xinyao',
  '咔咔通信': 'kaka-tongxin',
  '蛋蛋号卡': 'dandan-haoka',
  '灵渠号卡': 'lingqu-haoka',
  '青禾号卡': 'qinghe-haoka',
  '号易': 'haoyi',
  '卡业联盟': 'kaye-lianmeng',
  '林夕号卡': 'linxi-haoka',
};

/** 首页在友情链接中的标识 slug（保留名，号卡 slug 不得占用） */
const HOME_SLUG = 'index';
/** slug 保留名列表 */
const RESERVED_SLUGS = [HOME_SLUG];

/** badge 文案 → CSS 修饰类（design.md 1.3.2 badge 三色） */
const BADGE_CLASS = { '热门': 'hot', '新品': 'new', '四网': 'quad' };

/**
 * 外部友情链接（模块级常量，便于后续扩展）。
 * 绝对 URL + 新窗口安全属性，与当前页视角无关，首页/子页统一渲染。
 */
const EXTERNAL_FRIEND_LINKS = [
  { name: '券宝', url: 'https://jdjdndn.github.io/' },
];

/** 子页办理流程四步（通用文案，不涉平台特定事实，禁止编造 data.js 之外的资费/合约信息） */
const CARD_STEPS = [
  { title: '选择平台', desc: '对比各平台资费区间与覆盖范围，确定适合的号卡平台' },
  { title: '跳转官方入口', desc: '点击“前往官方平台”按钮，在新标签页打开平台页面' },
  { title: '选号与实名', desc: '在平台内选择号码与套餐，按提示完成实名登记' },
  { title: '收卡激活', desc: '等待收到号卡后，按平台指引激活即可正常使用' },
];

/**
 * 号卡注意事项公告区块文案（用户给定文案，事实数字不得改动）。
 * 区块完全静态、不含链接与站内相对引用，首页/子页复用同一渲染。
 */
const NOTICE_TITLE = '号卡注意事项';
const NOTICE_LEAD = '下单前请仔细阅读平台详情页，重点关注套餐内容与优惠期。';
const NOTICE_CONTACT = '微信：wcbbll';
const NOTICE_ITEMS = [
  '各平台内均有订单查询与在线客服，遇到问题直接联系平台客服即可。请记住下单的平台网站，售后不要走错地方。',
  '一般号卡在 24-48 小时内发货；特殊卡（需上传三证/四证、先激活后发货、预存话费的）审核较慢，一般需要 3-5 天。',
  '号卡归属地均为随机分配，不可指定。',
  '根据工信部规定：个人在同一运营商 30 天内只能办理一张卡；同一运营商名下最多可办理 5 张实名制手机卡；四大运营商合计不超过 10 张。',
  '申请时缴纳的费用：申请成功后自动转为话费；申请失败将全额退回。',
  '办卡失败可拨打运营商官方客服热线查询：移动 10086、联通 10010、电信 10000、广电 10099，或联系平台在线客服。',
];

/** 平台特色 badge 缺失时的速览回退文案（E8 降级） */
const SPEC_BADGE_FALLBACK = '号卡办理';

/** 子页平台简介的通用导航站补充文案（不编造具体资费数字/合约期等事实） */
const INTRO_SUPPLEMENT = '本站收录其官方办理入口与代理申请通道，资费以平台页面实时展示为准。';

/** 代理合作卡说明文案（通用中性表述） */
const AGENT_CARD_DESC = '有意代理推广？直达该平台代理申请通道，注册后即可推广分佣。';

/** 子页 meta description 中 description 的截取长度（design.md 1.3.5） */
const DESC_SLICE = 70;
/** meta title / description 最大长度 */
const META_MAX_LENGTH = 160;
/** meta keywords 最大长度（SEO 规范参考值；站长口径：多一点不碍事，放宽至 200） */
const KEYWORDS_MAX_LENGTH = 200;

/**
 * 号卡平台条目（data.js 导出数组 list 的元素）
 * @typedef {Object} CardItem
 * @property {string}  name         平台名，如 "电信星卡"（必填，非空）
 * @property {string}  url          号卡平台官方/办理链接，http(s) 绝对 URL（必填）
 * @property {string}  description  平台简介，50~200 字符（必填，非空）
 * @property {string}  priceRange   资费区间，如 "19-49元/月"（必填，非空）
 * @property {boolean} [nationwide] 是否全国通用（可选；缺省时不渲染覆盖范围标签）
 * @property {string}  [badge]      角标，如 "四网" | "热门" | "新品"（可选；缺省不渲染）
 * @property {string}  [slug]       子页 slug 覆盖值（可选；缺省查 SLUG_MAP，仍未命中报错 E6）
 */

/**
 * 代理条目（data.js 导出数组 proxyList 的元素；与 list 按索引一一对应）
 * @typedef {Object} ProxyItem
 * @property {string} name  代理入口名，约定为 "{平台名}代理"（必填，非空）
 * @property {string} url   代理申请链接，http(s) 绝对 URL（必填）
 */

/**
 * 配对 + 派生后的中间产物（渲染层唯一数据来源）
 * @typedef {Object} CardPair
 * @property {CardItem}  card        list[i] 原始条目
 * @property {ProxyItem} proxy       proxyList[i] 原始条目（索引配对）
 * @property {string}    slug        经 slugOf() 派生：条目 slug > SLUG_MAP
 * @property {string}    pageUrl     `${SITE.baseUrl}/card/${slug}.html`
 * @property {string}    title       子页 <title>
 * @property {string}    description 子页 meta description（70 字截取规则）
 * @property {string}    keywords    子页 meta keywords（≤100 字符）
 * @property {{low:number, high:number} | null} price parsePriceRange() 派生，null 时 JSON-LD 省略 offers
 */

/* ================================================================== */
/* 工具函数                                                            */
/* ================================================================== */

/**
 * HTML 转义（文本与属性上下文通用）：& < > " ' 。
 * 保证 URL 含 %、&、# 等特殊字符时属性输出合法、不破坏 DOM。
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 当前日期（YYYY-MM-DD，供 sitemap lastmod 使用） */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** 是否为合法的 http/https 绝对 URL */
function isValidHttpUrl(value) {
  if (typeof value !== 'string' || value === '') return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

/* ================================================================== */
/* ① 校验层（design.md 1.3.7：E1~E10，fail-fast + 全量收集）           */
/* ================================================================== */

/**
 * 派生子页 slug：条目 slug 字段 > SLUG_MAP > null（E6 由调用方收集）。
 * @param {CardItem} item
 * @param {number}   index  list 中的索引（仅用于错误信息）
 * @param {{errors: string[]}=} issues 可选，收集 E6 错误
 * @returns {string | null}
 */
function slugOf(item, index, issues) {
  if (item && typeof item === 'object') {
    if (typeof item.slug === 'string' && item.slug.trim() !== '') {
      return item.slug.trim();
    }
    if (Object.prototype.hasOwnProperty.call(SLUG_MAP, item.name)) {
      return SLUG_MAP[item.name];
    }
  }
  if (issues) {
    const label = item && item.name ? item.name : '未知平台';
    issues.errors.push(
      `错误: list[${index}](${label}) 未提供 slug，且不在内置映射表中；` +
      '请在 data.js 该条目增加 slug 字段（如 "xin-pingtai"）'
    );
  }
  return null;
}

/**
 * 校验 data.js 数据契约（E1~E10）。
 * E1~E6 为数据契约级错误（构建阻断）；E7~E10 为数据质量警告（不阻断）。
 * @param {CardItem[]} list
 * @param {ProxyItem[]} proxyList
 * @returns {{errors: string[], warnings: string[]}}
 */
function validateData(list, proxyList) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(list) || !Array.isArray(proxyList)) {
    errors.push('错误: list 与 proxyList 必须均为数组');
    return { errors, warnings };
  }

  // E2：空数组
  if (list.length === 0) errors.push('错误: list 为空数组');
  if (proxyList.length === 0) errors.push('错误: proxyList 为空数组');

  // E1：长度不一致（仍继续逐条字段校验，保证一次性输出全部问题）
  if (list.length !== proxyList.length) {
    errors.push(
      `错误: list(${list.length}) 与 proxyList(${proxyList.length}) 长度不一致，无法按索引一一配对`
    );
  }

  // E3：必填字段缺失/为空（错误信息含数组名、索引、平台名、字段名）
  checkRequiredFields('list', list, ['name', 'url', 'description', 'priceRange'], errors);
  checkRequiredFields('proxyList', proxyList, ['name', 'url'], errors);

  // E4：url 非法（new URL() 抛错或协议非 http/https，回显原值）
  checkUrls('list', list, errors);
  checkUrls('proxyList', proxyList, errors);

  // E5/E6：slug 派生、冲突与保留名检测（仅依赖 list）
  checkSlugs(list, errors);

  // E7（软）：代理名不符 "{平台名}代理" 约定 → 仅警告
  if (list.length === proxyList.length) {
    for (let i = 0; i < list.length; i += 1) {
      const card = list[i];
      const proxy = proxyList[i];
      if (card && proxy && card.name && proxy.name && proxy.name !== `${card.name}代理`) {
        warnings.push(
          `警告: 第 ${i} 对命名不符约定: list=${card.name} / proxy=${proxy.name}，请人工确认配对关系`
        );
      }
    }
  }

  // E9（软）：priceRange 无法解析出 low/high → 警告（JSON-LD 省略 offers）
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (item && typeof item === 'object' && typeof item.priceRange === 'string' && item.priceRange !== '') {
      if (parsePriceRange(item.priceRange) === null) {
        warnings.push(
          `警告: list[${i}](${item.name || '未知'}).priceRange "${item.priceRange}" 无法解析出价格区间，JSON-LD 将省略 offers 节点`
        );
      }
    }
  }

  // E10（软）：description 超长 → 警告（首页卡片由 CSS 截断）
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (item && typeof item === 'object' && typeof item.description === 'string'
      && item.description.length > 200) {
      warnings.push(
        `警告: list[${i}](${item.name || '未知'}).description 超长（${item.description.length} 字符 > 200），首页卡片摘要将由 CSS 截断`
      );
    }
  }

  // E8（badge/nationwide 缺失）为降级路径，不产生错误或警告
  return { errors, warnings };
}

/** E3：逐条检查必填字符串字段 */
function checkRequiredFields(arrName, arr, fields, errors) {
  for (let i = 0; i < arr.length; i += 1) {
    const item = arr[i];
    const label = `${arrName}[${i}](${item && item.name ? item.name : '未知'})`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`错误: ${label} 不是合法对象`);
      continue;
    }
    for (const field of fields) {
      const value = item[field];
      if (typeof value !== 'string' || value.trim() === '') {
        errors.push(`错误: ${label}.${field} 缺失或为空`);
      }
    }
  }
}

/** E4：URL 合法性检查（仅支持 http/https） */
function checkUrls(arrName, arr, errors) {
  for (let i = 0; i < arr.length; i += 1) {
    const item = arr[i];
    if (!item || typeof item !== 'object' || typeof item.url !== 'string' || item.url.trim() === '') {
      continue; // E3 已覆盖
    }
    if (!isValidHttpUrl(item.url)) {
      errors.push(
        `错误: ${arrName}[${i}](${item.name || '未知'}).url 非法: "${item.url}"（仅支持 http/https）`
      );
    }
  }
}

/** E5/E6：slug 派生、保留名与冲突检测 */
function checkSlugs(list, errors) {
  /** @type {Map<string, {index: number, name: string}>} */
  const seen = new Map();
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!item || typeof item !== 'object') continue;
    const slug = slugOf(item, i, { errors });
    if (slug === null) continue; // E6 已收集
    if (RESERVED_SLUGS.includes(slug)) {
      errors.push(
        `错误: slug 冲突: "${slug}" 来自 list[${i}](${item.name || '未知'})，与保留名冲突，请更换 slug`
      );
      continue;
    }
    if (seen.has(slug)) {
      const prev = seen.get(slug);
      errors.push(
        `错误: slug 冲突: "${slug}" 同时来自 list[${prev.index}](${prev.name}) 与 list[${i}](${item.name || '未知'})`
      );
    } else {
      seen.set(slug, { index: i, name: item.name || '未知' });
    }
  }
}

/* ================================================================== */
/* ② 配对与派生层                                                      */
/* ================================================================== */

/**
 * 解析 priceRange 字符串为价格区间。
 * @param {string} priceRange 形如 "19-49元/月"
 * @returns {{low: number, high: number} | null} 解析失败返回 null（E9 降级）
 */
function parsePriceRange(priceRange) {
  if (typeof priceRange !== 'string') return null;
  const match = priceRange.match(/(\d+(?:\.\d+)?)\s*[-–~至]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low > high) return null;
  return { low, high };
}

/**
 * 派生子页 meta keywords（≤100 字符，SEO 规范）。
 * 组合：平台流量卡 / 平台办理入口 / 资费区间流量卡 + 通用导航词，逗号分隔。
 * @param {CardItem} card
 * @returns {string}
 */
function cardKeywords(card) {
  const terms = [
    `${card.name}流量卡`,
    `${card.name}办理入口`,
    card.priceRange ? `${card.priceRange}流量卡` : null,
    `${card.name}怎么样`,
    '正规流量卡',
    '流量卡资费',
    '号卡代理申请',
    '流量卡办理',
    '手机卡办理',
    '大流量卡推荐',
    '低月租流量卡',
    '全国流量卡',
    '流量卡比价',
  ].filter(Boolean);
  let keywords = terms.join(',');
  if (keywords.length > KEYWORDS_MAX_LENGTH) {
    // 兜底截断到 ≤100 字符（按完整词保留，避免切词）
    while (keywords.length > KEYWORDS_MAX_LENGTH) {
      const parts = keywords.split(',');
      parts.pop();
      keywords = parts.join(',');
    }
  }
  return keywords;
}

/**
 * 按数组索引配对并派生页面元数据（唯一稳定配对机制 = 索引）。
 * 调用前提：validateData 已通过（slug 必然可派生）。
 * @param {CardItem[]} list
 * @param {ProxyItem[]} proxyList
 * @returns {CardPair[]}
 */
function toCardPairs(list, proxyList) {
  return list.map((card, i) => {
    const proxy = proxyList[i];
    const slug = slugOf(card, i) || `card-${i + 1}`; // 防御兜底，正常流程不触发
    const price = parsePriceRange(card.priceRange);
    const pageUrl = `${SITE.baseUrl}/card/${slug}.html`;
    return {
      card,
      proxy,
      slug,
      pageUrl,
      price,
      title: `${card.name}流量卡怎么样？${card.priceRange}资费详情与办理入口 - ${SITE.siteName}`,
      description:
        `${card.name}流量卡资费 ${card.priceRange}，` +
        `${card.description.slice(0, DESC_SLICE)}。提供官方办理入口与代理申请通道。`,
      keywords: cardKeywords(card),
    };
  });
}

/** 首页元数据（title 40~60 字、description 140~160 字，AI-SEO 审计标准） */
function indexMeta(pairs) {
  const n = pairs.length;
  return {
    title:
      `好卡导航 - 正规流量卡办理平台导航：${n}大号卡平台官方入口与代理申请通道，资费对比一站直达`,
    description:
      `聚合${n}个正规号卡平台（电信星卡、172号卡、咔咔通信、蛋蛋号卡等）的官方办理入口与代理申请通道，` +
      '覆盖四网套餐与资费区间，附办理注意事项、发货时间、实名限额与常见问题说明，' +
      '另有各平台代理申请入口，助您快速选卡、安全办卡、一站比选直达官方平台办理，' +
      '本站为纯静态导航站，无注册登录、无追踪脚本，资费以各平台官方页面为准。',
    canonicalPath: `${SITE.baseUrl}/`,
    keywords:
      '好卡导航,流量卡导航,正规流量卡,流量卡办理,号卡平台,号卡代理,流量卡资费,流量卡申请,号卡比选,手机卡办理,大流量卡推荐,低月租流量卡,流量卡套餐对比,电信流量卡,联通流量卡,移动流量卡,广电流量卡,免费办卡,大流量套餐,流量卡商城,校园流量卡,随身WiFi,无线流量卡,号卡办理',
  };
}

/* ================================================================== */
/* ③ 渲染层（模板函数，无模板引擎）                                    */
/* ================================================================== */

/** 通用布局骨架头部导航：首页在首页本身渲染为当前位置 span，其余为站内链接（子页视角为相对路径回链） */
function renderHeaderNav(currentSlug) {
  const homeItem = currentSlug === HOME_SLUG
    ? '<span aria-current="page" class="nav-current">首页</span>'
    : '<a href="../index.html" title="返回首页">首页</a>';
  return `<nav aria-label="主导航">${homeItem}</nav>`;
}

/**
 * 渲染页脚友情链接导航（design.md 1.3.3）。
 * 12 入口 = 首页（/）+ 全部子页（/card/{slug}.html）+ 外部友链（EXTERNAL_FRIEND_LINKS）。
 * 站内入口来自 CardPair[]：当前页渲染为 <span aria-current="page" class="current">（排除自链接），
 * 其余为同窗口站内链接；外部友链为绝对 URL 新窗口链接（与视角无关）。
 * @param {string} currentSlug HOME_SLUG 或子页 slug
 * @param {CardPair[]} pairs
 * @returns {string}
 */
function renderFooterNav(currentSlug, pairs) {
  const isHome = currentSlug === HOME_SLUG;
  // 子页入口 href 前缀：首页视角需加 card/ 目录；子页视角与目标同在 card/ 目录，直接同目录互链
  const cardHref = (slug) => `${isHome ? 'card/' : ''}${escapeHtml(slug)}.html`;
  const items = [];
  items.push(isHome
    ? '<li><span aria-current="page" class="current">首页</span></li>'
    : '<li><a href="../index.html" title="返回首页">首页</a></li>');
  for (const pair of pairs) {
    items.push(pair.slug === currentSlug
      ? `<li><span aria-current="page" class="current">${escapeHtml(pair.card.name)}</span></li>`
      : `<li><a href="${cardHref(pair.slug)}" title="${escapeHtml(pair.card.name)}">${escapeHtml(pair.card.name)}</a></li>`);
  }
  // 外部友链：绝对 URL + 新窗口安全属性（首页/子页统一渲染）
  for (const link of EXTERNAL_FRIEND_LINKS) {
    items.push(
      `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(link.name)}">${escapeHtml(link.name)} ↗</a></li>`
    );
  }
  return [
    '<nav class="friend-links" aria-label="友情链接">',
    '  <h2 class="footer-title">友情链接</h2>',
    '  <ul>',
    ...items.map((item) => `    ${item}`),
    '  </ul>',
    '</nav>',
  ].join('\n');
}

/**
 * 通用布局骨架：head（SEO/OG/JSON-LD 全集）+ header + main + footer。
 * @param {{title: string, description: string, keywords: string, canonicalPath: string,
 *          jsonLd: object, mainHtml: string, currentSlug: string,
 *          pairs: CardPair[]}} page
 * @returns {string} 完整 HTML 文档
 */
function renderLayout(page) {
  const { title, description, keywords, canonicalPath, jsonLd, mainHtml, currentSlug, pairs } = page;
  const year = new Date().getFullYear();
  const jsonLdText = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
  // 站内静态资源/互链前缀：首页位于站点根（''），子页位于 card/ 目录（'../'），
  // 保证 file:// 协议双击打开时样式/脚本/图标/跳转均可用；
  // SEO 绝对 URL（canonical / og:* / JSON-LD）保持原样，不受前缀影响。
  const isHome = currentSlug === HOME_SLUG;
  const assetPrefix = isHome ? '' : '../';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="keywords" content="${escapeHtml(keywords)}">
<meta name="robots" content="index, follow">
<meta name="author" content="${SITE_AUTHOR.name}">
<meta name="datePublished" content="${SITE_PUBLISHED}">
<meta name="dateModified" content="${today()}">
<link rel="canonical" href="${escapeHtml(canonicalPath)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE.siteName}">
<meta property="og:locale" content="zh_CN">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonicalPath)}">
<meta property="og:image" content="${escapeHtml(SITE.baseUrl + SITE.ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${assetPrefix}assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${assetPrefix}assets/img/favicon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="${assetPrefix}assets/img/favicon-16.png" type="image/png" sizes="16x16">
<link rel="apple-touch-icon" href="${assetPrefix}assets/img/apple-touch-icon.png">
<link rel="stylesheet" href="${assetPrefix}assets/css/style.css">
<script type="application/ld+json">${jsonLdText}</script>
</head>
<body>
<a class="skip-link" href="#main" title="跳到主要内容">跳到主要内容</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="logo" href="${isHome ? 'index.html' : '../index.html'}" title="返回首页">⬡ ${SITE.siteName}</a>
    ${renderHeaderNav(currentSlug)}
  </div>
</header>
<main id="main">
${mainHtml}
</main>
<footer class="site-footer">
  <div class="container">
${renderFooterNav(currentSlug, pairs)}
    <p class="footer-legal">
      <a href="${isHome ? 'index.html' : '../index.html'}#about" title="关于本站">关于本站</a> ·
      <a href="${isHome ? 'index.html' : '../index.html'}#contact" title="联系站长">联系站长</a> ·
      <a href="${isHome ? 'index.html' : '../index.html'}#privacy" title="隐私政策">隐私政策</a> ·
      <a href="${isHome ? 'index.html' : '../index.html'}#terms" title="服务条款">服务条款</a>
    </p>
    <p class="copyright">© <span data-year>${year}</span> ${SITE.siteName} · <a href="${isHome ? 'index.html' : '../index.html'}#terms" title="免责声明">免责声明</a></p>
  </div>
</footer>
<script src="${assetPrefix}assets/js/main.js" defer></script>
</body>
</html>
`;
}

/** badge 角标（E8：缺失时不渲染） */
function renderBadge(badge) {
  if (!badge) return '';
  const cls = BADGE_CLASS[badge] || 'default';
  return `<span class="badge badge-${cls}">${escapeHtml(badge)}</span>`;
}

/** 覆盖范围标签（E8：nationwide 缺失时不渲染） */
function renderAreaTag(nationwide) {
  if (typeof nationwide !== 'boolean') return '';
  return nationwide
    ? '<span class="tag tag-nationwide">全国通用</span>'
    : '<span class="tag tag-region">部分地区</span>';
}

/**
 * 渲染"号卡注意事项"公告区块（首页 hero 之后 / 子页 CTA 区块之后插入，显眼位置）。
 * 区块完全静态、不含任何链接与站内相对引用，首页/子页两个视角复用同一输出；
 * 全部文案经 escapeHtml() 转义。
 * @returns {string}
 */
function renderNotice() {
  const items = NOTICE_ITEMS
    .map((item) => `      <li>${escapeHtml(item)}</li>`)
    .join('\n');
  return `<section class="notice-section" aria-labelledby="notice-title">
  <div class="container">
    <div class="notice-card">
      <h2 id="notice-title">📢 ${escapeHtml(NOTICE_TITLE)}</h2>
      <p class="notice-lead">${escapeHtml(NOTICE_LEAD)}</p>
      <ol class="notice-list">
${items}
      </ol>
      <p class="notice-contact">如有疑问可联系站长，${escapeHtml(NOTICE_CONTACT)}</p>
    </div>
  </div>
</section>`;
}

/**
 * 渲染首页 main 区：hero + 号卡卡片网格 + 代理合作入口区。
 * @param {CardPair[]} pairs
 * @returns {string}
 */
function renderIndexMain(pairs) {
  const n = pairs.length;
  const lows = pairs.map((p) => (p.price ? p.price.low : null)).filter((v) => typeof v === 'number');
  const priceSegment = lows.length > 0 ? `每月低至 ${Math.min(...lows)} 元` : '资费透明';

  const cards = pairs.map((pair) => {
    const card = pair.card;
    const badge = renderBadge(card.badge);
    const areaTag = renderAreaTag(card.nationwide);
    return `<li class="card">
  <article class="card-inner">
    ${badge}
    <h3 class="card-title">${escapeHtml(card.name)}</h3>
    <p class="card-desc">${escapeHtml(card.description)}</p>
    <p class="price">${escapeHtml(card.priceRange)}</p>
    ${areaTag ? `    <div class="card-tags">${areaTag}</div>\n` : ''}    <div class="card-actions">
      <a class="card-cta" href="${escapeHtml(card.url)}" target="_blank" rel="sponsored nofollow noopener noreferrer" title="前往${escapeHtml(card.name)}办理">前往${escapeHtml(card.name)} ↗</a>
      <a class="card-link" href="card/${escapeHtml(pair.slug)}.html" title="查看${escapeHtml(card.name)}详情">查看详情 →</a>
    </div>
  </article>
</li>`;
  }).join('\n');

  const proxies = pairs.map((pair) =>
    `      <li><a class="proxy-link" href="${escapeHtml(pair.proxy.url)}" target="_blank" rel="sponsored nofollow noopener noreferrer" title="${escapeHtml(pair.proxy.name)}">${escapeHtml(pair.proxy.name)} ↗</a></li>`
  ).join('\n');

  return `<section class="hero">
  <div class="container">
    <h1>精选正规号卡平台导航</h1>
    <p class="hero-sub">聚合 ${n} 大正规号卡平台官方办理入口，资费透明，另提供各平台代理申请通道</p>
    <p class="hero-meta">覆盖 ${n} 个平台 · ${priceSegment} · 全国可办</p>
  </div>
</section>
${renderNotice()}
<section class="card-section" aria-labelledby="card-section-title">
  <div class="container">
    <h2 id="card-section-title">号卡平台</h2>
    <ul class="card-grid">
      ${cards}
    </ul>
  </div>
</section>
<section class="proxy-section" aria-labelledby="proxy-section-title">
  <div class="container">
    <h2 id="proxy-section-title">代理合作入口</h2>
    <p class="proxy-desc">有意成为号卡代理商？直达各平台代理申请通道：</p>
    <ul class="proxy-grid">
${proxies}
    </ul>
  </div>
</section>
<section class="about-section" id="about" aria-labelledby="about-title">
  <div class="container">
    <h2 id="about-title">关于本站</h2>
    <p>好卡导航（haoka17.github.io）是一个号卡/流量卡聚合导航站：聚合 ${n} 个正规号卡平台的官方办理入口与代理申请通道，为每个平台提供资费区间、覆盖范围与平台简介，方便您横向比较、快速直达官方页面办理。本站为纯静态站点，无后端、无注册登录、无追踪脚本。</p>
    <p class="byline">维护：${SITE_AUTHOR.name} · 更新于 <time datetime="${SITE_PUBLISHED}">${SITE_PUBLISHED}</time> · 联系微信：${SITE_AUTHOR.contactWechat}</p>
  </div>
</section>
<section class="source-section" id="sources" aria-labelledby="sources-title">
  <div class="container">
    <h2 id="sources-title">资料来源与引证</h2>
    <p>本站内容与办理须知以下列公开信息源为依据，供 AI 与访客溯源核验：</p>
    <ul class="source-list">
      <li>办卡数量限制：依据工业和信息化部电话用户实名登记管理相关规定（同一运营商名下最多 5 张实名手机卡）。官方来源：<a href="https://www.miit.gov.cn" target="_blank" rel="noopener noreferrer" title="工业和信息化部官网">工业和信息化部官网</a></li>
      <li>运营商官方客服热线：中国移动 10086（<a href="https://www.10086.cn" target="_blank" rel="noopener noreferrer" title="中国移动官网">中国移动官网</a>）、中国联通 10010（<a href="https://www.10010.com" target="_blank" rel="noopener noreferrer" title="中国联通官网">中国联通官网</a>）、中国电信 10000（<a href="https://www.189.cn" target="_blank" rel="noopener noreferrer" title="中国电信官网">中国电信官网</a>）、中国广电 10099（<a href="https://www.10099.com.cn" target="_blank" rel="noopener noreferrer" title="中国广电官网">中国广电官网</a>）。</li>
      <li>平台资费与套餐：以各号卡平台官方页面实时展示为准，本站不标注具体合约期与资费承诺。</li>
    </ul>
    <blockquote>
      <p>“办卡前请核对平台资质与套餐明细，实名信息仅用于运营商入网登记；办卡、激活与售后均在各平台官方页面完成。”</p>
      <figcaption>—— 好卡导航《办理须知》</figcaption>
    </blockquote>
  </div>
</section>
<section class="legal-section" id="privacy" aria-labelledby="privacy-title">
  <div class="container">
    <h2 id="privacy-title">隐私政策</h2>
    <p>本站为纯静态导航站，不设置注册登录，不收集、不存储任何访客个人信息；不使用 Cookie 与第三方追踪脚本。访问行为由托管平台（GitHub Pages）按其日志策略处理。</p>
  </div>
</section>
<section class="legal-section" id="terms" aria-labelledby="terms-title">
  <div class="container">
    <h2 id="terms-title">服务条款与免责声明</h2>
    <p>本站仅提供信息导航与比选服务，不直接售卡、不参与交易与物流；各平台名称与商标归其权利人所有。页面展示的资费区间仅供参考，实际套餐、价格与优惠以各平台官方页面实时展示为准。跳转外部平台后，相关服务与责任由对应平台承担。</p>
  </div>
</section>
<section class="faq-section" id="faq" aria-labelledby="faq-title">
  <div class="container">
    <h2 id="faq-title">常见问题</h2>
    <div class="faq">
      <details class="faq-item">
        <summary>本站是官方售卡平台吗？</summary>
        <p>不是。好卡导航是聚合导航站，不直接售卡；点击“前往平台”将跳转至各号卡平台官方入口，选号、实名与付款均在平台内完成。</p>
      </details>
      <details class="faq-item">
        <summary>页面上的资费信息准确吗？</summary>
        <p>页面资费区间来自各平台公开信息，仅供比选参考；实际套餐、价格与优惠以各平台官方页面实时展示为准。</p>
      </details>
      <details class="faq-item">
        <summary>办卡遇到问题找谁？</summary>
        <p>售后与订单问题请直接联系您下单的平台在线客服或运营商官方热线（移动 10086、联通 10010、电信 10000、广电 10099）；本站不参与交易与物流。</p>
      </details>
      <details class="faq-item">
        <summary>为什么会通过本站跳转办理？</summary>
        <p>本站将各平台官方办理入口与代理申请通道集中收录，方便您横向比较资费与覆盖范围后直达官方页面，减少到处搜索的时间成本。</p>
      </details>
    </div>
  </div>
</section>
<section class="contact-section" id="contact" aria-labelledby="contact-title">
  <div class="container">
    <h2 id="contact-title">联系站长</h2>
    <p>商务合作、收录申请或问题反馈请联系站长（微信：${SITE_AUTHOR.contactWechat}）。友情链接与收录需求请附站点名称、网址与简介。</p>
  </div>
</section>`;
}

/**
 * 子页常见问题通用问答（4 条）。
 * 文案不编造 data.js 之外的资费数字/合约期等事实，涉及资费处一律以平台实时展示为准。
 * @param {string} cardName 平台名（用于 FAQ 文案中的引导表述）
 * @returns {{q: string, a: string}[]}
 */
function cardFaqs(cardName) {
  return [
    {
      q: '在这里办理号卡正规吗？',
      a: `本站是导航站，不直接售卡。点击“前往${cardName}官方平台”按钮将跳转至平台官方入口，选号、实名与付款均在平台内完成。`,
    },
    {
      q: '页面展示的资费准确吗？',
      a: '页面资费区间仅供参考，实际套餐、价格与优惠以平台页面实时展示为准。',
    },
    {
      q: '如何申请成为代理？',
      a: '进入上方“代理合作”区块，点击按钮直达该平台代理申请通道，注册后即可推广分佣。',
    },
    {
      q: '本站与号卡平台是什么关系？',
      a: '本站仅收录各平台官方办理入口与代理申请通道，提供信息导航与比选服务，不参与售卡、物流与售后。',
    },
  ];
}

/**
 * 渲染子页 main 区（结构增强版）：
 * hero（eyebrow/标题/badge/资费/覆盖/双 CTA/note）
 * + 平台速览网格 + 平台简介 + 办理流程步骤条 + 代理合作卡 + 常见问题 FAQ + 相关平台推荐。
 * 简介段 = card.description 全文 + 通用导航站补充文案（不编造 data.js 之外的事实）。
 * @param {CardPair} pair 当前子页配对
 * @param {CardPair[]} pairs 全部配对（"其他号卡平台"推荐来源，自动排除当前页）
 * @returns {string}
 */
function renderCardMain(pair, pairs) {
  const { card, proxy } = pair;
  const badge = renderBadge(card.badge);
  const areaItem = typeof card.nationwide === 'boolean'
    ? `\n      <li>📍 ${card.nationwide ? '全国通用' : '部分地区'}</li>`
    : '';

  // 模块 1：平台速览（覆盖范围格仅在 nationwide 存在时渲染；平台特色缺失回退通用文案）
  const specs = [
    { term: '平台名称', desc: card.name },
    { term: '参考资费', desc: card.priceRange },
  ];
  if (typeof card.nationwide === 'boolean') {
    specs.push({ term: '覆盖范围', desc: card.nationwide ? '全国通用' : '部分地区' });
  }
  specs.push({ term: '平台特色', desc: card.badge || SPEC_BADGE_FALLBACK });
  const specItems = specs.map((spec) => `      <div class="spec-item">
        <dt>${escapeHtml(spec.term)}</dt>
        <dd>${escapeHtml(spec.desc)}</dd>
      </div>`).join('\n');

  // 模块 3：办理流程步骤条（通用四步）
  const stepItems = CARD_STEPS.map((step, i) => `      <li class="step">
        <span class="step-num" aria-hidden="true">${i + 1}</span>
        <div class="step-body">
          <h3>${escapeHtml(step.title)}</h3>
          <p>${escapeHtml(step.desc)}</p>
        </div>
      </li>`).join('\n');

  // 模块 5：常见问题（原生 details/summary 折叠）
  const faqItems = cardFaqs(card.name).map((item) => `      <details class="faq-item">
        <summary>${escapeHtml(item.q)}</summary>
        <p>${escapeHtml(item.a)}</p>
      </details>`).join('\n');

  // 模块 6：相关平台推荐（排除当前页；子页视角同目录 {slug}.html 相对互链；无其余平台时整区不渲染）
  const related = (Array.isArray(pairs) ? pairs : []).filter((p) => p.slug !== pair.slug);
  const relatedItems = related.map((p) => `      <li class="related-card">
        <h3>${escapeHtml(p.card.name)}</h3>
        <p class="related-desc">${escapeHtml(p.card.description)}</p>
        <a class="related-link" href="${escapeHtml(p.slug)}.html" title="查看${escapeHtml(p.card.name)}详情">查看${escapeHtml(p.card.name)}详情 →</a>
      </li>`).join('\n');
  const relatedSection = related.length > 0
    ? `
<section class="related-section" aria-labelledby="related-section-title">
  <div class="container">
    <h2 id="related-section-title">其他号卡平台</h2>
    <ul class="related-grid">
${relatedItems}
    </ul>
  </div>
</section>`
    : '';

  return `<section class="card-detail">
  <div class="container card-detail-inner">
    <p class="eyebrow">号卡平台</p>
    <div class="card-detail-title">
      <h1>${escapeHtml(card.name)}</h1>
      ${badge}
    </div>
    <ul class="meta-row">
      <li>💳 资费：<strong class="price">${escapeHtml(card.priceRange)}</strong></li>${areaItem}
    </ul>
    <div class="cta-group">
      <a class="btn btn-primary" href="${escapeHtml(card.url)}" target="_blank" rel="sponsored nofollow noopener noreferrer" title="前往${escapeHtml(card.name)}官方平台">前往${escapeHtml(card.name)}官方平台 ↗</a>
      <a class="btn btn-secondary" href="${escapeHtml(proxy.url)}" target="_blank" rel="sponsored nofollow noopener noreferrer" title="申请成为${escapeHtml(card.name)}代理">申请成为${escapeHtml(card.name)}代理 ↗</a>
    </div>
    <p class="note">跳转至外部平台，本站不直接售卡</p>
  </div>
</section>
${renderNotice()}
<section class="card-extra">
  <div class="container">
    <section class="extra-block">
      <h2>平台速览</h2>
      <dl class="spec-grid">
${specItems}
      </dl>
    </section>
    <section class="extra-block">
      <h2>平台简介</h2>
      <div class="platform-intro">
        <p>${escapeHtml(card.description)}</p>
        <p>${INTRO_SUPPLEMENT}</p>
      </div>
    </section>
    <section class="extra-block">
      <h2>办理流程</h2>
      <ol class="steps">
${stepItems}
      </ol>
    </section>
    <section class="extra-block">
      <h2>代理合作</h2>
      <div class="agent-card">
        <div class="agent-card-body">
          <p class="agent-card-name">${escapeHtml(proxy.name)}</p>
          <p class="agent-card-desc">${AGENT_CARD_DESC}</p>
        </div>
        <a class="btn btn-primary agent-card-cta" href="${escapeHtml(proxy.url)}" target="_blank" rel="sponsored nofollow noopener noreferrer" title="直达代理申请通道">直达代理申请通道 ↗</a>
      </div>
    </section>
    <section class="extra-block">
      <h2>常见问题</h2>
      <div class="faq">
${faqItems}
      </div>
    </section>
  </div>
</section>${relatedSection}`;
}

/* ================================================================== */
/* ③' SEO 元数据与 JSON-LD（design.md 1.3.5 / 1.3.6）                  */
/* ================================================================== */

/**
 * 首页 JSON-LD：Organization（含 sameAs 身份聚合）+ WebSite + WebPage（作者/日期引证信号）+ ItemList。
 * 所有节点均带 @id；WebPage 承载 author / datePublished / dateModified（AI 引证信任）。
 */
function indexJsonLd(pairs) {
  const meta = indexMeta(pairs);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE.baseUrl}/#organization`,
        name: SITE.siteName,
        alternateName: SITE_AUTHOR.alternateName,
        url: `${SITE.baseUrl}/`,
        logo: { '@type': 'ImageObject', url: SITE.baseUrl + SITE.ogImage },
        sameAs: SITE_AUTHOR.sameAs,
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          name: `站长微信：${SITE_AUTHOR.contactWechat}`,
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE.baseUrl}/#website`,
        name: SITE.siteName,
        url: `${SITE.baseUrl}/`,
        description: `聚合 ${pairs.length} 个正规号卡平台官方办理入口与代理申请通道`,
        inLanguage: 'zh-CN',
        publisher: { '@id': `${SITE.baseUrl}/#organization` },
        dateModified: today(),
      },
      {
        '@type': 'WebPage',
        '@id': `${SITE.baseUrl}/#webpage`,
        url: `${SITE.baseUrl}/`,
        name: meta.title,
        description: meta.description,
        inLanguage: 'zh-CN',
        isPartOf: { '@id': `${SITE.baseUrl}/#website` },
        author: { '@id': `${SITE.baseUrl}/#organization` },
        datePublished: SITE_PUBLISHED,
        dateModified: today(),
      },
      {
        '@type': 'ItemList',
        '@id': `${SITE.baseUrl}/#cardlist`,
        name: '号卡平台列表',
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: pairs.length,
        itemListElement: pairs.map((pair, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: pair.card.name,
          url: pair.pageUrl,
        })),
      },
    ],
  };
}

/** 子页 JSON-LD：WebPage（含 Product/AggregateOffer）+ 两个外链 ItemList */
function cardJsonLd(pair) {
  const suffix = ` - ${SITE.siteName}`;
  const pageTitle = pair.title.endsWith(suffix)
    ? pair.title.slice(0, -suffix.length)
    : pair.title;
  /** @type {object} */
  const about = { '@type': 'Product', name: `${pair.card.name}流量卡` };
  if (pair.price) {
    about.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: 'CNY',
      lowPrice: pair.price.low,
      highPrice: pair.price.high,
      offerCount: 1,
    };
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE.baseUrl}/#organization`,
        name: SITE.siteName,
        alternateName: SITE_AUTHOR.alternateName,
        url: `${SITE.baseUrl}/`,
        logo: { '@type': 'ImageObject', url: SITE.baseUrl + SITE.ogImage },
        sameAs: SITE_AUTHOR.sameAs,
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          name: `站长微信：${SITE_AUTHOR.contactWechat}`,
        },
      },
      {
        '@type': 'WebPage',
        '@id': `${pair.pageUrl}#webpage`,
        url: pair.pageUrl,
        name: pageTitle,
        description: pair.description,
        inLanguage: 'zh-CN',
        isPartOf: { '@id': `${SITE.baseUrl}/#website` },
        author: { '@id': `${SITE.baseUrl}/#organization` },
        datePublished: SITE_PUBLISHED,
        dateModified: today(),
        about,
      },
      {
        '@type': 'ItemList',
        '@id': `${pair.pageUrl}#entrylist`,
        name: `${pair.card.name}外部入口`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: `前往${pair.card.name}官方平台`, url: pair.card.url },
          { '@type': 'ListItem', position: 2, name: `申请成为${pair.card.name}代理`, url: pair.proxy.url },
        ],
      },
    ],
  };
}

/* ================================================================== */
/* ③'' 站点级产物（sitemap / robots / llms.txt，design.md 1.3.5 / 1.3.6）*/
/* ================================================================== */

/**
 * 生成 sitemap.xml：首页 priority 1.0 + 子页 priority 0.8，顺序与 data.js 一致。
 * @param {CardPair[]} pairs
 * @param {string=} dateStr lastmod 日期（YYYY-MM-DD）
 * @returns {string}
 */
function renderSitemap(pairs, dateStr = today()) {
  const entries = [
    { loc: `${SITE.baseUrl}/`, priority: '1.0' },
    ...pairs.map((pair) => ({ loc: pair.pageUrl, priority: '0.8' })),
  ];
  const urlBlocks = entries.map((entry) => `  <url>
    <loc>${entry.loc}</loc>
    <lastmod>${dateStr}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${entry.priority}</priority>
  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlBlocks.join('\n')}
</urlset>
`;
}

/**
 * 生成 robots.txt：全站允许抓取 + AI 爬虫 GEO 段（生成式引擎优化，逐爬虫显式 Allow）+ sitemap 声明。
 * 文案为固定格式（含注释与空行），与仓库产物逐字符一致。
 */
function renderRobots() {
  /** GEO 显式允许的 AI 爬虫清单（design.md：生成式引擎优化） */
  const AI_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Bytespider', 'CCBot'];
  return [
    'User-agent: *',
    'Allow: /',
    '',
    '',
    '# AI 爬虫允许（GEO / 生成式引擎优化）',
    ...AI_BOTS.flatMap((bot) => [`User-agent: ${bot}`, 'Allow: /', '']),
    '# Sitemap',
    `Sitemap: ${SITE.baseUrl}/sitemap.xml`,
  ].join('\n') + '\n';
}

/**
 * 生成 llms.txt（AI 爬虫站点说明，遵循 llms.txt 社区规范）：
 * H1 站名 → 引用块摘要 → 站点页面（11 行链接清单）→ 说明（边界声明）。
 * @param {CardPair[]} pairs
 * @returns {string}
 */
function renderLlmsTxt(pairs) {
  const n = pairs.length;
  const lines = [];
  lines.push(`# ${SITE.siteName}`, '');
  lines.push(
    `> haoka17.github.io 是一个号卡/流量卡导航站：聚合 ${n} 个正规号卡平台的官方`,
    '> 办理入口与代理申请入口，为每个平台提供独立介绍页（资费区间、是否全国',
    '> 通用、平台简介），全部页面纯静态、无需登录、无追踪脚本。',
    '',
  );
  lines.push('## 站点页面', '');
  lines.push(`- [首页 - 号卡平台导航](${SITE.baseUrl}/): ${n} 个号卡平台聚合列表与代理合作入口`);
  for (const pair of pairs) {
    const card = pair.card;
    const segments = [`资费 ${card.priceRange}`];
    if (typeof card.nationwide === 'boolean') {
      segments.push(card.nationwide ? '全国通用' : '部分地区');
    }
    segments.push('官方办理与代理申请入口');
    lines.push(`- [${card.name}](${pair.pageUrl}): ${segments.join('，')}`);
  }
  lines.push('', '## 说明', '');
  lines.push('- 本站为导航站，不直接售卡；所有"办理"与"代理申请"均跳转至外部平台（新标签页打开）。');
  lines.push('- 页面数据由 data.js 生成；资费以各外部平台实时展示为准。');
  return `${lines.join('\n')}\n`;
}

/* ================================================================== */
/* ④ 写盘前断言（E12 原子性保障的一部分）                              */
/* ================================================================== */

/**
 * 断言页面中全部 http(s) 外链均含 target="_blank" rel="noopener noreferrer"，
 * 且不存在 javascript: 链接。
 * @param {string} pageName 页面标识（用于错误信息）
 * @param {string} html 页面 HTML
 * @param {string[]} errors 收集错误
 */
function assertExternalLinks(pageName, html, errors) {
  const anchorRe = /<a\s[^>]*>/g;
  let match;
  while ((match = anchorRe.exec(html)) !== null) {
    const tag = match[0];
    const hrefMatch = tag.match(/href="([^"]*)"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (/^javascript:/i.test(href)) {
      errors.push(`错误: ${pageName} 含 javascript: 链接: ${href}`);
      continue;
    }
    if (/^https?:\/\//i.test(href)) {
      if (!tag.includes('target="_blank"')) {
        errors.push(`错误: ${pageName} 外链缺少 target="_blank": ${href}`);
      }
      if (!/rel="[^"]*\bnoopener\b[^"]*"/.test(tag) || !/rel="[^"]*\bnoreferrer\b[^"]*"/.test(tag)) {
        errors.push(`错误: ${pageName} 外链缺少 rel="noopener noreferrer": ${href}`);
      }
    }
  }
}

/**
 * 断言全部页面 title/description 两两唯一且长度合规（FR-19），
 * 并校验 keywords 非空且 ≤100 字符（SEO 规范）。
 * @param {{page: string, title: string, description: string, keywords: string}[]} metas
 * @param {string[]} errors
 */
function assertMetaUniqueness(metas, errors) {
  /** @type {Map<string, string>} */
  const titles = new Map();
  /** @type {Map<string, string>} */
  const descriptions = new Map();
  for (const meta of metas) {
    if (titles.has(meta.title)) {
      errors.push(`错误: 页面 title 重复: "${meta.title}"（${titles.get(meta.title)} 与 ${meta.page}）`);
    } else {
      titles.set(meta.title, meta.page);
    }
    if (descriptions.has(meta.description)) {
      errors.push(`错误: 页面 description 重复: "${meta.description.slice(0, 30)}…"（${descriptions.get(meta.description)} 与 ${meta.page}）`);
    } else {
      descriptions.set(meta.description, meta.page);
    }
    if (meta.title.length > META_MAX_LENGTH) {
      errors.push(`错误: ${meta.page} title 超过 ${META_MAX_LENGTH} 字符（当前 ${meta.title.length}）`);
    }
    if (meta.description.length > META_MAX_LENGTH) {
      errors.push(`错误: ${meta.page} description 超过 ${META_MAX_LENGTH} 字符（当前 ${meta.description.length}）`);
    }
    if (typeof meta.keywords !== 'string' || meta.keywords.trim() === '') {
      errors.push(`错误: ${meta.page} keywords 缺失或为空`);
    } else if (meta.keywords.length > KEYWORDS_MAX_LENGTH) {
      errors.push(`错误: ${meta.page} keywords 超过 ${KEYWORDS_MAX_LENGTH} 字符（当前 ${meta.keywords.length}）`);
    }
  }
}

/* ================================================================== */
/* ⑤ 写入层（先内存渲染，后统一写盘；幂等）                            */
/* ================================================================== */

/**
 * 清理 card/ 目录中不属于本次产物集合的文件（删除号卡对后旧子页自动消失）。
 * @param {string[]} keepNames 本次构建应保留的子页文件名
 */
function cleanCardDir(keepNames) {
  if (!fs.existsSync(CARD_DIR)) return;
  for (const name of fs.readdirSync(CARD_DIR)) {
    if (keepNames.includes(name)) continue;
    const abs = path.join(CARD_DIR, name);
    fs.rmSync(abs, { recursive: true, force: true });
  }
}

/**
 * 统一写盘：内容未变化的文件跳过写入（幂等、减少 git diff 噪音）。
 * @param {{relPath: string, content: string}[]} artifacts
 * @returns {{written: number, skipped: number, bytes: number}}
 */
function writeAll(artifacts) {
  cleanCardDir(artifacts
    .filter((a) => a.relPath.startsWith('card/'))
    .map((a) => a.relPath.slice('card/'.length)));

  let written = 0;
  let skipped = 0;
  let bytes = 0;
  for (const artifact of artifacts) {
    const abs = path.join(ROOT, artifact.relPath);
    const contentBuf = Buffer.from(artifact.content, 'utf8');
    bytes += contentBuf.length;
    if (fs.existsSync(abs)) {
      const existing = fs.readFileSync(abs);
      if (existing.equals(contentBuf)) {
        skipped += 1;
        continue;
      }
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contentBuf);
    written += 1;
  }
  return { written, skipped, bytes };
}

/* ================================================================== */
/* 主流程                                                              */
/* ================================================================== */

/** 加载并基础检查 data.js */
function loadData() {
  let data;
  try {
    // eslint-disable-next-line import/no-dynamic-require
    data = require(DATA_PATH);
  } catch (err) {
    console.error(`错误: 无法加载 data.js: ${err.message}`);
    process.exit(1);
  }
  if (!data || !Array.isArray(data.list) || !Array.isArray(data.proxyList)) {
    console.error('错误: data.js 必须导出 { list, proxyList } 且两者均为数组');
    process.exit(1);
  }
  return data;
}

/**
 * 构建主流程：加载 → 校验（零产物）→ 配对 → 内存渲染 → 断言 → 统一写盘 → 摘要。
 */
function main() {
  const args = process.argv.slice(2);
  if (args.includes('--verify')) {
    verifyArtifacts();
    return;
  }

  const { list, proxyList } = loadData();
  const { errors, warnings } = validateData(list, proxyList);
  for (const warning of warnings) console.error(warning);
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    console.error(`错误: 共 ${errors.length} 个数据错误，构建中止，未产出任何文件。`);
    process.exit(1);
  }

  const pairs = toCardPairs(list, proxyList);
  const meta = indexMeta(pairs);

  // ---- 全部产物先在内存渲染完成（E12：渲染期任一异常则不落盘） ----
  /** @type {{relPath: string, content: string}[]} */
  let artifacts;
  try {
    const pages = [];
    pages.push({
      relPath: 'index.html',
      content: renderLayout({
        title: meta.title,
        description: meta.description,
        keywords: meta.keywords,
        canonicalPath: meta.canonicalPath,
        jsonLd: indexJsonLd(pairs),
        mainHtml: renderIndexMain(pairs),
        currentSlug: HOME_SLUG,
        pairs,
      }),
    });
    for (const pair of pairs) {
      pages.push({
        relPath: `card/${pair.slug}.html`,
        content: renderLayout({
          title: pair.title,
          description: pair.description,
          keywords: pair.keywords,
          canonicalPath: pair.pageUrl,
          jsonLd: cardJsonLd(pair),
          mainHtml: renderCardMain(pair, pairs),
          currentSlug: pair.slug,
          pairs,
        }),
      });
    }
    artifacts = [
      ...pages,
      { relPath: 'sitemap.xml', content: renderSitemap(pairs) },
      { relPath: 'robots.txt', content: renderRobots() },
      { relPath: 'llms.txt', content: renderLlmsTxt(pairs) },
    ];
  } catch (err) {
    console.error(`错误: 渲染页面失败: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }

  // ---- 写盘前断言：元数据唯一性 + 外链安全 + 产物数量 ----
  const assertErrors = [];
  assertMetaUniqueness([
    { page: 'index.html', title: meta.title, description: meta.description, keywords: meta.keywords },
    ...pairs.map((pair) => ({
      page: `card/${pair.slug}.html`,
      title: pair.title,
      description: pair.description,
      keywords: pair.keywords,
    })),
  ], assertErrors);
  for (const artifact of artifacts) {
    if (artifact.relPath.endsWith('.html')) {
      assertExternalLinks(artifact.relPath, artifact.content, assertErrors);
    }
  }
  const htmlCount = artifacts.filter((a) => a.relPath.endsWith('.html')).length;
  if (htmlCount !== list.length + 1) {
    assertErrors.push(`错误: 生成的 HTML 页面数 ${htmlCount} !== list.length + 1（${list.length + 1}）`);
  }
  if (assertErrors.length > 0) {
    for (const error of assertErrors) console.error(error);
    console.error('错误: 构建期断言未通过，未写入任何文件。');
    process.exit(1);
  }

  // ---- 统一写盘（E11：写入失败透传 Node 原生错误 + 非零退出） ----
  const result = writeAll(artifacts);

  console.log(`构建完成: ${htmlCount} 个页面（index.html + card/×${pairs.length}）+ sitemap.xml + robots.txt + llms.txt`);
  console.log(`写入 ${result.written} 个文件，跳过 ${result.skipped} 个未变更文件，产物总计 ${result.bytes} 字节，警告 ${warnings.length} 个`);
}

/* ================================================================== */
/* --verify 产物自检（design.md 1.3.9-B，供 CI/测试阶段复用）          */
/* ================================================================== */

/** 站点绝对 URL → 本地产物路径 */
function urlToLocalPath(url) {
  const base = `${SITE.baseUrl}/`;
  if (url === base) return path.join(ROOT, 'index.html');
  if (!url.startsWith(base)) return null;
  return path.join(ROOT, decodeURIComponent(url.slice(base.length)));
}

/** 读取文本文件（不存在返回 null） */
function readTextIfExist(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * 对已生成产物执行全项自检；失败逐项列出并 exit(1)，全部通过输出通过清单。
 */
function verifyArtifacts() {
  const problems = [];
  const { list } = loadData();

  // 1. 文件完整性
  const indexPath = path.join(ROOT, 'index.html');
  const indexHtml = readTextIfExist(indexPath);
  if (indexHtml === null) problems.push('缺少产物 index.html');
  let cardFiles = [];
  if (fs.existsSync(CARD_DIR)) {
    cardFiles = fs.readdirSync(CARD_DIR).filter((f) => f.endsWith('.html'));
  }
  if (cardFiles.length !== list.length) {
    problems.push(`card/ 子页数量 ${cardFiles.length} !== list.length ${list.length}（可能存在残留旧文件或缺失子页）`);
  }

  // 2~4. 逐页语义结构 / SEO 标签 / 外链安全
  /** @type {{rel: string, html: string}[]} */
  const pages = [];
  if (indexHtml !== null) pages.push({ rel: 'index.html', html: indexHtml });
  for (const f of cardFiles) pages.push({ rel: `card/${f}`, html: fs.readFileSync(path.join(CARD_DIR, f), 'utf8') });

  /** @type {Map<string, string>} */
  const titles = new Map();
  /** @type {Map<string, string>} */
  const descriptions = new Map();
  let semanticOk = true;
  let seoOk = true;
  let linkOk = true;

  for (const page of pages) {
    const { rel, html } = page;
    for (const tag of ['<header', '<nav', '<main', '<section', '<footer']) {
      if (!html.includes(tag)) {
        problems.push(`${rel}: 缺少语义标签 ${tag.slice(1)}>`);
        semanticOk = false;
      }
    }
    const h1Count = (html.match(/<h1[\s>]/g) || []).length;
    if (h1Count !== 1) {
      problems.push(`${rel}: h1 数量为 ${h1Count}，应为 1`);
      semanticOk = false;
    }
    const levels = Array.from(html.matchAll(/<h([1-6])[\s>]/g), (m) => Number(m[1]));
    for (let i = 1; i < levels.length; i += 1) {
      if (levels[i] > levels[i - 1] + 1) {
        problems.push(`${rel}: 标题跳级 h${levels[i - 1]} → h${levels[i]}`);
        semanticOk = false;
      }
    }

    if (!/<meta\s+name="viewport"/.test(html)) {
      problems.push(`${rel}: 缺少 meta viewport`);
      seoOk = false;
    }
    if (!/<link\s+rel="canonical"\s+href="https:\/\//.test(html)) {
      problems.push(`${rel}: 缺少 canonical 绝对地址`);
      seoOk = false;
    }
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
    const kwMatch = html.match(/<meta\s+name="keywords"\s+content="([^"]*)"/);
    if (!titleMatch) {
      problems.push(`${rel}: 缺少 <title>`);
      seoOk = false;
    } else if (titles.has(titleMatch[1])) {
      problems.push(`${rel}: title 与 ${titles.get(titleMatch[1])} 重复`);
      seoOk = false;
    } else {
      titles.set(titleMatch[1], rel);
    }
    if (!descMatch) {
      problems.push(`${rel}: 缺少 meta description`);
      seoOk = false;
    } else if (descriptions.has(descMatch[1])) {
      problems.push(`${rel}: description 与 ${descriptions.get(descMatch[1])} 重复`);
      seoOk = false;
    } else {
      descriptions.set(descMatch[1], rel);
    }
    if (!kwMatch) {
      problems.push(`${rel}: 缺少 meta keywords`);
      seoOk = false;
    } else if (kwMatch[1].trim() === '') {
      problems.push(`${rel}: meta keywords 为空`);
      seoOk = false;
    } else if (kwMatch[1].length > KEYWORDS_MAX_LENGTH) {
      problems.push(`${rel}: meta keywords ${kwMatch[1].length} 字符，超过 ${KEYWORDS_MAX_LENGTH} 上限`);
      seoOk = false;
    }

    for (const m of html.matchAll(/<a\s[^>]*>/g)) {
      const tag = m[0];
      const hrefMatch = tag.match(/href="([^"]*)"/);
      if (!hrefMatch) continue;
      const href = hrefMatch[1];
      if (/^javascript:/i.test(href)) {
        problems.push(`${rel}: 含 javascript: 链接 ${href}`);
        linkOk = false;
        continue;
      }
      if (/^https?:\/\//i.test(href)) {
        if (!tag.includes('target="_blank"') || !/rel="[^"]*\bnoopener\b[^"]*"/.test(tag) || !/rel="[^"]*\bnoreferrer\b[^"]*"/.test(tag)) {
          problems.push(`${rel}: 外链缺少安全属性（target="_blank" / rel="noopener noreferrer"）: ${href}`);
          linkOk = false;
        }
      }
    }
  }

  // 5. sitemap
  const sitemap = readTextIfExist(path.join(ROOT, 'sitemap.xml'));
  const locs = sitemap ? Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1]) : [];
  let sitemapOk = sitemap !== null;
  if (sitemap === null) problems.push('缺少产物 sitemap.xml');
  const expectedUrlCount = list.length + 1;
  if (sitemap !== null && locs.length !== expectedUrlCount) {
    problems.push(`sitemap <loc> 数量 ${locs.length} !== ${expectedUrlCount}`);
    sitemapOk = false;
  }
  for (const loc of locs) {
    const localPath = urlToLocalPath(loc);
    if (localPath === null || !fs.existsSync(localPath)) {
      problems.push(`sitemap loc 对应产物文件不存在: ${loc}`);
      sitemapOk = false;
    }
  }

  // 6. robots.txt
  const robots = readTextIfExist(path.join(ROOT, 'robots.txt'));
  let robotsOk = robots !== null && /Sitemap:\s*https:\/\/haoka17\.github\.io\/sitemap\.xml/.test(robots);
  if (!robotsOk) problems.push('robots.txt 缺失或缺少 Sitemap 声明行');

  // 7. llms.txt
  const llms = readTextIfExist(path.join(ROOT, 'llms.txt'));
  let llmsOk = llms !== null;
  if (llms === null) {
    problems.push('缺少产物 llms.txt');
  } else {
    const llmsUrls = new Set(Array.from(
      llms.matchAll(/\((https:\/\/haoka17\.github\.io\/[^)\s]*)\)/g),
      (m) => m[1],
    ));
    const sitemapSet = new Set(locs);
    if (llmsUrls.size !== expectedUrlCount) {
      problems.push(`llms.txt 页面 URL 数 ${llmsUrls.size} !== ${expectedUrlCount}`);
      llmsOk = false;
    }
    for (const url of sitemapSet) {
      if (!llmsUrls.has(url)) {
        problems.push(`llms.txt 缺少页面 URL: ${url}`);
        llmsOk = false;
      }
    }
    for (const url of llmsUrls) {
      if (!sitemapSet.has(url)) {
        problems.push(`llms.txt 含 sitemap 之外的 URL: ${url}`);
        llmsOk = false;
      }
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`错误: ${problem}`);
    console.error(`自检失败: 共 ${problems.length} 个问题。`);
    process.exit(1);
  }

  console.log('自检通过:');
  console.log(`  ✓ 文件完整性: index.html + card/×${cardFiles.length}`);
  console.log(`  ✓ 语义结构: ${pages.length} 页 header/nav/main/section/footer 齐全、恰一个 h1、无标题跳级`);
  console.log(`  ✓ SEO 标签: ${pages.length} 页 viewport/canonical/description/keywords 齐全，title/description 全站唯一，keywords ≤ ${KEYWORDS_MAX_LENGTH} 字符`);
  console.log(`  ✓ sitemap.xml: ${locs.length} 个 <loc> 且均对应实际产物文件`);
  console.log('  ✓ robots.txt: 含 Sitemap 声明');
  console.log('  ✓ llms.txt: 页面 URL 与 sitemap 完全一致');
  console.log('  ✓ 外链安全: 全部外链含 target="_blank" rel="noopener noreferrer"，无 javascript: 链接');
}

/* ================================================================== */
/* CLI 入口与模块导出                                                  */
/* ================================================================== */

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`错误: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }
}

module.exports = {
  SITE,
  SLUG_MAP,
  HOME_SLUG,
  ROOT,
  EXTERNAL_FRIEND_LINKS,
  CARD_STEPS,
  NOTICE_TITLE,
  NOTICE_LEAD,
  NOTICE_CONTACT,
  NOTICE_ITEMS,
  escapeHtml,
  isValidHttpUrl,
  slugOf,
  validateData,
  parsePriceRange,
  toCardPairs,
  cardKeywords,
  indexMeta,
  renderLayout,
  renderFooterNav,
  renderIndexMain,
  renderCardMain,
  renderNotice,
  cardFaqs,
  indexJsonLd,
  cardJsonLd,
  renderSitemap,
  renderRobots,
  renderLlmsTxt,
  assertExternalLinks,
  assertMetaUniqueness,
  writeAll,
  verifyArtifacts,
};

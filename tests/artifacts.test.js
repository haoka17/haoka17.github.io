/**
 * 构建产物 HTML 结构校验（集成断言，design.md 1.3.9-B）
 *
 * 前置条件：先执行 `node scripts/build.js` 生成产物（产物已提交入库）。
 * 运行：node --test（或 node --test tests/artifacts.test.js）
 *
 * 覆盖：
 * - index.html：10 个号卡名 + 10 个代理链接 + 10 个子页入口
 * - 子页（×10）：双 CTA 外链 href 与 data.js 逐字符一致（含长查询参数）、安全属性
 * - 子页结构增强：速览网格 / 平台简介 / 办理流程 / 代理合作卡 / FAQ / 相关平台推荐
 * - 友情链接：每页 12 入口 / 11 链接（10 站内 + 1 外部友链）、当前页排除自链接并高亮（相对路径互链）
 * - SEO：11 页独立 title / meta description / canonical / JSON-LD，两两唯一
 * - sitemap.xml：11 个 <loc> 且对应实际产物文件
 * - robots.txt：允许全站抓取 + Sitemap 声明
 * - llms.txt：列出全部 11 个页面 URL，与 sitemap 集合一致
 * - favicon 与相对路径：11 页 4 个 favicon link、图标文件存在且为合法 PNG、
 *   站内引用全部相对路径（file:// 双击可看），SEO 绝对 URL 保持不变
 * - 产物新鲜度：全部产物与当前 data.js + build.js 重新渲染结果一致
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const {
  HOME_SLUG,
  toCardPairs,
  indexMeta,
  indexJsonLd,
  cardJsonLd,
  renderLayout,
  renderIndexMain,
  renderCardMain,
  renderSitemap,
  renderRobots,
  renderLlmsTxt,
  NOTICE_TITLE,
  NOTICE_LEAD,
  NOTICE_CONTACT,
  NOTICE_ITEMS,
} = require(path.join(ROOT, 'scripts', 'build.js'));

/* ---------- 被测产物与派生数据 ---------- */

const data = require(path.join(ROOT, 'data.js'));
const pairs = toCardPairs(data.list, data.proxyList);

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const indexHtml = read('index.html');
const cardPages = pairs.map((pair) => ({ pair, html: read(`card/${pair.slug}.html`) }));
const sitemapXml = read('sitemap.xml');
const robotsTxt = read('robots.txt');
const llmsTxt = read('llms.txt');

/* ---------- 工具 ---------- */

/** HTML 实体解码（产物属性值 → 原始字符，用于与 data.js 原始 URL 逐字符比对） */
function decodeEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 提取页面全部 <a> 标签（含完整标签文本与 href） */
function extractAnchors(html) {
  return Array.from(html.matchAll(/<a\s[^>]*>/g), (m) => {
    const tag = m[0];
    const href = tag.match(/href="([^"]*)"/);
    return { tag, href: href ? href[1] : null };
  }).filter((a) => a.href !== null);
}

/** 断言外链安全属性：target="_blank" + rel 含 noopener 与 noreferrer */
function assertExternalLinkSafety(tag, href, where) {
  assert.ok(
    tag.includes('target="_blank"'),
    `${where} 外链应含 target="_blank": ${href}`
  );
  assert.ok(
    /rel="[^"]*\bnoopener\b[^"]*"/.test(tag) && /rel="[^"]*\bnoreferrer\b[^"]*"/.test(tag),
    `${where} 外链应含 rel="noopener noreferrer": ${href}`
  );
}

/** 提取页脚友情链接区块（friend-links <nav>） */
function friendLinksBlock(html, where) {
  const match = html.match(/<nav class="friend-links"[\s\S]*?<\/nav>/);
  assert.ok(match, `${where} 应含 friend-links 区块`);
  return match[0];
}

/** 提取页面 JSON-LD（并断言可解析） */
function extractJsonLd(html, where) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, `${where} 应含 JSON-LD script`);
  let ld;
  assert.doesNotThrow(() => { ld = JSON.parse(match[1]); }, `${where} JSON-LD 应可 JSON.parse`);
  return ld;
}

/* ================================================================== */
/* 1. index.html：号卡卡片 + 代理链接 + 子页入口                        */
/* ================================================================== */

test('index.html：含全部 10 个号卡名与对应子页入口链接', () => {
  for (const pair of pairs) {
    assert.ok(
      indexHtml.includes(`<h3 class="card-title">${pair.card.name}</h3>`),
      `首页应含号卡卡片标题: ${pair.card.name}`
    );
    assert.ok(
      indexHtml.includes(`href="card/${pair.slug}.html"`),
      `首页应含"查看详情"子页入口: card/${pair.slug}.html`
    );
    assert.ok(
      indexHtml.includes(`>${pair.card.priceRange}</p>`),
      `首页卡片应展示资费: ${pair.card.name}`
    );
  }
  assert.strictEqual(
    (indexHtml.match(/<li class="card">/g) || []).length,
    10,
    '首页号卡卡片数应为 10'
  );
});

test('index.html：10 个号卡外链与 10 个代理外链 href 与 data.js 逐字符一致且属性安全', () => {
  const anchors = extractAnchors(indexHtml);
  for (const pair of pairs) {
    // 号卡办理外链（卡片 CTA，含长查询参数 URL 逐字符一致）
    const cardLink = anchors.find((a) => decodeEntities(a.href) === pair.card.url);
    assert.ok(cardLink, `index.html 应含号卡外链（原样 URL）: ${pair.card.url}`);
    assertExternalLinkSafety(cardLink.tag, cardLink.href, 'index.html 号卡外链');

    // 代理申请外链
    const proxyLink = anchors.find((a) => decodeEntities(a.href) === pair.proxy.url);
    assert.ok(proxyLink, `index.html 应含代理外链: ${pair.proxy.url}`);
    assertExternalLinkSafety(proxyLink.tag, proxyLink.href, 'index.html 代理外链');

    // 代理区锚文本含代理名
    assert.ok(
      indexHtml.includes(`>${pair.proxy.name} ↗</a>`),
      `首页代理区应含锚文本: ${pair.proxy.name}`
    );
  }
  assert.strictEqual(
    (indexHtml.match(/class="proxy-link"/g) || []).length,
    10,
    '首页代理入口区链接数应为 10'
  );
  // 无 javascript: 协议链接
  assert.ok(!/href="javascript:/i.test(indexHtml), 'index.html 不应含 javascript: 链接');
});

/* ================================================================== */
/* 2. 子页（×10）：双 CTA 外链逐字符一致 + 安全属性 + 页面主体          */
/* ================================================================== */

test('子页：每页含对应号卡链接与代理链接（href 逐字符一致，含长查询参数）', () => {
  assert.strictEqual(cardPages.length, 10, '子页数量应为 10');
  for (const { pair, html } of cardPages) {
    const where = `card/${pair.slug}.html`;
    const anchors = extractAnchors(html);

    const cardLink = anchors.find((a) => decodeEntities(a.href) === pair.card.url);
    assert.ok(cardLink, `${where} 应含号卡官方链接（原样 URL）: ${pair.card.url}`);
    assertExternalLinkSafety(cardLink.tag, cardLink.href, `${where} 号卡链接`);

    const proxyLink = anchors.find((a) => decodeEntities(a.href) === pair.proxy.url);
    assert.ok(proxyLink, `${where} 应含代理申请链接: ${pair.proxy.url}`);
    assertExternalLinkSafety(proxyLink.tag, proxyLink.href, `${where} 代理链接`);

    // 主体内容与 data.js 一致
    assert.ok(html.includes(`<h1>${pair.card.name}</h1>`), `${where} h1 应为平台名`);
    assert.ok(html.includes(pair.card.description), `${where} 应展示 description 全文`);
    assert.ok(html.includes(pair.card.priceRange), `${where} 应展示资费区间`);
    assert.ok(!/href="javascript:/i.test(html), `${where} 不应含 javascript: 链接`);
  }
});

test('子页：底部友情链接共 12 个入口（排除自身 + 外部友链），当前页高亮、含首页与其余 9 个子页', () => {
  for (const { pair, html } of cardPages) {
    const where = `card/${pair.slug}.html`;
    const nav = friendLinksBlock(html, where);

    assert.strictEqual((nav.match(/<li>/g) || []).length, 12, `${where} 友链入口总数应为 12`);
    assert.strictEqual((nav.match(/<li><a /g) || []).length, 11, `${where} 友链可点击链接应为 11（10 站内 + 1 外部）`);
    assert.ok(
      nav.includes(`<span aria-current="page" class="current">${pair.card.name}</span>`),
      `${where} 当前页应渲染为高亮 span`
    );
    assert.ok(
      !nav.includes(`href="${pair.slug}.html"`),
      `${where} 友链不得含指向自身的链接`
    );
    assert.ok(/<a href="\.\.\/index\.html"[^>]*>首页<\/a>/.test(nav), `${where} 友链应含首页回链 ../index.html`);
    const others = pairs.filter((p) => p.slug !== pair.slug);
    assert.strictEqual(others.length, 9);
    for (const other of others) {
      assert.ok(
        nav.includes(`href="${other.slug}.html"`),
        `${where} 友链应含其余子页: ${other.card.name}`
      );
    }
    // 外部友链：绝对 URL + 新窗口安全属性，位于列表末尾
    assert.ok(
      /<li><a href="https:\/\/jdjdndn\.github\.io\/"[^>]*>券宝 ↗<\/a><\/li>/.test(nav),
      `${where} 友链应含外部友链 jdjdndn.github.io（含安全属性）`
    );
  }
});

test('index.html：底部友情链接共 12 个入口（首页高亮 + 10 子页 + 外部友链）', () => {
  const nav = friendLinksBlock(indexHtml, 'index.html');
  assert.strictEqual((nav.match(/<li>/g) || []).length, 12, 'index.html 友链入口总数应为 12');
  assert.strictEqual((nav.match(/<li><a /g) || []).length, 11, 'index.html 友链可点击链接应为 11');
  assert.ok(nav.includes('<span aria-current="page" class="current">首页</span>'), '首页应渲染为高亮 span');
  for (const pair of pairs) {
    assert.ok(
      nav.includes(`href="card/${pair.slug}.html"`),
      `index.html 友链应含子页入口: card/${pair.slug}.html`
    );
  }
  assert.ok(
    /<li><a href="https:\/\/jdjdndn\.github\.io\/"[^>]*>券宝 ↗<\/a><\/li>/.test(nav),
    'index.html 友链应含外部友链 jdjdndn.github.io（含安全属性）'
  );
});

/* ================================================================== */
/* 2'. 子页结构增强：速览网格 / 简介 / 办理流程 / 代理卡 / FAQ / 相关推荐 */
/* ================================================================== */

test('子页结构增强：速览网格四格与 data.js 字段一致（覆盖范围缺失时三格）', () => {
  for (const { pair, html } of cardPages) {
    const where = `card/${pair.slug}.html`;
    const specGrid = html.match(/<dl class="spec-grid">[\s\S]*?<\/dl>/);
    assert.ok(specGrid, `${where} 应含 <dl class="spec-grid">`);

    const card = pair.card;
    const expectedCount = typeof card.nationwide === 'boolean' ? 4 : 3;
    assert.strictEqual(
      (specGrid[0].match(/<div class="spec-item">/g) || []).length,
      expectedCount,
      `${where} 速览格数应为 ${expectedCount}`
    );
    assert.ok(specGrid[0].includes(`<dd>${card.name}</dd>`), `${where} 速览应含平台名称 ${card.name}`);
    assert.ok(specGrid[0].includes(`<dd>${card.priceRange}</dd>`), `${where} 速览应含参考资费`);
    if (typeof card.nationwide === 'boolean') {
      assert.ok(specGrid[0].includes(`<dd>${card.nationwide ? '全国通用' : '部分地区'}</dd>`),
        `${where} 速览覆盖范围应与 nationwide 一致`);
    } else {
      assert.ok(!specGrid[0].includes('覆盖范围'), `${where} nationwide 缺失不渲染覆盖范围格`);
    }
    assert.ok(
      specGrid[0].includes(`<dd>${card.badge || '号卡办理'}</dd>`),
      `${where} 平台特色应为 badge 或回退文案`
    );
  }
});

test('子页结构增强：简介补充句 + 办理流程四步 + 代理合作卡 CTA 逐字符一致', () => {
  for (const { pair, html } of cardPages) {
    const where = `card/${pair.slug}.html`;

    // 简介：description 全文 + 通用导航补充句（不编造资费事实）
    assert.ok(html.includes(pair.card.description), `${where} 简介应含 description 全文`);
    assert.ok(
      html.includes('本站收录其官方办理入口与代理申请通道，资费以平台页面实时展示为准。'),
      `${where} 简介应含通用补充句`
    );

    // 办理流程：ol.steps 四步固定标题
    const steps = html.match(/<ol class="steps">[\s\S]*?<\/ol>/);
    assert.ok(steps, `${where} 应含 <ol class="steps">`);
    assert.strictEqual((steps[0].match(/<li class="step">/g) || []).length, 4, `${where} 步骤条应含 4 步`);
    for (const title of ['选择平台', '跳转官方入口', '选号与实名', '收卡激活']) {
      assert.ok(steps[0].includes(`<h3>${title}</h3>`), `${where} 步骤条应含"${title}"`);
    }

    // 代理合作卡：代理名 + CTA 与 data.js 代理 URL 逐字符一致且属性安全
    assert.ok(html.includes('class="agent-card"'), `${where} 应含代理合作卡`);
    assert.ok(html.includes(`>${pair.proxy.name}</p>`), `${where} 代理卡应展示代理名`);
    const agentCta = extractAnchors(html).find(
      (a) => decodeEntities(a.href) === pair.proxy.url && a.tag.includes('agent-card-cta')
    );
    assert.ok(agentCta, `${where} 代理卡 CTA 应指向代理 URL: ${pair.proxy.url}`);
    assertExternalLinkSafety(agentCta.tag, agentCta.href, `${where} 代理卡 CTA`);
  }
});

test('子页结构增强：FAQ 4 个 details 条目；相关推荐 9 个平台且排除当前页', () => {
  for (const { pair, html } of cardPages) {
    const where = `card/${pair.slug}.html`;

    // FAQ：4 个 details/summary 折叠条目，问题文案为通用四问
    assert.strictEqual(
      (html.match(/<details class="faq-item">/g) || []).length, 4,
      `${where} FAQ 应含 4 个 details 条目`
    );
    assert.strictEqual((html.match(/<summary>/g) || []).length, 4, `${where} FAQ summary 数应为 4`);
    for (const question of ['在这里办理号卡正规吗？', '页面展示的资费准确吗？', '如何申请成为代理？', '本站与号卡平台是什么关系？']) {
      assert.ok(html.includes(`<summary>${question}</summary>`), `${where} FAQ 应含问题"${question}"`);
    }

    // 相关推荐：其余 9 个平台，同目录相对互链，排除当前页
    const related = html.match(/<ul class="related-grid">[\s\S]*?<\/ul>/);
    assert.ok(related, `${where} 应含 <ul class="related-grid">`);
    const others = pairs.filter((p) => p.slug !== pair.slug);
    assert.strictEqual(others.length, 9);
    assert.strictEqual(
      (related[0].match(/<li class="related-card">/g) || []).length, 9,
      `${where} 相关推荐应为 9 个平台`
    );
    assert.ok(!related[0].includes(`href="${pair.slug}.html"`), `${where} 相关推荐不得含当前页链接`);
    for (const other of others) {
      assert.ok(
        related[0].includes(`href="${other.slug}.html"`),
        `${where} 相关推荐应含: card/${other.slug}.html`
      );
      assert.ok(
        related[0].includes(`<h3>${other.card.name}</h3>`),
        `${where} 相关推荐应含平台名: ${other.card.name}`
      );
    }
    assert.ok(html.includes('其他号卡平台'), `${where} 推荐区 h2 标题`);
  }
});

/* ================================================================== */
/* 2''. 号卡注意事项公告区块（首页 hero 后 / 子页 CTA 后，11 页复用）   */
/* ================================================================== */

test('注意事项公告：11 页均含 notice-section、8 条须知文案（与号卡系真源逐字对齐）与联系方式 wcbbll', () => {
  const allPages = [
    { rel: 'index.html', html: indexHtml },
    ...cardPages.map(({ pair, html }) => ({ rel: `card/${pair.slug}.html`, html })),
  ];
  assert.strictEqual(allPages.length, 11);

  for (const { rel, html } of allPages) {
    // 区块骨架：section[aria-labelledby] + 容器 + 标题 + 引导语 + 列表 + 联系方式
    const section = html.match(/<section class="notice-section"[\s\S]*?<\/section>/);
    assert.ok(section, `${rel} 应含 notice-section 区块`);
    assert.ok(
      html.includes('<section class="notice-section" aria-labelledby="notice-title">'),
      `${rel} notice-section 应以 aria-labelledby 关联标题`
    );
    assert.ok(
      html.includes(`<h2 id="notice-title">📢 ${NOTICE_TITLE}</h2>`),
      `${rel} 应含公告标题（h2#notice-title）`
    );
    assert.ok(
      html.includes(`<p class="notice-lead">${NOTICE_LEAD}</p>`),
      `${rel} 应含引导语 notice-lead`
    );

    // 8 条须知逐条渲染（与号卡系真源逐字对齐，事实数字不得改动）
    const list = section[0].match(/<ol class="notice-list">[\s\S]*?<\/ol>/);
    assert.ok(list, `${rel} 应含 <ol class="notice-list">`);
    const items = Array.from(list[0].matchAll(/<li>([\s\S]*?)<\/li>/g), (m) => m[1]);
    assert.strictEqual(items.length, NOTICE_ITEMS.length, `${rel} 公告列表应为 ${NOTICE_ITEMS.length} 条`);
    for (const item of NOTICE_ITEMS) {
      assert.ok(section[0].includes(item), `${rel} 公告应含注意事项: ${item.slice(0, 20)}…`);
    }

    // 联系方式：站长微信号 wcbbll
    assert.ok(
      html.includes(`<p class="notice-contact">如有疑问可联系站长，${NOTICE_CONTACT}</p>`),
      `${rel} 应含站长联系方式（notice-contact）`
    );
    assert.ok(section[0].includes('wcbbll'), `${rel} 公告应含微信号 wcbbll`);

    // 公告区块为纯静态信息：不含任何链接与站内相对引用（不破坏 file:// 可用性）
    assert.ok(!section[0].includes('<a '), `${rel} 公告区块不应含链接`);
  }
});

test('注意事项公告插入位置：首页 hero 之后卡片网格之前；子页 CTA 之后 card-extra 之前', () => {
  // 首页：hero < notice-section < card-section
  const heroPos = indexHtml.indexOf('<section class="hero">');
  const noticePos = indexHtml.indexOf('<section class="notice-section"');
  const cardSectionPos = indexHtml.indexOf('<section class="card-section"');
  assert.ok(heroPos > -1 && noticePos > heroPos, '首页公告应位于 hero 之后');
  assert.ok(cardSectionPos > noticePos, '首页公告应位于"号卡平台"卡片网格之前');

  for (const { pair, html } of cardPages) {
    const where = `card/${pair.slug}.html`;
    const detailPos = html.indexOf('<section class="card-detail">');
    const subNoticePos = html.indexOf('<section class="notice-section"');
    const extraPos = html.indexOf('<section class="card-extra">');
    assert.ok(detailPos > -1 && subNoticePos > detailPos, `${where} 公告应位于平台详情 CTA 区块之后`);
    assert.ok(extraPos > subNoticePos, `${where} 公告应位于 card-extra 扩展区之前`);
  }
});

/* ================================================================== */
/* 3. SEO：11 页独立 title / description / canonical / JSON-LD          */
/* ================================================================== */

test('SEO：11 页均有独立 <title>、meta description、canonical、JSON-LD，且两两唯一', () => {
  const meta = indexMeta(pairs);
  const allPages = [
    {
      rel: 'index.html', html: indexHtml,
      title: meta.title, desc: meta.description,
      canonical: 'https://haoka17.github.io/',
    },
    ...cardPages.map(({ pair, html }) => ({
      rel: `card/${pair.slug}.html`, html,
      title: pair.title, desc: pair.description,
      canonical: pair.pageUrl,
    })),
  ];
  assert.strictEqual(allPages.length, 11);

  const titles = new Set();
  const descs = new Set();
  for (const page of allPages) {
    const titleMatch = page.html.match(/<title>([^<]*)<\/title>/);
    assert.ok(titleMatch, `${page.rel} 应含 <title>`);
    assert.strictEqual(titleMatch[1], page.title, `${page.rel} title 应与模板派生值一致`);
    assert.ok(!titles.has(titleMatch[1]), `title 应全站唯一: ${titleMatch[1]}`);
    titles.add(titleMatch[1]);

    const descMatch = page.html.match(/<meta name="description" content="([^"]*)"/);
    assert.ok(descMatch, `${page.rel} 应含 meta description`);
    assert.strictEqual(
      decodeEntities(descMatch[1]), page.desc,
      `${page.rel} description 应与模板派生值一致`
    );
    assert.ok(!descs.has(descMatch[1]), `description 应全站唯一: ${descMatch[1].slice(0, 30)}…`);
    descs.add(descMatch[1]);

    // keywords：非空、≤200 字符（站长口径：多一点不碍事，放宽上限）
    const kwMatch = page.html.match(/<meta name="keywords" content="([^"]*)"/);
    assert.ok(kwMatch, `${page.rel} 应含 meta keywords`);
    assert.ok(kwMatch[1].trim().length > 0, `${page.rel} meta keywords 不应为空`);
    assert.ok(kwMatch[1].length <= 200, `${page.rel} meta keywords ${kwMatch[1].length} 字符，超过 200 上限`);

    assert.ok(
      page.html.includes(`<link rel="canonical" href="${page.canonical}">`),
      `${page.rel} canonical 应为页面绝对 URL: ${page.canonical}`
    );
    assert.ok(
      page.html.includes(`<meta property="og:url" content="${page.canonical}">`),
      `${page.rel} og:url 应与 canonical 一致`
    );

    extractJsonLd(page.html, page.rel); // 存在且可解析
  }
  assert.strictEqual(titles.size, 11, '11 页 title 两两唯一');
  assert.strictEqual(descs.size, 11, '11 页 description 两两唯一');
});

test('JSON-LD：首页 WebSite + ItemList(10)；子页 WebPage(Product/AggregateOffer) + 双外链 ItemList', () => {
  const indexLd = extractJsonLd(indexHtml, 'index.html');
  const website = indexLd['@graph'].find((n) => n['@type'] === 'WebSite');
  const itemList = indexLd['@graph'].find((n) => n['@type'] === 'ItemList');
  assert.ok(website, '首页应含 WebSite 节点');
  assert.strictEqual(website.url, 'https://haoka17.github.io/');
  assert.ok(itemList, '首页应含 ItemList 节点');
  assert.strictEqual(itemList['@type'], 'ItemList');
  assert.strictEqual(itemList.numberOfItems, 10, '首页 ItemList numberOfItems === 10');
  assert.deepStrictEqual(
    itemList.itemListElement.map((e) => e.url),
    pairs.map((p) => p.pageUrl),
    '首页 ItemList URL 顺序应与 data.js 一致'
  );
  assert.ok(
    indexLd['@graph'].some((n) => n['@type'] === 'Organization' && Array.isArray(n.sameAs) && n.sameAs.length > 0),
    '首页应含带 sameAs 的 Organization 节点'
  );
  const homeWebPage = indexLd['@graph'].find((n) => n['@type'] === 'WebPage');
  assert.ok(homeWebPage && homeWebPage.author && homeWebPage.datePublished && homeWebPage.dateModified, '首页应含带作者/日期的 WebPage 节点');

  for (const { pair, html } of cardPages) {
    const where = `card/${pair.slug}.html`;
    const ld = extractJsonLd(html, where);
    const webpage = ld['@graph'].find((n) => n['@type'] === 'WebPage');
    const subList = ld['@graph'].find((n) => n['@type'] === 'ItemList');
    assert.ok(webpage, `${where} 应含 WebPage`);
    assert.strictEqual(webpage.url, pair.pageUrl, `${where} WebPage.url 应为页面 URL`);
    assert.strictEqual(webpage.about['@type'], 'Product', `${where} about 应为 Product`);
    if (pair.price) {
      assert.strictEqual(webpage.about.offers['@type'], 'AggregateOffer');
      assert.strictEqual(webpage.about.offers.priceCurrency, 'CNY');
      assert.strictEqual(webpage.about.offers.lowPrice, pair.price.low, `${where} lowPrice 应与解析值一致`);
      assert.strictEqual(webpage.about.offers.highPrice, pair.price.high, `${where} highPrice 应与解析值一致`);
    } else {
      assert.strictEqual(webpage.about.offers, undefined, `${where} E9 降级应省略 offers`);
    }
    assert.ok(subList, `${where} 应含 ItemList`);
    assert.strictEqual(subList.itemListElement.length, 2, `${where} 应含两个外链 ListItem`);
    assert.strictEqual(subList.itemListElement[0].url, pair.card.url, `${where} ListItem[0] 应为号卡 URL`);
    assert.strictEqual(subList.itemListElement[1].url, pair.proxy.url, `${where} ListItem[1] 应为代理 URL`);
  }
});

/* ================================================================== */
/* 4. sitemap.xml / robots.txt / llms.txt                              */
/* ================================================================== */

test('sitemap.xml：含 11 个 <loc>（首页 + 10 子页，顺序与 data.js 一致）且均对应实际产物文件', () => {
  assert.ok(
    sitemapXml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'),
    'sitemap 应为合法 urlset'
  );
  const locs = Array.from(sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1]);
  assert.strictEqual(locs.length, 11, 'sitemap <loc> 数应为 11');

  const expected = ['https://haoka17.github.io/', ...pairs.map((p) => p.pageUrl)];
  assert.deepStrictEqual(locs, expected, 'loc 顺序：首页 + 10 子页（与 data.js 一致）');

  assert.ok(fs.existsSync(path.join(ROOT, 'index.html')), 'loc / 应对应 index.html');
  for (const pair of pairs) {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'card', `${pair.slug}.html`)),
      `loc 应对应实际产物文件: card/${pair.slug}.html`
    );
  }
});

test('robots.txt：存在、允许全站爬取、含 AI 爬虫 GEO 段、声明 sitemap 绝对地址', () => {
  assert.ok(robotsTxt.includes('User-agent: *'), 'robots.txt 应声明 User-agent: *');
  assert.ok(robotsTxt.includes('Allow: /'), 'robots.txt 应允许全站抓取');
  // AI 爬虫 GEO 段：逐爬虫显式 Allow（GPTBot / ClaudeBot / PerplexityBot / Google-Extended / Bytespider / CCBot）
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Bytespider', 'CCBot']) {
    assert.ok(
      robotsTxt.includes(`User-agent: ${bot}\nAllow: /`),
      `robots.txt 应显式允许 AI 爬虫: ${bot}`
    );
  }
  assert.ok(
    robotsTxt.includes('# AI 爬虫允许（GEO / 生成式引擎优化）'),
    'robots.txt 应含 GEO 段注释'
  );
  assert.ok(
    robotsTxt.includes('Sitemap: https://haoka17.github.io/sitemap.xml'),
    'robots.txt 应声明 sitemap 绝对地址'
  );
});

test('llms.txt：存在且列出全部 11 个页面 URL，URL 集合与 sitemap 完全一致', () => {
  const llmsUrls = Array.from(
    llmsTxt.matchAll(/\((https:\/\/haoka17\.github\.io\/[^)\s]*)\)/g),
    (m) => m[1]
  );
  assert.strictEqual(llmsUrls.length, 11, 'llms.txt 应列出 11 个页面 URL');
  const sitemapLocs = Array.from(sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1]);
  assert.deepStrictEqual(
    [...new Set(llmsUrls)].sort(),
    [...new Set(sitemapLocs)].sort(),
    'llms.txt URL 集合应与 sitemap 完全一致'
  );
  for (const pair of pairs) {
    assert.ok(
      llmsTxt.includes(`[${pair.card.name}](${pair.pageUrl})`),
      `llms.txt 应含 ${pair.card.name} 页面条目`
    );
  }
});

/* ================================================================== */
/* 5. favicon 与相对路径（file:// 本地打开可用性）                      */
/* ================================================================== */

test('favicon：11 页均含 4 个 favicon link（首页 assets/ 前缀，子页 ../assets/ 前缀）', () => {
  const faviconHrefs = (prefix) => [
    `<link rel="icon" href="${prefix}assets/img/favicon.svg" type="image/svg+xml">`,
    `<link rel="icon" href="${prefix}assets/img/favicon-32.png" type="image/png" sizes="32x32">`,
    `<link rel="icon" href="${prefix}assets/img/favicon-16.png" type="image/png" sizes="16x16">`,
    `<link rel="apple-touch-icon" href="${prefix}assets/img/apple-touch-icon.png">`,
  ];
  for (const tag of faviconHrefs('')) {
    assert.ok(indexHtml.includes(tag), `index.html 应含 favicon link: ${tag}`);
  }
  assert.strictEqual(
    (indexHtml.match(/<link rel="(icon|apple-touch-icon)"/g) || []).length,
    4,
    'index.html favicon link 应恰为 4 个'
  );
  for (const { pair, html } of cardPages) {
    const where = `card/${pair.slug}.html`;
    for (const tag of faviconHrefs('../')) {
      assert.ok(html.includes(tag), `${where} 应含 favicon link: ${tag}`);
    }
    assert.strictEqual(
      (html.match(/<link rel="(icon|apple-touch-icon)"/g) || []).length,
      4,
      `${where} favicon link 应恰为 4 个`
    );
  }
});

test('favicon 文件：4 个图标文件存在且非空，3 个 PNG 均为合法 PNG 魔数', () => {
  const imgDir = path.join(ROOT, 'assets', 'img');
  for (const name of ['favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png']) {
    const abs = path.join(imgDir, name);
    assert.ok(fs.existsSync(abs), `assets/img/${name} 应存在`);
    assert.ok(fs.statSync(abs).size > 0, `assets/img/${name} 不应为空文件`);
  }
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const name of ['favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png']) {
    const head = fs.readFileSync(path.join(imgDir, name)).subarray(0, 8);
    assert.ok(
      head.equals(PNG_MAGIC),
      `assets/img/${name} 前 8 字节应为 PNG 魔数（89 50 4E 47 0D 0A 1A 0A）`
    );
  }
});

test('相对路径：11 页站内引用均为相对路径，无根绝对 href/src（canonical/og 为 content 属性不受影响）', () => {
  assert.ok(!/(?:href|src)="\//.test(indexHtml), 'index.html 不应含根绝对路径引用');
  for (const { pair, html } of cardPages) {
    assert.ok(
      !/(?:href|src)="\//.test(html),
      `card/${pair.slug}.html 不应含根绝对路径引用`
    );
  }
  // 资源引用前缀规则：首页 assets/...；子页 ../assets/...
  assert.ok(indexHtml.includes('href="assets/css/style.css"'), 'index.html 样式表应为 assets/ 相对路径');
  assert.ok(indexHtml.includes('src="assets/js/main.js"'), 'index.html 脚本应为 assets/ 相对路径');
  for (const { pair, html } of cardPages) {
    const where = `card/${pair.slug}.html`;
    assert.ok(html.includes('href="../assets/css/style.css"'), `${where} 样式表应为 ../assets/ 相对路径`);
    assert.ok(html.includes('src="../assets/js/main.js"'), `${where} 脚本应为 ../assets/ 相对路径`);
    assert.ok(html.includes('href="../index.html"'), `${where} 应回链 ../index.html`);
    // SEO 绝对 URL 保持不变
    assert.ok(html.includes(`<link rel="canonical" href="https://haoka17.github.io/card/${pair.slug}.html">`), `${where} canonical 应保持绝对 URL`);
  }
  assert.ok(
    indexHtml.includes('<link rel="canonical" href="https://haoka17.github.io/">'),
    'index.html canonical 应保持绝对 URL'
  );
});

/* ================================================================== */
/* 6. 产物新鲜度：全部产物与当前源码/数据重新渲染结果一致               */
/* （归一化动态字段：页脚年份 <span data-year>、sitemap lastmod）      */
/* ================================================================== */

test('产物新鲜度：11 个 HTML + sitemap + robots + llms.txt 均为当前 data.js + build.js 的构建输出', () => {
  const normalize = (s) => s
    .replace(/(<span data-year>)\d{4}(<\/span>)/g, '$1YYYY$2')
    .replace(/(<lastmod>)\d{4}-\d{2}-\d{2}(<\/lastmod>)/g, '$1DATE$2');

  const meta = indexMeta(pairs);
  const expectedIndex = renderLayout({
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    canonicalPath: meta.canonicalPath,
    jsonLd: indexJsonLd(pairs),
    mainHtml: renderIndexMain(pairs),
    currentSlug: HOME_SLUG,
    pairs,
  });
  assert.strictEqual(
    normalize(indexHtml), normalize(expectedIndex),
    'index.html 应与重新渲染结果一致（产物可能过期，请重跑 node scripts/build.js）'
  );

  for (const { pair, html } of cardPages) {
    const expected = renderLayout({
      title: pair.title,
      description: pair.description,
      keywords: pair.keywords,
      canonicalPath: pair.pageUrl,
      jsonLd: cardJsonLd(pair),
      mainHtml: renderCardMain(pair, pairs),
      currentSlug: pair.slug,
      pairs,
    });
    assert.strictEqual(
      normalize(html), normalize(expected),
      `card/${pair.slug}.html 应与重新渲染结果一致（产物可能过期，请重跑 node scripts/build.js）`
    );
  }

  assert.strictEqual(normalize(sitemapXml), normalize(renderSitemap(pairs)), 'sitemap.xml 应为最新构建输出');
  assert.strictEqual(robotsTxt, renderRobots(), 'robots.txt 应为最新构建输出');
  assert.strictEqual(llmsTxt, renderLlmsTxt(pairs), 'llms.txt 应为最新构建输出');
});

/**
 * 构建产物 HTML 结构校验（集成断言，design.md 1.3.9-B）
 *
 * 前置条件：先执行 `node scripts/build.js` 生成产物（产物已提交入库）。
 * 运行：node --test（或 node --test tests/artifacts.test.js）
 *
 * 覆盖：
 * - index.html：10 个号卡名 + 10 个代理链接 + 10 个子页入口
 * - 子页（×10）：双 CTA 外链 href 与 data.js 逐字符一致（含长查询参数）、安全属性
 * - 友情链接：每页 11 入口 / 10 链接、当前页排除自链接并高亮
 * - SEO：11 页独立 title / meta description / canonical / JSON-LD，两两唯一
 * - sitemap.xml：11 个 <loc> 且对应实际产物文件
 * - robots.txt：允许全站抓取 + Sitemap 声明
 * - llms.txt：列出全部 11 个页面 URL，与 sitemap 集合一致
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
      indexHtml.includes(`href="/card/${pair.slug}.html"`),
      `首页应含"查看详情"子页入口: /card/${pair.slug}.html`
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

test('子页：底部友情链接共 10 个入口（排除自身），当前页高亮、含首页与其余 9 个子页', () => {
  for (const { pair, html } of cardPages) {
    const where = `card/${pair.slug}.html`;
    const nav = friendLinksBlock(html, where);

    assert.strictEqual((nav.match(/<li>/g) || []).length, 11, `${where} 友链入口总数应为 11`);
    assert.strictEqual((nav.match(/<li><a /g) || []).length, 10, `${where} 友链可点击链接应为 10（排除自身）`);
    assert.ok(
      nav.includes(`<span aria-current="page" class="current">${pair.card.name}</span>`),
      `${where} 当前页应渲染为高亮 span`
    );
    assert.ok(
      !nav.includes(`href="/card/${pair.slug}.html"`),
      `${where} 友链不得含指向自身的链接`
    );
    assert.ok(nav.includes('<a href="/">首页</a>'), `${where} 友链应含首页链接`);
    const others = pairs.filter((p) => p.slug !== pair.slug);
    assert.strictEqual(others.length, 9);
    for (const other of others) {
      assert.ok(
        nav.includes(`href="/card/${other.slug}.html"`),
        `${where} 友链应含其余子页: ${other.card.name}`
      );
    }
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
  const [website, itemList] = indexLd['@graph'];
  assert.strictEqual(website['@type'], 'WebSite');
  assert.strictEqual(website.url, 'https://haoka17.github.io/');
  assert.strictEqual(itemList['@type'], 'ItemList');
  assert.strictEqual(itemList.numberOfItems, 10, '首页 ItemList numberOfItems === 10');
  assert.deepStrictEqual(
    itemList.itemListElement.map((e) => e.url),
    pairs.map((p) => p.pageUrl),
    '首页 ItemList URL 顺序应与 data.js 一致'
  );

  for (const { pair, html } of cardPages) {
    const where = `card/${pair.slug}.html`;
    const ld = extractJsonLd(html, where);
    const [webpage, subList] = ld['@graph'];
    assert.strictEqual(webpage['@type'], 'WebPage', `${where} 应含 WebPage`);
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
    assert.strictEqual(subList['@type'], 'ItemList');
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

test('robots.txt：存在、允许全站爬取、声明 sitemap 绝对地址', () => {
  assert.ok(robotsTxt.includes('User-agent: *'), 'robots.txt 应声明 User-agent: *');
  assert.ok(robotsTxt.includes('Allow: /'), 'robots.txt 应允许全站抓取');
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
/* 5. 产物新鲜度：全部产物与当前源码/数据重新渲染结果一致               */
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
      canonicalPath: pair.pageUrl,
      jsonLd: cardJsonLd(pair),
      mainHtml: renderCardMain(pair),
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

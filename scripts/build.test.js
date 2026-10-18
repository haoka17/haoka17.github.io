/**
 * build.js 单元测试（node:test + node:assert，零第三方依赖）
 * 运行：node --test scripts/
 *
 * 覆盖 design.md 1.3.9-A 测试矩阵：
 * validateData 契约（E1~E10）、toCardPairs 配对、slugOf 优先级与快照、
 * badge/nationwide 可选（E8）、renderFooterNav（11 入口/10 链接）、
 * title/description 唯一性与截断、外链属性、JSON-LD、priceRange 解析。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  SLUG_MAP,
  slugOf,
  validateData,
  parsePriceRange,
  toCardPairs,
  indexMeta,
  renderFooterNav,
  renderLayout,
  renderIndexMain,
  renderCardMain,
  indexJsonLd,
  cardJsonLd,
  assertExternalLinks,
  renderSitemap,
  renderRobots,
  renderLlmsTxt,
} = require('./build.js');

/* ---------- 测试数据工厂 ---------- */

function makeCard(overrides = {}) {
  return {
    name: '测试卡',
    url: 'https://card.example.com/',
    description: '测试平台简介',
    priceRange: '19-49元/月',
    ...overrides,
  };
}

function makeProxy(overrides = {}) {
  return {
    name: '测试卡代理',
    url: 'https://proxy.example.com/',
    ...overrides,
  };
}

/** 真实 data.js（10 对） */
function loadRealData() {
  // eslint-disable-next-line import/no-dynamic-require
  return require(path.resolve(__dirname, '..', 'data.js'));
}

/* ================================================================== */
/* 1. validateData 契约（E1~E4、E9）                                   */
/* ================================================================== */

test('validateData E1：list 与 proxyList 长度不一致时报错', () => {
  const { errors } = validateData([makeCard()], []);
  assert.ok(errors.some((e) => e.includes('长度不一致')), '应报长度不一致错误');
  assert.ok(errors.some((e) => e.includes('proxyList 为空数组')), '应同时报空数组错误');
});

test('validateData E3：缺失字段报错信息含数组名/索引/平台名/字段名', () => {
  const { errors } = validateData(
    [makeCard({ name: '好卡新耀', url: '', priceRange: undefined })],
    [makeProxy({ name: '' })]
  );
  assert.ok(errors.some((e) => e.includes('list[0](好卡新耀).url 缺失或为空')));
  assert.ok(errors.some((e) => e.includes('list[0](好卡新耀).priceRange 缺失或为空')));
  assert.ok(errors.some((e) => e.includes('proxyList[0](未知).name 缺失或为空')), '平台名缺失时用"未知"占位');
});

test('validateData E4：非法 URL（ftp://、非 URL）报错并回显原始值', () => {
  const { errors } = validateData(
    [makeCard({ url: 'ftp://bad.example.com/' })],
    [makeProxy({ url: 'not a url' })]
  );
  assert.ok(
    errors.some((e) => e.includes('list[0](测试卡).url 非法') && e.includes('ftp://bad.example.com/')),
    '应回显非法 URL 原值'
  );
  assert.ok(errors.some((e) => e.includes('proxyList[0](测试卡代理).url 非法')));
});

test('validateData E9：priceRange 无法解析时仅产生警告不阻断', () => {
  const { errors, warnings } = validateData(
    [makeCard({ name: '号易', priceRange: '详见官网' })],
    [makeProxy({ name: '号易代理' })]
  );
  assert.strictEqual(errors.length, 0, '不应有阻断性错误');
  assert.ok(warnings.some((w) => w.includes('无法解析出价格区间')), '应有 E9 警告');
});

/* ================================================================== */
/* 2. slugOf 优先级与冲突（E5/E6）                                     */
/* ================================================================== */

test('slugOf：条目 slug 优先于 SLUG_MAP；均未命中时收集 E6 错误', () => {
  assert.strictEqual(slugOf(makeCard({ name: '号易' }), 0), 'haoyi');
  assert.strictEqual(slugOf(makeCard({ name: '号易', slug: 'my-slug' }), 0), 'my-slug');

  const issues = { errors: [] };
  const result = slugOf(makeCard({ name: '新平台' }), 3, issues);
  assert.strictEqual(result, null);
  assert.strictEqual(issues.errors.length, 1);
  assert.ok(issues.errors[0].includes('list[3]'), '错误信息应含数组名与索引');
  assert.ok(issues.errors[0].includes('新平台'), '错误信息应含平台名');
  assert.ok(issues.errors[0].includes('slug'), '错误信息应指明字段');
});

test('validateData E5：slug 冲突时两个来源都被指明；保留名被拒绝', () => {
  const { errors } = validateData(
    [makeCard({ name: 'A平台', slug: 'same' }), makeCard({ name: 'B平台', slug: 'same' })],
    [makeProxy({ name: 'A平台代理' }), makeProxy({ name: 'B平台代理' })]
  );
  const conflict = errors.find((e) => e.includes('slug 冲突'));
  assert.ok(conflict, '应报 slug 冲突');
  assert.ok(conflict.includes('list[0]') && conflict.includes('A平台'));
  assert.ok(conflict.includes('list[1]') && conflict.includes('B平台'));

  const reserved = validateData(
    [makeCard({ name: 'C平台', slug: 'index' })],
    [makeProxy({ name: 'C平台代理' })]
  );
  assert.ok(reserved.errors.some((e) => e.includes('保留名')));
});

/* ================================================================== */
/* 3. 真实数据：SLUG_MAP 快照断言（现有 10 平台 → 期望 slug）          */
/* ================================================================== */

test('SLUG_MAP 快照：现有 10 个平台名映射为期望 slug（design.md 1.2.3）', () => {
  const expected = {
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
  assert.deepStrictEqual(SLUG_MAP, expected);
  for (const [name, slug] of Object.entries(expected)) {
    assert.strictEqual(slugOf({ name }, 0), slug, `${name} 应映射为 ${slug}`);
  }
});

/* ================================================================== */
/* 4. E7（代理命名约定，软警告）与配对恒等                             */
/* ================================================================== */

test('validateData E7：代理名不符合"平台名代理"约定时仅产生警告', () => {
  const { errors, warnings } = validateData(
    [makeCard({ name: '号易' })],
    [makeProxy({ name: '号易官方代理' })]
  );
  assert.strictEqual(errors.length, 0, 'E7 为软约束，不应阻断');
  const warning = warnings.find((w) => w.includes('第 0 对命名不符约定'));
  assert.ok(warning, '应有 E7 警告');
  assert.ok(warning.includes('list=号易') && warning.includes('proxy=号易官方代理'));
});

test('toCardPairs：pair[i].card === list[i]，pair[i].proxy === proxyList[i]', () => {
  const list = [makeCard({ name: 'A' }), makeCard({ name: 'B' })];
  const proxyList = [makeProxy({ name: 'A代理' }), makeProxy({ name: 'B代理' })];
  const pairs = toCardPairs(list, proxyList);
  assert.strictEqual(pairs[0].card, list[0]);
  assert.strictEqual(pairs[0].proxy, proxyList[0]);
  assert.strictEqual(pairs[1].card, list[1]);
  assert.strictEqual(pairs[1].proxy, proxyList[1]);
});

/* ================================================================== */
/* 5. E8（badge/nationwide 可选）与首页渲染                            */
/* ================================================================== */

test('renderIndexMain：badge/价格/覆盖标签/双链接/代理区；E8 缺失不渲染节点', () => {
  const pairs = [
    {
      card: {
        name: '测试卡A',
        url: 'https://a.example.com/?x=1&y=2#z',
        description: 'A'.repeat(60),
        priceRange: '19-49元/月',
        nationwide: true,
        badge: '四网',
      },
      proxy: { name: '测试卡A代理', url: 'https://pa.example.com/' },
      slug: 'test-a',
      price: { low: 19, high: 49 },
    },
    {
      card: {
        name: '测试卡B',
        url: 'https://b.example.com/',
        description: 'B'.repeat(60),
        priceRange: '9-29元/月',
      },
      proxy: { name: '测试卡B代理', url: 'https://pb.example.com/' },
      slug: 'test-b',
      price: { low: 9, high: 29 },
    },
  ];
  const html = renderIndexMain(pairs);

  // badge 与修饰类
  assert.ok(html.includes('badge-quad') && html.includes('>四网<'), 'badge 渲染含修饰类');
  // 全国标签
  assert.ok(html.includes('tag-nationwide') && html.includes('全国通用'));
  // B 卡（无 badge/nationwide）不渲染对应节点（E8）
  const cardB = html.slice(html.indexOf('测试卡B'), html.indexOf('proxy-section'));
  assert.ok(!cardB.includes('class="badge'), 'B 卡不应渲染 badge');
  assert.ok(!cardB.includes('tag-nationwide') && !cardB.includes('tag-region'), 'B 卡不应渲染覆盖标签');
  // 价格区间原样展示
  assert.ok(html.includes('19-49元/月') && html.includes('9-29元/月'));
  // hero 最低价文案
  assert.ok(html.includes('每月低至 9 元'), 'hero-meta 应取全部平台最低价');
  // 外链转义（& → &amp;）与安全属性
  assert.ok(html.includes('href="https://a.example.com/?x=1&amp;y=2#z"'), 'URL 特殊字符应被转义');
  assert.ok((html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length >= 4, '号卡外链+代理外链均含安全属性');
  // 站内详情链接（同窗口，无 target）
  assert.ok(html.includes('href="/card/test-a.html"'));
  // 代理合作区：仅代理链接，不含号卡办理链接（design.md 2.1 外链跳转约定）
  assert.ok(html.includes('代理合作入口') && html.includes('测试卡A代理'));
});

/* ================================================================== */
/* 6. renderCardMain（子页：信息 + 双 CTA）                            */
/* ================================================================== */

test('renderCardMain：name/description/priceRange/nationwide/badge 与双外链按钮', () => {
  const pair = {
    card: {
      name: '测试卡',
      url: 'https://card.example.com/',
      description: '测试描述文本',
      priceRange: '19-49元/月',
      nationwide: false,
      badge: '热门',
    },
    proxy: { name: '测试卡代理', url: 'https://proxy.example.com/' },
    slug: 'test',
  };
  const html = renderCardMain(pair);
  assert.ok(html.includes('<h1>测试卡</h1>'));
  assert.ok(html.includes('测试描述文本'));
  assert.ok(html.includes('19-49元/月'));
  assert.ok(html.includes('部分地区'), 'nationwide=false 应展示"部分地区"');
  assert.ok(html.includes('badge-hot') && html.includes('>热门<'));
  assert.ok(html.includes('href="https://card.example.com/" target="_blank" rel="noopener noreferrer"'));
  assert.ok(html.includes('href="https://proxy.example.com/" target="_blank" rel="noopener noreferrer"'));
});

/* ================================================================== */
/* 7. renderFooterNav（当前页排除自链接 + 11 入口/10 链接）            */
/* ================================================================== */

test('renderFooterNav：当前页为 span[aria-current]，其余为 <a>', () => {
  const pairs = toCardPairs(
    [makeCard({ name: '电信星卡' }), makeCard({ name: '172号卡' })],
    [makeProxy({ name: '电信星卡代理' }), makeProxy({ name: '172号卡代理' })]
  );
  const html = renderFooterNav('dianxin-xingka', pairs);

  const items = html.match(/<li>/g) || [];
  assert.strictEqual(items.length, 3, '首页 + 每个子页各一个入口');
  assert.ok(html.includes('<span aria-current="page" class="current">电信星卡</span>'));
  assert.ok(html.includes('<a href="/">首页</a>'));
  assert.ok(html.includes('href="/card/172-haoka.html"'));
  assert.strictEqual((html.match(/aria-current="page"/g) || []).length, 1, 'aria-current 全页唯一');
  assert.ok(!html.includes('href="/card/dianxin-xingka.html"'), '当前页不得出现自链接');

  const homeHtml = renderFooterNav('index', pairs);
  assert.ok(homeHtml.includes('<span aria-current="page" class="current">首页</span>'));
  assert.ok(homeHtml.includes('href="/card/dianxin-xingka.html"'));
});

test('renderFooterNav 真实数据：入口总数 = 11，链接数 = 10（design.md 1.3.9-A）', () => {
  const { list, proxyList } = loadRealData();
  const pairs = toCardPairs(list, proxyList);
  for (const current of ['index', ...pairs.map((p) => p.slug)]) {
    const html = renderFooterNav(current, pairs);
    assert.strictEqual((html.match(/<li>/g) || []).length, 11, '入口总数 = 11');
    assert.strictEqual((html.match(/<li><a /g) || []).length, 10, '链接数 = 10');
    assert.strictEqual((html.match(/aria-current="page"/g) || []).length, 1);
  }
});

/* ================================================================== */
/* 8. renderLayout（meta 全集 + JSON-LD 注入）                         */
/* ================================================================== */

test('renderLayout：SEO meta 全集、JSON-LD 注入、友情链接渲染', () => {
  const pairs = toCardPairs(
    [makeCard({ name: '号易' })],
    [makeProxy({ name: '号易代理' })]
  );
  const html = renderLayout({
    title: '测试页面标题',
    description: '测试页面描述',
    canonicalPath: 'https://haoka17.github.io/card/haoyi.html',
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage' },
    mainHtml: '<section><p>main content</p></section>',
    currentSlug: 'haoyi',
    pairs,
  });

  assert.ok(html.includes('<title>测试页面标题</title>'));
  assert.ok(html.includes('name="description" content="测试页面描述"'));
  assert.ok(html.includes('rel="canonical" href="https://haoka17.github.io/card/haoyi.html"'));
  for (const ogTag of ['og:type', 'og:site_name', 'og:locale', 'og:title', 'og:description', 'og:url', 'og:image']) {
    assert.ok(html.includes(ogTag), `缺少 ${ogTag}`);
  }
  assert.ok(html.includes('name="twitter:card"'));
  assert.ok(html.includes('<script type="application/ld+json">'), '应注入 JSON-LD');
  assert.ok(html.includes('friend-links'), '页脚友情链接区块存在');
  assert.ok(html.includes('<main id="main">'), 'main 地标存在');
});

/* ================================================================== */
/* 9. JSON-LD（解析不抛错 + 首页 ItemList + 子页双外链 ListItem）      */
/* ================================================================== */

test('cardJsonLd：WebPage + Product/AggregateOffer + 两个外链 ListItem；price 缺失省略 offers', () => {
  const pair = {
    card: {
      name: '测试卡',
      url: 'https://card.example.com/',
      description: 'd',
      priceRange: '19-49元/月',
      nationwide: true,
      badge: '热门',
    },
    proxy: { name: '测试卡代理', url: 'https://proxy.example.com/' },
    slug: 'test-card',
    pageUrl: 'https://haoka17.github.io/card/test-card.html',
    title: '测试卡流量卡怎么样？19-49元/月资费详情与办理入口 - 好卡导航',
    description: 'desc',
    price: { low: 19, high: 49 },
  };
  const ld = cardJsonLd(pair);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(ld)), 'JSON-LD 必须可序列化解析');
  assert.strictEqual(ld['@context'], 'https://schema.org');
  assert.strictEqual(ld['@graph'].length, 2);

  const webpage = ld['@graph'][0];
  assert.strictEqual(webpage['@type'], 'WebPage');
  assert.strictEqual(webpage.url, pair.pageUrl);
  assert.ok(!webpage.name.includes(' - 好卡导航'), 'WebPage name 不含站名后缀');
  assert.strictEqual(webpage.about['@type'], 'Product');
  assert.strictEqual(webpage.about.offers.priceCurrency, 'CNY');
  assert.strictEqual(webpage.about.offers.lowPrice, 19);
  assert.strictEqual(webpage.about.offers.highPrice, 49);

  const itemList = ld['@graph'][1];
  assert.strictEqual(itemList.itemListElement.length, 2, '两个外链入口');
  assert.strictEqual(itemList.itemListElement[0].url, 'https://card.example.com/');
  assert.strictEqual(itemList.itemListElement[1].url, 'https://proxy.example.com/');

  const noOffer = cardJsonLd({ ...pair, price: null });
  assert.strictEqual(noOffer['@graph'][0].about.offers, undefined, 'E9 降级：无价格时省略 offers');
});

test('indexJsonLd 真实数据：ItemList.numberOfItems === 10，11 页 JSON-LD 均可 JSON.parse', () => {
  const { list, proxyList } = loadRealData();
  const pairs = toCardPairs(list, proxyList);

  const indexLd = indexJsonLd(pairs);
  assert.strictEqual(indexLd['@graph'][1]['@type'], 'ItemList');
  assert.strictEqual(indexLd['@graph'][1].numberOfItems, 10);
  assert.strictEqual(indexLd['@graph'][1].itemListElement.length, 10);

  // 11 页 JSON-LD 序列化解析不抛错（renderLayout 内已做 < 转义）
  const pages = [
    renderLayout({
      title: 't', description: 'd', canonicalPath: 'https://haoka17.github.io/',
      jsonLd: indexLd, mainHtml: '', currentSlug: 'index', pairs,
    }),
    ...pairs.map((pair) => renderLayout({
      title: pair.title, description: pair.description, canonicalPath: pair.pageUrl,
      jsonLd: cardJsonLd(pair), mainHtml: '', currentSlug: pair.slug, pairs,
    })),
  ];
  for (const html of pages) {
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(match, '页面应含 JSON-LD script');
    assert.doesNotThrow(() => JSON.parse(match[1]), 'JSON-LD 内容必须可 JSON.parse');
  }
});

/* ================================================================== */
/* 10. 外链属性断言（assertExternalLinks）                             */
/* ================================================================== */

test('assertExternalLinks：缺失属性/javascript: 链接均被检出；站内链接豁免', () => {
  const missing = [];
  assertExternalLinks('t.html', '<a href="https://x.com/">x</a>', missing);
  assert.strictEqual(missing.length, 2, '缺少 target 与 rel 各报一条');

  const ok = [];
  assertExternalLinks(
    't.html',
    '<a href="https://x.com/" target="_blank" rel="noopener noreferrer">x</a>',
    ok
  );
  assert.strictEqual(ok.length, 0);

  const js = [];
  assertExternalLinks('t.html', '<a href="javascript:alert(1)">x</a>', js);
  assert.strictEqual(js.length, 1, 'javascript: 链接应被检出');

  const internal = [];
  assertExternalLinks('t.html', '<a href="/card/x.html">站内</a>', internal);
  assert.strictEqual(internal.length, 0, '站内链接不要求外链属性');
});

/* ================================================================== */
/* 11. priceRange 解析（3 组样例）                                     */
/* ================================================================== */

test('parsePriceRange：整数/小数/非法样例', () => {
  assert.deepStrictEqual(parsePriceRange('19-49元/月'), { low: 19, high: 49 });
  assert.deepStrictEqual(parsePriceRange('9.9-29.9元/月'), { low: 9.9, high: 29.9 });
  assert.strictEqual(parsePriceRange('详见官网'), null);
  assert.strictEqual(parsePriceRange('49-19元/月'), null, 'low > high 视为非法');
});

/* ================================================================== */
/* 12. 真实数据冒烟：校验零错误 + title/description 唯一性与截断规则   */
/* ================================================================== */

test('真实 data.js：10 对数据零错误，slug 唯一，11 页 title/description 两两唯一且 ≤160', () => {
  const { list, proxyList } = loadRealData();
  assert.strictEqual(list.length, 10);
  assert.strictEqual(proxyList.length, 10);

  const { errors } = validateData(list, proxyList);
  assert.strictEqual(errors.length, 0, '真实数据应零错误');

  const pairs = toCardPairs(list, proxyList);
  assert.strictEqual(pairs.length, 10);
  assert.strictEqual(new Set(pairs.map((p) => p.slug)).size, 10, 'slug 全部唯一');

  const meta = indexMeta(pairs);
  const titles = [meta.title, ...pairs.map((p) => p.title)];
  const descriptions = [meta.description, ...pairs.map((p) => p.description)];

  // 11 页两两唯一（FR-19）
  assert.strictEqual(new Set(titles).size, 11, 'title 两两唯一');
  assert.strictEqual(new Set(descriptions).size, 11, 'description 两两唯一');

  // 长度 ≤160
  for (const t of titles) assert.ok(t.length <= 160, `title 超长: ${t}`);
  for (const d of descriptions) assert.ok(d.length <= 160, `description 超长: ${d}`);

  // 子页 title/description 模板与 70 字截取规则
  for (const pair of pairs) {
    assert.ok(pair.title.startsWith(pair.card.name), 'title 以平台名开头');
    assert.ok(pair.title.includes(pair.card.priceRange), 'title 含资费区间');
    assert.ok(pair.description.startsWith(`${pair.card.name}流量卡资费 ${pair.card.priceRange}`));
    assert.ok(pair.description.endsWith('。提供官方办理入口与代理申请通道。'));
    // description 摘要 = card.description 前 70 字（长描述被截取）
    if (pair.card.description.length > 70) {
      assert.ok(pair.description.includes(pair.card.description.slice(0, 70)));
    }
    assert.strictEqual(
      pair.pageUrl,
      `https://haoka17.github.io/card/${pair.slug}.html`
    );
  }
});

/* ================================================================== */
/* 13. 数据完整性（任务 #5：字段存在且类型正确、https 前缀、按序配对）  */
/* ================================================================== */

test('数据完整性：list 与 proxyList 长度均为 10，10 对平台名按索引一一对应', () => {
  const { list, proxyList } = loadRealData();
  assert.strictEqual(list.length, 10, 'list 长度应为 10');
  assert.strictEqual(proxyList.length, 10, 'proxyList 长度应为 10');

  const expectedNames = [
    '电信星卡', '172号卡', '好卡新耀', '咔咔通信', '蛋蛋号卡',
    '灵渠号卡', '青禾号卡', '号易', '卡业联盟', '林夕号卡',
  ];
  assert.deepStrictEqual(list.map((c) => c.name), expectedNames, '10 个平台名按 data.js 顺序排列');
  for (let i = 0; i < expectedNames.length; i += 1) {
    assert.strictEqual(
      proxyList[i].name,
      `${expectedNames[i]}代理`,
      `第 ${i} 对代理名应符合 "{号卡名}代理" 约定`
    );
  }
});

test('数据完整性：list 每条必填字段存在且类型正确，url 均以 https:// 开头', () => {
  const { list } = loadRealData();
  for (let i = 0; i < list.length; i += 1) {
    const card = list[i];
    assert.ok(card && typeof card === 'object' && !Array.isArray(card), `list[${i}] 应为对象`);
    for (const field of ['name', 'url', 'description', 'priceRange']) {
      assert.strictEqual(
        typeof card[field], 'string',
        `list[${i}](${card.name}).${field} 应为字符串`
      );
      assert.notStrictEqual(card[field].trim(), '', `list[${i}](${card.name}).${field} 不应为空`);
    }
    assert.ok(
      card.url.startsWith('https://'),
      `list[${i}](${card.name}).url 应以 https:// 开头，实际: ${card.url}`
    );
    if (Object.prototype.hasOwnProperty.call(card, 'nationwide')) {
      assert.strictEqual(typeof card.nationwide, 'boolean', 'nationwide 若存在必须为 boolean');
    }
    if (Object.prototype.hasOwnProperty.call(card, 'badge')) {
      assert.ok(typeof card.badge === 'string' && card.badge !== '', 'badge 若存在必须为非空字符串');
    }
  }
});

test('数据完整性：proxyList 每条 name/url 存在且类型正确，url 均以 https:// 开头', () => {
  const { proxyList } = loadRealData();
  for (let i = 0; i < proxyList.length; i += 1) {
    const proxy = proxyList[i];
    assert.ok(proxy && typeof proxy === 'object' && !Array.isArray(proxy), `proxyList[${i}] 应为对象`);
    for (const field of ['name', 'url']) {
      assert.strictEqual(typeof proxy[field], 'string', `proxyList[${i}].${field} 应为字符串`);
      assert.notStrictEqual(proxy[field].trim(), '', `proxyList[${i}].${field} 不应为空`);
    }
    assert.ok(
      proxy.url.startsWith('https://'),
      `proxyList[${i}](${proxy.name}).url 应以 https:// 开头，实际: ${proxy.url}`
    );
  }
});

/* ================================================================== */
/* 14. indexMeta（首页 title/description/canonical 生成规则）          */
/* ================================================================== */

test('indexMeta：首页 title/description/canonical 与 design.md 1.3.5 模板一致', () => {
  const { list, proxyList } = loadRealData();
  const meta = indexMeta(toCardPairs(list, proxyList));

  assert.strictEqual(meta.title, '好卡导航 - 精选正规流量卡/号卡平台导航与代理入口');
  assert.strictEqual(
    meta.description,
    '聚合 10 个正规号卡平台官方办理入口与代理申请通道，覆盖电信星卡、172号卡等热门流量卡品牌，' +
    '附资费区间与适用地区说明，一站比选直达办理。'
  );
  assert.ok(meta.description.length <= 160, '首页 description ≤ 160 字符');
  assert.strictEqual(meta.canonicalPath, 'https://haoka17.github.io/');
});

/* ================================================================== */
/* 15. 站点级产物纯函数（renderSitemap / renderRobots / renderLlmsTxt）*/
/* ================================================================== */

test('renderSitemap：11 个 URL、首页 1.0/子页 0.8、顺序与 data.js 一致、lastmod 透传', () => {
  const { list, proxyList } = loadRealData();
  const pairs = toCardPairs(list, proxyList);
  const xml = renderSitemap(pairs, '2026-01-31');

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'XML 声明');
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));

  const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1]);
  assert.strictEqual(locs.length, 11, 'sitemap 应含 11 个 URL（首页 + 10 子页）');
  assert.strictEqual(locs[0], 'https://haoka17.github.io/', '首页 URL 位于首位');
  for (let i = 0; i < pairs.length; i += 1) {
    assert.strictEqual(locs[i + 1], pairs[i].pageUrl, `子页 URL 顺序应与 data.js 一致（第 ${i} 个）`);
  }

  assert.strictEqual((xml.match(/<priority>1\.0<\/priority>/g) || []).length, 1, '首页 priority 1.0 恰 1 个');
  assert.strictEqual((xml.match(/<priority>0\.8<\/priority>/g) || []).length, 10, '子页 priority 0.8 共 10 个');
  assert.strictEqual((xml.match(/<lastmod>2026-01-31<\/lastmod>/g) || []).length, 11, 'lastmod 应透传入参');
  assert.strictEqual((xml.match(/<changefreq>weekly<\/changefreq>/g) || []).length, 11, 'changefreq 全部 weekly');
});

test('renderSitemap：不传日期时 lastmod 默认为当天（YYYY-MM-DD 格式）', () => {
  const { list, proxyList } = loadRealData();
  const pairs = toCardPairs(list, proxyList);
  const xml = renderSitemap(pairs);
  const dates = Array.from(xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g), (m) => m[1]);
  assert.strictEqual(dates.length, 11);
  for (const d of dates) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
});

test('renderRobots：固定文案——允许全站抓取并声明 sitemap 绝对地址', () => {
  assert.strictEqual(
    renderRobots(),
    'User-agent: *\nAllow: /\n\nSitemap: https://haoka17.github.io/sitemap.xml\n'
  );
});

test('renderLlmsTxt：11 个页面 URL 与 sitemap 完全一致，子页行含平台名与资费', () => {
  const { list, proxyList } = loadRealData();
  const pairs = toCardPairs(list, proxyList);
  const llms = renderLlmsTxt(pairs);

  assert.ok(llms.startsWith('# 好卡导航\n'), 'H1 站名开头');
  assert.ok(llms.includes('## 站点页面'), '站点页面章节');
  assert.ok(llms.includes('## 说明'), '边界声明章节');

  const llmsUrls = Array.from(llms.matchAll(/\((https:\/\/haoka17\.github\.io\/[^)\s]*)\)/g), (m) => m[1]);
  const sitemapLocs = Array.from(
    renderSitemap(pairs).matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1]
  );
  assert.deepStrictEqual(
    [...new Set(llmsUrls)].sort(),
    [...new Set(sitemapLocs)].sort(),
    'llms.txt URL 集合应与 sitemap 完全一致（11 个）'
  );

  for (const pair of pairs) {
    const lineStart = llms.indexOf(`- [${pair.card.name}](${pair.pageUrl}):`);
    assert.ok(lineStart >= 0, `llms.txt 应含 ${pair.card.name} 页面行`);
    const lineEnd = llms.indexOf('\n', lineStart);
    const line = llms.slice(lineStart, lineEnd === -1 ? llms.length : lineEnd);
    assert.ok(line.includes(pair.card.priceRange), `${pair.card.name} 行应含资费区间`);
  }
});

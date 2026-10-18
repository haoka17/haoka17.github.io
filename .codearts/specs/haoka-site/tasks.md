# haoka-site 实施任务清单（tasks.md）

| 元信息 | 内容 |
| --- | --- |
| 特性名称 | haoka-site（号卡聚合企业官网） |
| 上游依据 | `.codearts/specs/haoka-site/spec.md`（FR-01~27 / NFR-01~20，共 47 条）＋ `.codearts/specs/haoka-site/design.md` |
| 任务规模 | 24 个原子任务 / 5 个阶段 / 预估总工时约 26~28 小时 |
| 构建命令 | `node scripts/build.js`（Node.js ≥18，零第三方依赖，仅 node:fs / node:path / node:url） |
| 测试命令 | `node --test scripts/`（node:test 内置框架） |
| 创建日期 | 2026-10-18 |

---

## 0. 依赖关系与并行策略总览

```text
T01 脚手架 ──┬─→ T02 静态资源（favicon / OG 图）
             ├─→ T15 → T16 → T17 样式分支（与构建链完全并行）
             ├─→ T18 main.js 渐进增强（独立并行）
             └─→ T04 → T05 → T06 → T07 → T08 → T09 → T10 → T11 → T12 → T13 → T14  ← 构建脚本串行主干
T03 data.js 改造（无前置依赖）─→ T04        │            └──T08~T12 完成──→ T20 渲染层单测（与 T13/T14 并行）
                                            └──T05+T06 完成──→ T19 校验/派生单测（与 T07+ 并行）

T13 + T14 + T17 + T18 + T19 + T20 ─→ T21 全站构建 ─→ T22 本地功能自测 ─→ T23 README 更新 ─→ T24 幂等验证与提交
```

- **必须串行**：
  - 构建脚本链 T04→T05→…→T14（同一文件 `scripts/build.js` 内递进实现，后一任务调用前一任务的函数与类型定义）；
  - 样式链 T15→T16→T17（同一文件 `assets/css/style.css` 递进）；
  - 交付链 T21→T22→T23→T24。
- **可并行**：① 样式分支（T15~T17）与构建脚本链（T04~T14）互不触碰对方文件，可全程并行；② T02、T03、T18 无强依赖，可任意穿插；③ T19 在 T05+T06 完成后即可开工、T20 在 T08~T12 完成后即可开工，均可与 T13/T14 并行。

---

## 阶段一：项目脚手架与数据准备（组内可并行）

### T01 项目脚手架与目录结构
**预估**：0.5h ｜ **依赖**：无 ｜ **并行性**：与 T02、T03 并行

**工作内容**：
1. 按 design.md 1.2.3 目录结构创建目录：`scripts/`、`assets/css/`、`assets/js/`、`assets/img/`、`card/`
2. 在仓库根创建空文件 `.nojekyll`（禁用 GitHub Pages 默认 Jekyll 处理，避免 `card/` 目录被额外处理）
3. 确认仓库根 = 站点根（用户站点 haoka17.github.io，根绝对路径 `/assets/...` 成立）

**涉及文件**：`scripts/`、`assets/css/`、`assets/js/`、`assets/img/`、`card/`、`.nojekyll`

**验收标准**：
- [ ] 5 个目录均已创建且路径与 design.md 1.2.3 完全一致
- [ ] `.nojekyll` 存在于仓库根
- [ ] `git status` 可见新增目录与文件

### T02 站点静态资源制作
**预估**：0.5h ｜ **依赖**：T01 ｜ **并行性**：可与构建链、样式链并行

**工作内容**：
1. 制作 `assets/img/favicon.svg`：简洁站点图标（六边形/号卡主题，主色 #2563EB，SVG 矢量）
2. 制作 `assets/img/og-default.png`：默认 OG 分享图，尺寸 1200×630，含站名"好卡导航"与主视觉基调（一次性生成入库，手工维护、不经构建）

**涉及文件**：`assets/img/favicon.svg`、`assets/img/og-default.png`

**验收标准**：
- [ ] favicon.svg 浏览器可直接渲染，无脚本依赖
- [ ] og-default.png 尺寸恰为 1200×630
- [ ] 两文件合计体积 ≤ 200 KB（为单页 500 KB 总预算留余量）

### T03 数据模块改造（data.js 添加模块导出）
**预估**：0.5h ｜ **依赖**：无 ｜ **并行性**：可随时完成（T04 前必须就绪）

**工作内容**：
1. 在 `data.js` 文件末尾添加 `module.exports = { list, proxyList };`，使构建脚本可 `require()` 读取（design.md 1.2.2 输入层契约）
2. 核对现有 10 对数据字段与 design.md 4.2 数据契约一致：list 条目必填 `name`/`url`/`description`/`priceRange`，可选 `nationwide`/`badge`/`slug`；proxyList 条目必填 `name`/`url`
3. **不改动任何 URL 值**——全部外链逐字符保持原值（含查询参数与锚点，如好卡新耀、号易的长参数 URL）
4. 确认 `list` 与 `proxyList` 长度均为 10、按索引一一对应（电信星卡、172号卡、好卡新耀、咔咔通信、蛋蛋号卡、灵渠号卡、青禾号卡、号易、卡业联盟、林夕号卡）

**涉及文件**：`data.js`

**验收标准**：
- [ ] `node -e "const d=require('./data.js');console.log(d.list.length,d.proxyList.length)"` 输出 `10 10`
- [ ] 全部条目必填字段完整非空
- [ ] `git diff data.js` 仅新增导出语句，URL 零改动

---

## 阶段二：构建脚本 scripts/build.js（串行主干）

### T04 构建脚本骨架与站点常量
**预估**：1h ｜ **依赖**：T01、T03 ｜ **并行性**：与样式链（T15+）并行

**工作内容**：
1. 创建 `scripts/build.js`，顶部以 JSDoc 标注数据契约类型：`CardItem`、`ProxyItem`、`CardPair`（字段与 design.md 4.2 逐一对应）
2. 定义站点级常量 `SITE = { baseUrl: 'https://haoka17.github.io', siteName: '好卡导航', ogImage: '/assets/img/og-default.png' }`（唯一配置来源）
3. 定义 `SLUG_MAP` 内置映射（design.md 4.2）：电信星卡→dianxin-xingka、172号卡→172-haoka、好卡新耀→haoka-xinyao、咔咔通信→kaka-tongxin、蛋蛋号卡→dandan-haoka、灵渠号卡→lingqu-haoka、青禾号卡→qinghe-haoka、号易→haoyi、卡业联盟→kaye-lianmeng、林夕号卡→linxi-haoka
4. 搭建 `main()` 流程骨架（require data.js → 校验 → 配对 → 渲染 → 写入，各环节先留函数桩）与统一错误输出框架（错误/警告均走 stderr、`BuildError` 全量收集、失败 `process.exit(1)`）
5. 预留 CLI 参数 `--verify` 的解析入口（自检模式，T14 实现）

**涉及文件**：`scripts/build.js`

**验收标准**：
- [ ] `node scripts/build.js` 骨架可运行不抛未捕获异常（允许输出占位提示）
- [ ] `SITE`、`SLUG_MAP`、三个 typedef 定义齐全且与 design.md 一致
- [ ] 零第三方依赖（无 package.json / node_modules，仅 node: 内置模块）

### T05 数据校验层 validateData()（含 slugOf）
**预估**：1.5h ｜ **依赖**：T04 ｜ **并行性**：串行（同文件）

**工作内容**：
1. 实现 `slugOf(item, index)`：优先级为条目 `slug` 字段 > `SLUG_MAP` > 抛 E6 错误；并做 E5 slug 冲突检测（含与保留名 `index` 冲突）
2. 实现 `validateData(list, proxyList)`，返回 `{ errors: string[], warnings: string[] }`，**fail-fast + 全量收集**（一次性收集全部错误再统一输出，E1~E6 任一命中即后续零产物）：
   - E1：`list` 与 `proxyList` 长度不一致 → `错误: list(N) 与 proxyList(M) 长度不一致，无法按索引一一配对`
   - E2：任一数组为空 → `错误: list/proxyList 为空数组`
   - E3：必填字段缺失/为空（name/url/description/priceRange）→ 错误信息含数组名、索引、平台名、字段名（如 `list[3](好卡新耀).priceRange 缺失或为空`）
   - E4：`url` 非法（`new URL()` 抛错或协议非 http/https）→ 报错并回显原值
   - E5：slug 冲突 → 报错并指明冲突来源
   - E6：平台名不在 SLUG_MAP 且未提供 `slug` 字段 → 报错并提示在 data.js 该条目增加 slug 字段
   - E7（软）：`proxyList[i].name !== list[i].name + '代理'` → 仅警告，不阻断
   - E8（软）：`badge`/`nationwide` 缺失 → 降级（不渲染对应节点），不报错
   - E10（软）：`description` 超长（>200 字符）→ 警告（渲染层 CSS 截断）

**涉及文件**：`scripts/build.js`

**验收标准**：
- [ ] 临时将 proxyList 减为 9 条构建 → exit(1)，输出含实际 N/M 的长度错误，且不产出任何文件
- [ ] 删除某条 priceRange 构建 → 错误信息含数组名+索引+平台名+字段名
- [ ] `ftp://` 或非 URL 输入 → E4 报错
- [ ] 代理名不符约定 → 仅警告（前缀"警告:"），构建继续
- [ ] 全部错误一次性输出（非遇错即停）
- [ ] 现有合法 data.js → 零错误零警告

### T06 配对与派生层 toCardPairs() / parsePriceRange()
**预估**：1h ｜ **依赖**：T05 ｜ **并行性**：串行（同文件）

**工作内容**：
1. 实现 `toCardPairs(list, proxyList)`：按**数组索引**配对（唯一稳定机制），产出 `CardPair[]`——`{ card, proxy, slug, pageUrl, price }`；`pageUrl = ${SITE.baseUrl}/card/${slug}.html`（title/description 派生由 T11 的模板函数补齐后并入）
2. 实现 `parsePriceRange(priceRange)`：正则提取价格区间，如 `19-49元/月` → `{ low: 19, high: 49 }`；解析失败返回 `null` 并触发 E9 警告（JSON-LD 省略 offers，页面文字仍原样展示 priceRange）
3. 保证数据完整性不变式：`pairs.length === list.length === proxyList.length`；slug 全局唯一

**涉及文件**：`scripts/build.js`

**验收标准**：
- [ ] `pair[i].card === list[i]` 且 `pair[i].proxy === proxyList[i]`（索引配对）
- [ ] 10 个平台派生 slug 与 SLUG_MAP 期望值完全一致
- [ ] `pageUrl` 形如 `https://haoka17.github.io/card/dianxin-xingka.html`
- [ ] `parsePriceRange('19-49元/月')` → `{low:19, high:49}`；非法输入 → `null` + 警告

### T07 通用布局模板 renderLayout()（含 HTML 转义）
**预估**：1.5h ｜ **依赖**：T06 ｜ **并行性**：串行（同文件）

**工作内容**：
1. 实现通用布局骨架 `renderLayout(page)`，参数契约：`{ title, description, canonicalPath, jsonLd, mainHtml, currentSlug }`，产出完整 HTML 文档
2. `<head>` 输出 design.md 1.3.5 头部标签全集：`meta charset=UTF-8`、`viewport`、`title`、`meta description`、`meta robots(index,follow)`、`canonical`（绝对 URL）、OG 全套（og:type=website / og:site_name=好卡导航 / og:locale=zh_CN / og:title / og:description / og:url / og:image 绝对地址）、`twitter:card=summary_large_image`、`link icon /assets/img/favicon.svg`、`link stylesheet /assets/css/style.css`、`script type="application/ld+json"`（JSON-LD 注入）
3. `<body>` 骨架：`a.skip-link` 跳到主要内容（`#main`，无障碍增强）→ `header.site-header`（container 内 logo"⬡ 好卡导航"链接回 `/` + `nav[aria-label=主导航]`）→ `main#main` → `footer.site-footer` → `script src=/assets/js/main.js defer`
4. `html lang="zh-CN"`；实现 `escapeHtml()` 工具函数（文本与属性上下文），保证 URL 含 `%`、`&`、`#` 时属性正确转义、不破坏 DOM

**涉及文件**：`scripts/build.js`

**验收标准**：
- [ ] 产出文档含 design.md 1.3.5 头部标签全集，逐项无遗漏
- [ ] logo/首页为站内链接，同窗口打开、无 target/rel
- [ ] 含 `&` 的 URL 经转义后输出合法 HTML 属性
- [ ] skip-link 存在且指向 `#main`；`lang="zh-CN"`

### T08 友情链接组件 renderFooterNav()
**预估**：1h ｜ **依赖**：T07 ｜ **并行性**：串行（同文件）

**工作内容**：
1. 实现 `renderFooterNav(currentSlug, pairs)`，产出 design.md 1.3.3 结构：`nav.friend-links[aria-label=友情链接] > h2.footer-title"友情链接" + ul > li ×11`
2. 11 入口 = 首页（`/`）+ 10 个子页（`/card/{slug}.html`），全部来自 `CardPair[]`，无硬编码
3. 当前页处理（D5 决策）：渲染为 `<span aria-current="page" class="current">`（非链接、高亮样式由 CSS 承接），**排除自链接**
4. 非当前页渲染为 `<a>` 同窗口站内跳转（无 target/rel），锚文本 = 目标页名称（"首页"/平台名）
5. 页脚版权行：`© {年} 好卡导航 · 免责声明`（年份可由 T18 的 main.js 注入，模板内留默认值）

**涉及文件**：`scripts/build.js`

**验收标准**：
- [ ] 任意 currentSlug 下：入口总数 = 11、`<a>` 链接数 = 10、当前页为 `span[aria-current=page]`
- [ ] 首页调用：`首页` 为 span，10 个子页链接齐全（FR-14）
- [ ] 子页调用：自身为 span，含首页 + 其余 9 个子页链接（FR-13）
- [ ] 全部友链锚文本有意义、同窗口跳转（FR-15/FR-25）

### T09 首页模板 renderIndexMain()
**预估**：1.5h ｜ **依赖**：T07、T08 ｜ **并行性**：串行（同文件）

**工作内容**：
1. 实现 `renderIndexMain(pairs)`，产出首页 `<main>` 区（design.md 1.3.1 首页线框）：
2. Hero 区：`section.hero`（浅色渐变背景）——`h1`"精选正规号卡平台导航"、副文案"聚合 10 大正规号卡平台官方办理入口，资费透明，另提供各平台代理申请通道"、`p.hero-meta`"覆盖 10 个平台 · 每月低至 19 元 · 全国可办"
3. 号卡平台区：`section[aria-labelledby] > h2"号卡平台" + ul.card-grid > li 卡片 ×10`，每张卡片含：
   - `h3{平台名}` + badge 角标（badge 存在时；E8 缺失则不渲染）
   - description 摘要（模板输出全文，2 行截断由 CSS `-webkit-line-clamp:2` 承接）
   - `p.price{priceRange}`
   - 全国标识：`nationwide === true` → "全国通用"标签；`false` → "部分地区"标签（FR-04/design 线框约定）
   - "查看详情 →"链接至 `card/{slug}.html`，整卡可点击进入子页
4. 代理合作入口区：`section.proxy-section`（深色/渐变分区）——`h2"代理合作入口"`、说明文案、`ul.proxy-grid > li > a 外链 ×10`（锚文本"{代理名} ↗"，统一 `target="_blank" rel="noopener noreferrer"`）
5. 标题层级：首页恰一个 h1（站点主题），h1→h2→h3 不跳级（FR-27）

**涉及文件**：`scripts/build.js`

**验收标准**：
- [ ] 10 张卡片与 data.js 一一对应，名称/描述/价格/徽章完整渲染（FR-01/FR-03）
- [ ] nationwide 布尔渲染正确（172号卡、咔咔通信为"全国通用"，电信星卡为"部分地区"）
- [ ] 10 个代理外链均含 `target="_blank" rel="noopener noreferrer"`，锚文本含代理名（FR-02/FR-06）
- [ ] 每卡"查看详情"指向正确子页 URL（可读 slug，FR-26）
- [ ] 首页恰一个 h1、无标题跳级

### T10 子页模板 renderCardMain()
**预估**：1h ｜ **依赖**：T07 ｜ **并行性**：串行（同文件，可在 T09 后立即进行）

**工作内容**：
1. 实现 `renderCardMain(pair)`，产出子页 `<main>` 区（design.md 1.3.1 子页线框）：
2. `section.card-detail`（白卡片）结构：
   - `p.eyebrow`"号卡平台"
   - `h1{平台名}` + badge 角标（如有；E8 缺失不渲染）
   - `ul.meta-row`：`💳 资费：{priceRange}`、`📍 {全国通用 | 部分地区}`（nationwide 缺省时整行省略）
   - `p.desc{description 全文}`（子页不截断）
   - `div.cta-group`（并排双按钮，移动端全宽堆叠由 CSS 承接）：`a.btn.btn-primary` 外链"前往号卡平台 ↗"（`list[i].url`）+ `a.btn.btn-secondary` 外链"申请成为代理 ↗"（`proxyList[i].url`），均带 `target="_blank" rel="noopener noreferrer"`
   - `p.note`"跳转至外部平台，本站不直接售卡"
3. 子页 h1 = 平台名（FR-27），标题层级不跳级

**涉及文件**：`scripts/build.js`

**验收标准**：
- [ ] 名称/描述/价格区间/徽章/全国标识渲染与 data.js 一致（FR-08）
- [ ] 双 CTA 外链 href 逐字符等于 `list[i].url` / `proxyList[i].url`（FR-09/FR-17，抽查含长查询参数链接）
- [ ] 外链属性齐全；badge/nationwide 缺省时对应节点不输出（E8）
- [ ] 子页恰一个 h1 且为平台名

### T11 SEO 元数据与 JSON-LD 生成
**预估**：2h ｜ **依赖**：T06 ｜ **并行性**：串行（同文件）

**工作内容**：
1. 实现页面元数据模板函数（构建期计算，保证 11 页互不重复）：
   - 首页 title：`好卡导航 - 精选正规流量卡/号卡平台导航与代理入口`；description：`聚合 10 个正规号卡平台官方办理入口与代理申请通道，覆盖电信星卡、172号卡等热门流量卡品牌，附资费区间与适用地区说明，一站比选直达办理。`
   - 子页 title：`{平台名}流量卡怎么样？{priceRange}资费详情与办理入口 - 好卡导航`；description：`{平台名}流量卡资费 {priceRange}，{description 截取前 70 字}。提供官方办理入口与代理申请通道。`（总长 ≤160 字符）
   - 构建期断言：11 页 title 与 description 两两去重，重复即构建报错
2. 实现首页 JSON-LD（`@graph` 联合发布）：`WebSite`（@id `…/#website`、name、url、description、inLanguage zh-CN）+ `ItemList`（numberOfItems=10、itemListElement 每项含 position（与 data.js 索引一致）、name（平台名）、url（子页绝对 URL））
3. 实现子页 JSON-LD：`WebPage`（@id `…/card/{slug}.html#webpage`、url、name（同 title）、description（同 meta）、isPartOf 指向 `#website`、about 内嵌 `Product`（name "{平台名}流量卡"、offers `AggregateOffer`（priceCurrency CNY、lowPrice/highPrice 由 parsePriceRange 派生、offerCount 1）））+ `ItemList`（两个外链 ListItem：position 1 前往{平台名}官方平台、position 2 申请成为{平台名}代理）
4. `price === null` 时省略 offers 节点（E9 降级）；JSON-LD 由 `JSON.stringify` 序列化注入 `renderLayout`

**涉及文件**：`scripts/build.js`

**验收标准**：
- [ ] 11 页 title/description 互不重复且均 ≤160 字符（FR-19）
- [ ] 子页 title 以平台名开头、含 priceRange（FR-10）
- [ ] 每页 JSON-LD `JSON.parse` 不抛错
- [ ] 首页 `ItemList.numberOfItems === 10`；子页 ItemList 恰含两个外链 ListItem
- [ ] `19-49元/月` → lowPrice 19 / highPrice 49；解析失败时无 offers 节点

### T12 站点级产物模板（sitemap / robots / llms.txt）
**预估**：1h ｜ **依赖**：T06 ｜ **并行性**：串行（同文件）

**工作内容**：
1. `renderSitemap(pairs)`：合法 urlset，11 个 `<url>`（首页 priority 1.0 + 10 子页 priority 0.8，`lastmod` = 构建日期 `YYYY-MM-DD`，`changefreq` weekly），顺序与 data.js 一致
2. `renderRobots()`：固定文案 `User-agent: *` / `Allow: /` / 空行 / `Sitemap: https://haoka17.github.io/sitemap.xml`
3. `renderLlmsTxt(pairs)`：遵循 llms.txt 社区规范——`# 好卡导航`（H1 站名）→ `>` 引用块站点摘要（纯静态导航站定位、无登录、无追踪说明）→ `## 站点页面`（11 行 `[名称](URL): 一句话说明`，子页行 = 平台名 + 资费 + 覆盖范围 + 双入口说明）→ `## 说明`（本站为导航站不直接售卡、资费以外部平台实时展示为准的边界声明）
4. 三者内容全部从 `CardPair[]` 派生，保证与页面强一致

**涉及文件**：`scripts/build.js`

**验收标准**：
- [ ] sitemap 可被 XML 解析器解析，11 个 `<loc>` 与产物路径一一对应（FR-20）
- [ ] robots.txt 含 `Allow: /` 与完整 sitemap 绝对 URL（FR-21）
- [ ] llms.txt 为 UTF-8 纯文本，含 11 个页面 URL，URL 集合与 sitemap 完全一致（FR-24）

### T13 写入层与主流程 main()（原子性 + 幂等）
**预估**：1.5h ｜ **依赖**：T05~T12 全部 ｜ **并行性**：串行（汇合点）

**工作内容**：
1. 打通 `main()` 主流程：`require('./data.js')` → `validateData`（errors 非空 → stderr 输出全部错误 → `process.exit(1)`，**零产物**）→ `toCardPairs` → 全部页面与产物字符串**先在内存渲染完成**（首页、10 子页、sitemap、robots、llms.txt）→ 渲染全部成功后**清空 `card/` 目录再统一写盘**（E12 原子性：渲染期任一异常则捕获输出 `错误: 渲染 {页面} 失败: {原因}` 且不落盘；E11 写入失败透传 Node 原生错误 + 非零退出）
2. 幂等实现：内容未变化的文件跳过写入（减少 git diff 噪音）；每次构建先清空 `card/` 保证删除号卡对后旧子页自动消失
3. 外链属性保障：渲染层对外链统一注入 `target="_blank" rel="noopener noreferrer"`，并在写盘前断言每页全部 `http(s)://` 外链均含该属性
4. 构建后自校验：sitemap URL 数 === 生成的 HTML 文件数 === `list.length + 1`
5. 成功时 stdout 输出构建摘要：页面数、产物总字节数、警告数

**涉及文件**：`scripts/build.js`、`index.html`、`card/*.html`、`sitemap.xml`、`robots.txt`、`llms.txt`（产物）

**验收标准**：
- [ ] `node scripts/build.js` 一次生成 index.html + card/*.html ×10 + sitemap.xml + robots.txt + llms.txt
- [ ] 校验失败时零文件写入（不存在半成品站点）
- [ ] 连续运行两次：第二次跳过未变更文件且产物无 diff
- [ ] 20×11 处外链属性断言全部通过
- [ ] 构建摘要输出页面数/字节数/警告数

### T14 --verify 产物自检模式
**预估**：1h ｜ **依赖**：T13 ｜ **并行性**：串行（同文件）

**工作内容**：
1. 实现 `node scripts/build.js --verify`：对已生成产物执行 design.md 1.3.9-B 全项校验（供 CI/测试阶段复用）：
   - 文件完整性：`index.html` + `card/*.html` 数 === `list.length`；`card/` 无残留旧文件
   - 语义结构：11 页均含 `header/nav/main/section/footer`；每页恰一个 `h1`；无标题跳级
   - SEO 标签：每页含 viewport、canonical、description；title/description 全站唯一
   - sitemap/robots：`<loc>` 数 === 11 且每个 loc 对应实际存在的产物文件；robots 含 Sitemap 行
   - llms.txt：存在、含 11 个页面 URL、与 sitemap URL 集合一致
   - 外链安全：全部外链含 `rel="noopener noreferrer"` 与 `target="_blank"`；无 `javascript:` 链接
2. 校验失败时逐项列出问题并 `exit(1)`；全部通过输出通过清单

**涉及文件**：`scripts/build.js`

**验收标准**：
- [ ] 产物完好时 `--verify` 通过（exit 0）并输出校验清单
- [ ] 人为删除一个子页/篡改一处外链属性后 `--verify` 报错（exit 1）且指明问题项

---

## 阶段三：样式与渐进增强（与阶段二并行）

### T15 设计令牌与基础样式
**预估**：1h ｜ **依赖**：T01 ｜ **并行性**：与构建脚本链并行；组内 T15→T16→T17 串行

**工作内容**：
1. 创建 `assets/css/style.css`，在 `:root` 定义全站唯一设计令牌（design.md 1.3.2 配色表逐一落地）：`--color-primary:#2563EB`、`--color-primary-hover:#1D4ED8`、`--color-primary-light:#EFF6FF`、`--color-accent:#7C3AED`、`--color-price:#059669`、`--color-bg:#F8FAFC`、`--color-surface:#FFFFFF`、`--color-text:#0F172A`、`--color-text-secondary:#475569`、`--color-border:#E2E8F0`、`--color-footer-bg:#0F172A`、`--color-footer-text:#94A3B8` + badge 三色（热门 `#F59E0B` / 新品 `#06B6D4` / 四网 `#3B82F6`）
2. 字体栈（零 webfont）：`system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
3. 字体层级：h1 `clamp(1.75rem,4vw,2.5rem)`/700、h2 `clamp(1.25rem,3vw,1.5rem)`/650、h3 `1.125rem`/600、正文 `1rem`/400/行高 1.7、辅助 `0.875rem`、价格 `1.25rem`/700/绿
4. 间距体系（4px 基数）与容器：`.container { max-width:1152px; margin-inline:auto; padding-inline:16px; }`（≥768px 时 32px）
5. 基础 reset、`box-sizing`、body 背景与文字色

**涉及文件**：`assets/css/style.css`

**验收标准**：
- [ ] 令牌齐全且色值与 design.md 1.3.2 表格逐一对应
- [ ] 正文 16px（≥14px）、行高 1.7；对比度：正文/白底 ≥4.5:1、辅助文字 ≥4.5:1（NFR-19）
- [ ] 无任何 webfont/外部资源请求

### T16 组件与区块样式
**预估**：1.5h ｜ **依赖**：T15 ｜ **并行性**：串行（同文件）

**工作内容**：
1. header 吸顶（白底、底部 1px 边框），logo 主色可点击
2. hero 浅色渐变背景（`--color-primary-light` 基调）
3. 卡片：白底、`border-radius:12px`、`1px solid var(--color-border)`、阴影 `0 1px 3px rgba(15,23,42,.06)`；hover `translateY(-4px)` + 阴影 `0 12px 24px rgba(37,99,235,.12)` + 主色边框、`transition: all .2s ease`；`:focus-visible` 同效
4. badge 角标：绝对定位右上角、圆角胶囊、白字、按"热门/新品/四网"分色
5. 按钮三件套：`.btn` 基类（inline-flex、`min-height:44px`、padding 12px 24px、圆角 8px、600 字重）；`.btn-primary` 主色填充白字、hover 深化轻上移；`.btn-secondary` 白底 1.5px 主色描边主色字、hover 浅蓝底；全局 `:focus-visible { outline:2px solid var(--color-primary); outline-offset:2px; }`
6. 代理区深色/渐变背景与 proxy-grid；页脚深色底（`--color-footer-bg`）、friend-links 链接 `--color-footer-text`、hover/聚焦变白+下划线、flex wrap 间隔 16px
7. 卡片 description 2 行截断（`-webkit-line-clamp:2`）；skip-link 样式（默认隐藏、聚焦时可见）；meta-row、eyebrow、note、copyright 样式

**涉及文件**：`assets/css/style.css`

**验收标准**：
- [ ] 卡片/按钮规格与 design.md 1.3.2 逐项一致
- [ ] 按钮与全部可点击元素触控目标 ≥44×44（NFR-17）
- [ ] hover 与 Tab 聚焦遍历全部可交互元素均有可感知反馈（NFR-18）
- [ ] 当前页友链高亮样式（primary 色 + 600 字重）生效

### T17 响应式与移动端适配
**预估**：1h ｜ **依赖**：T16 ｜ **并行性**：串行（同文件）

**工作内容**：
1. 桌面优先 + `max-width` 媒体查询，三断点（design.md 1.3.2 表）：默认（≥1024px）card-grid 3 列 / proxy-grid 5 列；`max-width:1023px` 2/3 列；`max-width:767px` 1/2 列
2. 移动端补充：header 单行自适应；CTA 按钮组 `flex-direction:column` 全宽堆叠；friend-links 自动换行
3. 全部断点禁横向滚动（`overflow-x` 校验点）

**涉及文件**：`assets/css/style.css`

**验收标准**：
- [ ] 1280px / 768px / 375px 视口下号卡网格 3/2/1 列、代理网格 5/3/2 列（NFR-16）
- [ ] 375px 下无横向滚动条
- [ ] 移动端触控目标全部 ≥44×44 px

### T18 渐进增强脚本 main.js
**预估**：0.5h ｜ **依赖**：T01 ｜ **并行性**：独立并行（不依赖构建链与样式链）

**工作内容**：
1. 创建 `assets/js/main.js`：卡片入场渐显动画（如 IntersectionObserver 添加可见类）、页脚版权年份注入（`© {年}`）
2. 严格渐进增强：页面核心内容与全部链接**不依赖此脚本**渲染（FR-23/NFR 可靠性），脚本加载失败不影响任何功能
3. 无任何外部网络请求、无追踪逻辑（NFR-09）

**涉及文件**：`assets/js/main.js`

**验收标准**：
- [ ] 禁用 JavaScript 后页面内容与全部链接完整可用
- [ ] 模板以 `defer` 方式引用脚本（T07 已就位）
- [ ] 脚本内无网络请求、无 Cookie/localStorage 写入

---

## 阶段四：单元测试（可与 T13/T14 并行）

### T19 单元测试：校验与派生层
**预估**：1.5h ｜ **依赖**：T05、T06 ｜ **并行性**：可与 T07+ 并行

**工作内容**：
1. 创建 `scripts/build.test.js`（node:test 内置框架），覆盖 design.md 1.3.9-A 校验与派生测试点：
2. `validateData()` 契约：长度不等 → 报错（E1）；空数组 → 报错（E2）；逐字段缺失 → 报错且信息含索引与字段名（E3）；`ftp://`、非 URL → 报错（E4）；合法数据 → 零错误
3. `toCardPairs()` 配对：`pair[i].card === list[i]`、`pair[i].proxy === proxyList[i]`；名称不符约定仅产生警告（E7）不抛错
4. `slugOf()`：优先级（条目 slug 字段 > SLUG_MAP > E6 报错）；冲突检测（E5）；现有 10 个平台名 → 期望 slug 快照断言
5. `parsePriceRange()`：`19-49元/月` → `{low:19,high:49}`；无法解析 → 返回 `null` + 警告（E9）

**涉及文件**：`scripts/build.test.js`

**验收标准**：
- [ ] `node --test scripts/` 全部通过
- [ ] 上述用例逐条存在且断言信息可读（失败输出能定位问题）

### T20 单元测试：渲染层
**预估**：2h ｜ **依赖**：T08~T12 ｜ **并行性**：可与 T13/T14 并行

**工作内容**：
1. 在 `scripts/build.test.js` 补充渲染层测试（design.md 1.3.9-A 渲染测试点）：
2. `renderFooterNav()`：当前页为 `span[aria-current]`，其余为 `<a>`；入口总数 = 11、链接数 = 10
3. title/description：11 页两两去重断言；截断规则（≤160 字符、70 字截取 + 固定后缀）
4. 外链属性：渲染输出中每个 `http(s)://` 外链均含 `target="_blank" rel="noopener noreferrer"`
5. JSON-LD：每页 `application/ld+json` 内容 `JSON.parse` 不抛错；首页 `ItemList.numberOfItems === 10`；子页含两个外链 ListItem；price 为 null 时无 offers 节点
6. badge/nationwide 可选：缺失时正常构建且渲染输出不含对应节点（E8）

**涉及文件**：`scripts/build.test.js`

**验收标准**：
- [ ] `node --test scripts/` 全部通过
- [ ] design.md 1.3.9-A 表中全部测试点均已落地（可对照勾验）

---

## 阶段五：构建、自测与交付（串行收尾）

### T21 全站构建与产物生成
**预估**：0.5h ｜ **依赖**：T13、T14、T17、T18、T19、T20 ｜ **并行性**：串行（汇合点）

**工作内容**：
1. 执行 `node scripts/build.js` 生成全部产物
2. 执行 `node --test scripts/` 确认单测通过
3. 执行 `node scripts/build.js --verify` 确认产物自检通过
4. 核对产物引用的静态资源路径全部存在（`/assets/css/style.css`、`/assets/js/main.js`、`/assets/img/favicon.svg`、`/assets/img/og-default.png`）

**涉及文件**：全部产物（`index.html`、`card/*.html`、`sitemap.xml`、`robots.txt`、`llms.txt`）

**验收标准**：
- [ ] 产物清单齐全：index.html + card/×10 + sitemap.xml + robots.txt + llms.txt + assets/ + .nojekyll
- [ ] 单测与 `--verify` 全部通过
- [ ] 产物内引用的全部资源路径真实存在（无 404 引用）

### T22 本地功能自测（DoD 核心验证）
**预估**：1.5h ｜ **依赖**：T21 ｜ **并行性**：串行

**工作内容**：
1. 用浏览器逐项验证（本地静态服务器或 file:// 打开，对应 spec 第 7 章验收场景）：
   - 11 个页面均可打开，UTF-8 中文显示正常、无乱码
   - 首页 10 张卡片字段与 data.js 一致；10 个代理外链 + 10 个"查看详情"子页入口齐全
   - 11 页底部友情链接互跳：首页含全部 10 个子页入口；子页含首页 + 其余 9 个子页；无自链接；当前页高亮；同窗口跳转
   - 全部外链 `target="_blank" rel="noopener noreferrer"`，href 逐字符一致（重点抽查含长查询参数的好卡新耀、号易、咔咔通信链接）
   - 禁用 JS 后页面核心内容、20 个外链入口、友情链接完整可见可点击
   - 375 / 768 / 1280 三视口下列数 1/2/1→3 正确、无横向滚动
   - Lighthouse 移动端模拟：LCP ≤3s、无运行时 API 请求、单页资源 ≤500 KB
2. 记录自测结果，发现问题回溯修复后复测

**涉及文件**：全部产物（验证对象）

**验收标准**：
- [ ] 上述检查项逐项通过并留有自测记录
- [ ] 发现的缺陷已修复或登记

### T23 README 更新
**预估**：0.5h ｜ **依赖**：T21 ｜ **并行性**：可与 T22 并行

**工作内容**：
1. 重写 `README.md`：项目简介（号卡/流量卡聚合导航站，纯静态 MPA）
2. 目录结构说明（data.js 唯一数据源、scripts/ 构建与测试、card/ 产物、assets/ 静态资源）
3. 使用指南：本地构建 `node scripts/build.js`（Node ≥18 零依赖）、测试 `node --test scripts/`、自检 `node scripts/build.js --verify`
4. 数据维护指南（对应 design.md 1.3.8 改动面表）：修改/新增/删除号卡对只动 `data.js`，重建后首页、子页、友链、sitemap、llms.txt、JSON-LD 全部自动联动；新增平台建议直接写 `slug` 字段
5. 部署说明：构建产物直接提交仓库、GitHub Pages 零构建、`.nojekyll` 的作用

**涉及文件**：`README.md`

**验收标准**：
- [ ] 覆盖上述全部要点，命令可直接复制执行
- [ ] 描述与实际目录/命令一致

### T24 幂等性验证与产物提交
**预估**：0.5h ｜ **依赖**：T22、T23 ｜ **并行性**：串行（最终交付）

**工作内容**：
1. 幂等验证：连续两次 `node scripts/build.js`，第二次应跳过未变更文件，`git status` 零 diff
2. 数据联动验证（NFR-10/11）：临时修改 data.js 中某平台 priceRange → 重建 → 首页与对应子页同步展示新价格、其他页面不受影响；验证后将 data.js 恢复原值并重建
3. 提交入库：`git add`（data.js、scripts/、assets/、card/、index.html、sitemap.xml、robots.txt、llms.txt、.nojekyll、README.md）→ commit，完成 GitHub Pages 零构建部署就绪

**涉及文件**：全部产物与源码

**验收标准**：
- [ ] 两次构建零 diff（幂等）
- [ ] 数据变更联动验证通过，data.js 已恢复原值且站点已重建
- [ ] 全部产物已提交，工作区干净

---

## 完成的定义（DoD）

- [ ] 全部 11 个页面（index.html + card/×10）本地浏览器可打开，内容与 data.js 一致
- [ ] 11 个页面底部友情链接互跳正确：首页含 10 个子页入口，每个子页含首页 + 其余 9 个子页（无自链接、当前页高亮、同窗口跳转）
- [ ] 全部外链均带 `target="_blank" rel="noopener noreferrer"`，href 与 data.js 逐字符一致（含长查询参数链接）
- [ ] sitemap.xml 覆盖全部 11 页 URL；robots.txt 声明 sitemap；llms.txt 含 11 入口且与 sitemap URL 集合一致
- [ ] 构建脚本幂等：`node scripts/build.js` 可重复运行，产物一致（未变文件跳过写入、无残留旧子页）
- [ ] `node --test scripts/` 全部通过；`node scripts/build.js --verify` 通过
- [ ] 响应式 1280/768/375 视口 = 3/2/1 列、无横向滚动；禁用 JS 页面完整可用
- [ ] 构建产物与源码已提交仓库，GitHub Pages 零构建部署就绪

---

## 需求覆盖映射（design.md / spec.md → 任务）

| 设计域（design.md） | 需求条目（spec.md） | 对应任务 |
| --- | --- | --- |
| 目录结构与 .nojekyll（1.2.3） | NFR-12 | T01 |
| data.js module.exports（1.2.2 / 4.2） | NFR-10 | T03 |
| validateData E1~E10（1.3.7 / 6.3） | 数据约束 | T05、T19 |
| 配对/派生/slug/priceRange（1.2.5 / 4.2） | FR-26 | T05、T06、T19 |
| 页面骨架 renderLayout（1.3.1 / 1.3.5） | FR-18、FR-23、FR-27、NFR-14 | T07 |
| 友情链接组件（1.3.3） | FR-12~FR-15、NFR-20 | T08、T20 |
| 首页模板（1.3.1 线框） | FR-01~FR-06、FR-25 | T09 |
| 子页模板（1.3.1 线框） | FR-07~FR-09 | T10 |
| SEO meta 与 JSON-LD（1.3.5 / 1.3.6） | FR-10、FR-19、FR-22 | T11、T20 |
| sitemap / robots / llms.txt（1.3.5 / 1.3.6） | FR-20、FR-21、FR-24 | T12 |
| 写入层/原子性/幂等（1.2.4 / 1.3.7 E11~E12） | NFR-11、NFR-12 | T13、T24 |
| 产物自检 --verify（1.3.9-B） | 7.2 检查项 | T14 |
| UI 设计规范（1.3.2） | NFR-15~NFR-19 | T15、T16、T17 |
| 渐进增强 JS（1.2.4） | FR-23 | T18 |
| 单元测试策略 A（1.3.9-A） | 7.2 工程检查项 | T19、T20 |
| 浏览器验收 C（1.3.9-C / spec 第 7 章） | 全部验收场景 | T22 |
| 可维护性联动（1.3.8） | NFR-10~NFR-12 | T03、T23、T24 |


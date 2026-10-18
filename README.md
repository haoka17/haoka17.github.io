# 好卡导航（haoka17.github.io）

号卡/流量卡聚合导航站：聚合 10 个正规号卡平台的**官方办理入口**与**代理申请入口**，为每个平台提供独立介绍页（资费区间、是否全国通用、平台简介）。纯静态站点，部署于 GitHub Pages 用户站点，无后端、无第三方依赖、无追踪脚本。

## 项目结构

```
haoka17.github.io/                # 仓库根 = 站点根（GitHub Pages 用户站点）
├── data.js                       # ★ 唯一人工维护数据源（10 对号卡/代理，索引一一对应）
├── scripts/
│   ├── build.js                  # 构建脚本（Node.js ≥18，零第三方依赖）
│   └── build.test.js             # 构建逻辑单测（node:test 内置框架）
├── index.html                    # 首页（构建产物，提交仓库）
├── card/                         # 10 个子页（构建产物，构建时先清理再全量生成）
│   ├── dianxin-xingka.html       #   电信星卡
│   ├── 172-haoka.html            #   172号卡
│   ├── haoka-xinyao.html         #   好卡新耀
│   ├── kaka-tongxin.html         #   咔咔通信
│   ├── dandan-haoka.html         #   蛋蛋号卡
│   ├── lingqu-haoka.html         #   灵渠号卡
│   ├── qinghe-haoka.html         #   青禾号卡
│   ├── haoyi.html                #   号易
│   ├── kaye-lianmeng.html        #   卡业联盟
│   └── linxi-haoka.html          #   林夕号卡
├── assets/
│   ├── css/style.css             # 全站共享样式（CSS 变量设计令牌）
│   ├── js/main.js                # 渐进增强脚本（页面功能不依赖 JS）
│   └── img/                      # favicon.svg + og-default.png（1200×630）
├── sitemap.xml                   # 构建产物（11 个 URL）
├── robots.txt                    # 构建产物（含 Sitemap 声明）
├── llms.txt                      # 构建产物（AI 爬虫站点说明）
├── .nojekyll                     # 禁用 GitHub Pages 默认 Jekyll 处理
└── README.md
```

## 本地预览

产物为纯静态文件，任选一种方式在仓库根目录起本地服务：

```bash
# Python
python -m http.server 8000

# 或 Node（npx 无需安装）
npx serve .

# 或 Node 内置（v18+ 单文件预览）
npx http-server -p 8000
```

访问 <http://localhost:8000/>（首页）或 <http://localhost:8000/card/haoyi.html>（任一子页）。

## 修改数据与重新构建

所有内容（平台名、链接、简介、资费、badge、覆盖范围）只改 **`data.js`** 一处：

```bash
# 1. 编辑 data.js（list 与 proxyList 按索引一一对应，长度必须一致）
# 2. 重建全部产物（幂等，未变更文件跳过写入）
node scripts/build.js

# 3.（可选）产物自检：文件完整性 / 语义结构 / SEO 标签 / sitemap / robots / llms.txt / 外链安全
node scripts/build.js --verify

# 4. 提交（构建产物提交入库，GitHub Pages 直接发布）
git add -A && git commit -m "chore: rebuild site"
```

新增平台：在 `data.js` 两个数组末尾各加一条（保持索引对应），并在新条目上写 `slug` 字段（小写拼音 + 连字符，如 `slug: 'xin-pingtai'`）；构建脚本会自动生成子页、友情链接、sitemap 与 llms.txt。若不写 `slug` 且平台名不在内置映射表中，构建会报错退出（E6）。

## 运行单元测试

```bash
# node:test 内置框架，零依赖，Node ≥ 18
node --test scripts/build.test.js
```

覆盖：数据校验契约（E1~E10 错误码）、索引配对、slug 派生与快照、友链导航（11 入口/10 链接）、SEO 元数据唯一性、外链安全属性、JSON-LD 结构、priceRange 解析等 19 个用例。

## 约定速查

| 事项 | 约定 |
| --- | --- |
| 数据配对 | `list[i]` ↔ `proxyList[i]`（数组索引，长度必须一致） |
| 子页 URL | `/card/{slug}.html`，slug = 拼音小写 + 连字符 |
| 外链安全 | 所有外部链接 `target="_blank" rel="noopener noreferrer"` |
| 友情链接 | 每页页脚 11 入口（首页 + 10 子页），当前页高亮排除自链接 |
| SEO | 每页独立 title/description/canonical/OG；title/description 全站唯一 |
| 结构化数据 | 首页 WebSite + ItemList；子页 WebPage（Product/AggregateOffer）+ 外链 ItemList |
| 设计规范 | 详见 `.codearts/specs/haoka-site/`（spec.md / design.md） |

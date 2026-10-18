#!/usr/bin/env node
/**
 * favicon PNG 生成脚本（Node.js ≥ 18，零第三方依赖，仅 node: 内置模块）
 *
 * 用途：补全 Safari/iOS 与老浏览器的 favicon 显示（favicon.svg 仅现代浏览器支持），
 *      生成以下三个文件，设计语言与 assets/img/favicon.svg 一致
 *      （#2563EB 蓝底 + 白色六边形 + SIM 卡白色矩形，内嵌两个蓝色小缺口）：
 *        - assets/img/favicon-32.png        32×32（小尺寸：六边形改实心填充保证可辨识）
 *        - assets/img/favicon-16.png        16×16（小尺寸：六边形改实心填充保证可辨识）
 *        - assets/img/apple-touch-icon.png  180×180（iOS 自动圆角，背景做直角满幅，六边形描边风格同 SVG）
 *
 * 运行：node scripts/gen-favicon.js
 *
 * 实现：手写 PNG 编码（IHDR/IDAT/IEND），node:zlib deflateSync 压缩，
 *      CRC32 优先用 zlib.crc32（Node ≥ 20.15），否则查表实现；
 *      全部形状以 SVG viewBox（0 0 32 32）设计坐标定义，每像素 4×4 超采样抗锯齿。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

/* ================================================================== */
/* 颜色与几何常量（与 assets/img/favicon.svg 的 viewBox 0 0 32 32 对齐） */
/* ================================================================== */

/** #2563EB 蓝底 / 描边缺口色 */
const BLUE = [0x25, 0x63, 0xeb];
/** 白色六边形 / SIM 卡矩形 */
const WHITE = [0xff, 0xff, 0xff];

/** 白色六边形顶点（尖顶正六边形，中心 (16,16)，半径 10.5，与 SVG path 逐点一致） */
const HEXAGON = [
  [16, 5.5], [25.1, 10.75], [25.1, 21.25],
  [16, 26.5], [6.9, 21.25], [6.9, 10.75],
];
/** 描边风格线宽（同 SVG stroke-width="2.2"） */
const HEX_STROKE = 2.2;

/** SIM 卡白色矩形（同 SVG rect x=12 y=12 w=8 h=11 rx=1.5） */
const SIM = { x: 12, y: 12, w: 8, h: 11, r: 1.5 };
/** SIM 卡内嵌两个蓝色小缺口（同 SVG rect，y 13.5 与 16.5 两处） */
const NOTCHES = [
  { x: 14.5, y: 13.5, w: 3, h: 2, r: 0.5 },
  { x: 14.5, y: 16.5, w: 3, h: 2, r: 0.5 },
];

/** 设计坐标边长（viewBox 尺寸） */
const DESIGN_SIZE = 32;
/** 每像素每轴超采样倍数（4× → 每像素 16 个子样本） */
const SS = 4;

/* ================================================================== */
/* 纯函数：CRC32 / SDF 几何 / 采样 / 编码（module.exports 供单测复用） */
/* ================================================================== */

/** CRC32 查表（多项式 0xEDB88320，PNG chunk 校验用） */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * CRC32 校验和：优先使用 node:zlib 内置实现（Node ≥ 20.15），否则回退查表实现。
 * @param {Buffer} data
 * @returns {number} 无符号 32 位整数
 */
function crc32(data) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(data) >>> 0;
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 构造凸多边形近似有符号距离函数（SDF，内负外正，绝对值 ≈ 到边界的距离）。
 * @param {[number, number][]} pts 凸多边形顶点数组
 * @returns {(x: number, y: number) => number}
 */
function makeConvexPolygonSdf(pts) {
  const n = pts.length;
  // 重心（用于统一边法线朝外）
  const cx = pts.reduce((s, p) => s + p[0], 0) / n;
  const cy = pts.reduce((s, p) => s + p[1], 0) / n;
  const edges = [];
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    const ex = bx - ax;
    const ey = by - ay;
    const len = Math.hypot(ex, ey) || 1;
    let nx = ey / len;
    let ny = -ex / len;
    // 法线与"边中点 → 重心"方向同侧说明朝内，翻转成朝外
    if (nx * (cx - (ax + bx) / 2) + ny * (cy - (ay + by) / 2) > 0) {
      nx = -nx;
      ny = -ny;
    }
    edges.push({ ax, ay, nx, ny });
  }
  return function sdf(x, y) {
    let maxOut = -Infinity; // 在外部：取所有"正外侧距离"的最大值
    let minIn = Infinity;   // 在内部：取最近边距离
    let inside = true;
    for (const { ax, ay, nx, ny } of edges) {
      const sd = nx * (x - ax) + ny * (y - ay); // > 0 表示在边外侧
      if (sd > 0) {
        inside = false;
        if (sd > maxOut) maxOut = sd;
      } else if (-sd < minIn) {
        minIn = -sd;
      }
    }
    return inside ? -minIn : maxOut;
  };
}

/**
 * 圆角矩形 SDF（内负外正，标准公式）。
 * @param {{x: number, y: number, w: number, h: number, r: number}} rect
 * @param {number} px
 * @param {number} py
 * @returns {number}
 */
function roundRectSdf(rect, px, py) {
  const { x, y, w, h, r } = rect;
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/** 六边形 SDF（描边判定 |sdf| ≤ 线宽/2；填充判定 sdf ≤ 0） */
const hexSdf = makeConvexPolygonSdf(HEXAGON);
/** 两个缺口的联合 SDF（取较小者） */
const notchSdf = (px, py) => Math.min(
  roundRectSdf(NOTCHES[0], px, py),
  roundRectSdf(NOTCHES[1], px, py)
);
/** 蓝底圆角矩形 SDF（bgRadius=8 同 SVG rx=8；apple-touch-icon 传 0 做直角满幅） */
const bgSdf = (px, py, bgRadius) => roundRectSdf({ x: 0, y: 0, w: DESIGN_SIZE, h: DESIGN_SIZE, r: bgRadius }, px, py);

/**
 * 实心风格子样本取色（favicon-16/32）：蓝底圆角 + 白色实心六边形 + 蓝色 SIM + 白色双缺口。
 * @param {number} dx 设计坐标 x（0~32）
 * @param {number} dy 设计坐标 y（0~32）
 * @param {number} bgRadius 背景圆角半径（设计坐标）
 * @returns {number[] | null} [r,g,b]，null 表示透明（圆角外）
 */
function sampleSolid(dx, dy, bgRadius) {
  if (bgSdf(dx, dy, bgRadius) > 0) return null;
  if (hexSdf(dx, dy) <= 0) {
    if (roundRectSdf(SIM, dx, dy) <= 0) {
      return notchSdf(dx, dy) <= 0 ? WHITE : BLUE; // SIM 卡区域蓝色，缺口白色
    }
    return WHITE; // 六边形内部其余部分实心白色
  }
  return BLUE; // 蓝底
}

/**
 * 描边风格子样本取色（apple-touch-icon，同 favicon.svg）：
 * 蓝底直角满幅 + 白色六边形描边 + 白色 SIM + 蓝色双缺口。
 * @param {number} dx 设计坐标 x（0~32）
 * @param {number} dy 设计坐标 y（0~32）
 * @returns {number[] | null}
 */
function sampleOutline(dx, dy) {
  if (bgSdf(dx, dy, 0) > 0) return null;
  if (Math.abs(hexSdf(dx, dy)) <= HEX_STROKE / 2) return WHITE;
  if (roundRectSdf(SIM, dx, dy) <= 0) {
    return notchSdf(dx, dy) <= 0 ? BLUE : WHITE; // SIM 卡白色，缺口蓝色
  }
  return BLUE;
}

/**
 * 渲染 RGBA 位图：设计坐标 0~32 映射到 size×size 画布，每像素 SS×SS 超采样，
 * 子样本按预乘 alpha 平均后写回（抗锯齿 + 半透明边缘）。
 * @param {number} size 输出边长（像素）
 * @param {(dx: number, dy: number) => number[] | null} sampler 子样本取色函数
 * @returns {Buffer} size*size*4 字节 RGBA 数据
 */
function renderRgba(size, sampler) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = DESIGN_SIZE / size;
  const samples = SS * SS;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let coverage = 0; // 覆盖子样本数（0~samples）
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const dx = (px + (sx + 0.5) / SS) * scale;
          const dy = (py + (sy + 0.5) / SS) * scale;
          const color = sampler(dx, dy);
          if (color) {
            sumR += color[0];
            sumG += color[1];
            sumB += color[2];
            coverage += 1;
          }
        }
      }
      const idx = (py * size + px) * 4;
      if (coverage > 0) {
        rgba[idx] = Math.round((sumR / coverage));
        rgba[idx + 1] = Math.round((sumG / coverage));
        rgba[idx + 2] = Math.round((sumB / coverage));
        rgba[idx + 3] = Math.round((coverage / samples) * 255);
      } // coverage === 0 时保持全 0（完全透明）
    }
  }
  return rgba;
}

/**
 * 组装 PNG chunk（length + type + data + CRC32，CRC 覆盖 type 与 data）。
 * @param {string} type 4 字节 chunk 类型（IHDR/IDAT/IEND）
 * @param {Buffer} data chunk 数据
 * @returns {Buffer}
 */
function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

/**
 * 编码 8 位 RGBA PNG（zlib deflate 压缩，滤波器类型 0）。
 * @param {number} width
 * @param {number} height
 * @param {Buffer} rgba width*height*4 字节像素数据
 * @returns {Buffer} 完整 PNG 文件字节流
 */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // 位深 8
  ihdr[9] = 6;  // 颜色类型 6（truecolor + alpha）
  ihdr[10] = 0; // 压缩方法 deflate
  ihdr[11] = 0; // 滤波方法
  ihdr[12] = 0; // 非隔行扫描

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // 每行首个字节为滤波器类型 0（None）
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG 魔数
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ================================================================== */
/* 生成入口                                                            */
/* ================================================================== */

/** 生成目标清单：小尺寸六边形实心填充；apple-touch-icon 直角满幅 + 描边风格 */
const TARGETS = [
  { name: 'favicon-32.png', size: 32, style: 'solid', bgRadius: 8 },
  { name: 'favicon-16.png', size: 16, style: 'solid', bgRadius: 8 },
  { name: 'apple-touch-icon.png', size: 180, style: 'outline', bgRadius: 0 },
];

/** 生成三个 PNG 并写入 assets/img/（幂等，直接覆盖） */
function main() {
  const outDir = path.join(__dirname, '..', 'assets', 'img');
  fs.mkdirSync(outDir, { recursive: true });
  for (const target of TARGETS) {
    const sampler = target.style === 'solid'
      ? (dx, dy) => sampleSolid(dx, dy, target.bgRadius)
      : sampleOutline;
    const png = encodePng(target.size, target.size, renderRgba(target.size, sampler));
    fs.writeFileSync(path.join(outDir, target.name), png);
    console.log(`生成 assets/img/${target.name}（${target.size}×${target.size}，${png.length} 字节，${target.style} 风格）`);
  }
  console.log('favicon PNG 生成完成，请在浏览器/Safari 验证显示效果。');
}

if (require.main === module) {
  main();
}

module.exports = {
  BLUE,
  WHITE,
  HEXAGON,
  crc32,
  makeConvexPolygonSdf,
  roundRectSdf,
  sampleSolid,
  sampleOutline,
  renderRgba,
  encodePng,
};

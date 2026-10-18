/**
 * gen-favicon.js 纯函数单元测试（node:test + node:assert，零第三方依赖）
 * 运行：node --test scripts/（node --test 自动发现）
 *
 * 覆盖：crc32 已知校验值、六边形/圆角矩形 SDF 内外符号约定、
 * 采样函数设计语言（蓝底/白六边形/透明圆角外）、PNG 编码结构（魔数/IHDR）。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');

const {
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
} = require('./gen-favicon.js');

/* ================================================================== */
/* 1. crc32                                                            */
/* ================================================================== */

test('crc32：与标准 CRC-32 已知校验值一致，且与 zlib 内置实现结果相同', () => {
  // 标准 CRC-32（IEEE 802.3，PNG 同款）对 "123456789" 的已知校验值
  assert.strictEqual(crc32(Buffer.from('123456789', 'ascii')), 0xcbf43926);
  assert.strictEqual(crc32(Buffer.alloc(0)), 0x00000000, '空输入 CRC 为 0');
  // 与 node:zlib 内置实现对齐（无论走哪条实现路径，结果必须一致）
  const buf = Buffer.from('haoka favicon', 'ascii');
  if (typeof zlib.crc32 === 'function') {
    assert.strictEqual(crc32(buf), zlib.crc32(buf) >>> 0);
  }
});

/* ================================================================== */
/* 2. SDF 几何（内负外正）                                             */
/* ================================================================== */

test('makeConvexPolygonSdf：六边形中心为负（内部）、远角为正（外部）', () => {
  const sdf = makeConvexPolygonSdf(HEXAGON);
  assert.ok(sdf(16, 16) < 0, '六边形中心应为内部（SDF < 0）');
  assert.ok(sdf(16, 15.9) < 0, '中心附近为内部');
  assert.ok(sdf(1, 1) > 0, '画布远角应为外部（SDF > 0）');
  assert.ok(sdf(16, 2) > 0, '六边形正上方顶点之外为外部');
  // SDF 单调性：从中心沿 +y 走，出边界前单调递增穿越 0（下顶点 y=26.5，y=28 已在外）
  const inside = sdf(16, 20);
  const outside = sdf(16, 28);
  assert.ok(inside < 0 && outside > 0 && outside > inside, '沿半径向外 SDF 递增穿越 0');
});

test('roundRectSdf：圆角矩形内外符号与圆角行为', () => {
  const rect = { x: 12, y: 12, w: 8, h: 11, r: 1.5 }; // SIM 卡矩形
  assert.ok(roundRectSdf(rect, 16, 17) < 0, 'SIM 卡中心为内部');
  assert.ok(roundRectSdf(rect, 2, 2) > 0, '画布远角为外部');
  // 直角位置（若 r=0 应为外部；r>0 圆角化后更靠外）
  assert.ok(roundRectSdf(rect, 12.1, 12.1) > 0, '圆角矩形直角尖附近为外部');
  // 正方形 r=0：退化为直角矩形
  const square = { x: 0, y: 0, w: 10, h: 10, r: 0 };
  assert.strictEqual(roundRectSdf(square, 0, 0), 0, 'r=0 时角点恰在边界');
  assert.ok(roundRectSdf(square, 9.9, 9.9) < 0, 'r=0 时角点内侧一点为内部');
});

/* ================================================================== */
/* 3. 采样函数（设计语言：蓝底 + 白六边形 + SIM 卡 + 缺口）            */
/* ================================================================== */

test('sampleSolid：小尺寸风格——实心白六边形 + 蓝色 SIM + 白色缺口 + 圆角透明外', () => {
  const assertRgbEqual = (actual, expected, label) => {
    assert.deepStrictEqual(actual, expected, label);
  };
  // 画布圆角外 → 透明
  assert.strictEqual(sampleSolid(0.5, 0.5, 8), null, '圆角外应为透明');
  // 六边形内部非 SIM 区域 → 白色（实心填充）
  assertRgbEqual(sampleSolid(16, 8.5, 8), WHITE, '六边形上部应为实心白色');
  // SIM 卡矩形中心（两缺口之间 y=15.8，避开缺口边界 15.5/16.5）→ 蓝色
  assertRgbEqual(sampleSolid(16, 15.8, 8), BLUE, 'SIM 卡区域应为蓝色');
  // 缺口中心 → 白色
  assertRgbEqual(sampleSolid(16, 14.5, 8), WHITE, '缺口应为白色');
  // 六边形外蓝底区域 → 蓝色
  assertRgbEqual(sampleSolid(4, 16, 8), BLUE, '六边形外应为蓝底');
});

test('sampleOutline：描边风格——六边形描边白色 + SIM 白色 + 缺口蓝色 + 直角满幅', () => {
  // 六边形描边中点（右侧边 x≈25.1）→ 白色
  assert.deepStrictEqual(sampleOutline(25.1, 16), WHITE, '六边形右边描边应为白色');
  // 六边形内部 SIM 之外区域（y=10.5 < SIM 顶边 12）→ 蓝底
  assert.deepStrictEqual(sampleOutline(16, 10.5), BLUE, '描边内侧 SIM 外应为蓝底');
  // SIM 卡中心（两缺口之间 y=15.8，避开缺口边界 15.5/16.5）→ 白色
  assert.deepStrictEqual(sampleOutline(16, 15.8), WHITE, 'SIM 卡区域应为白色');
  // 缺口中心 → 蓝色
  assert.deepStrictEqual(sampleOutline(16, 14.5), BLUE, '缺口应为蓝色');
  // 直角满幅：最边缘像素仍为蓝底（不透明）
  assert.deepStrictEqual(sampleOutline(0.2, 16), BLUE, '直角满幅：边缘仍为蓝底');
});

/* ================================================================== */
/* 4. 位图渲染与 PNG 编码                                              */
/* ================================================================== */

test('renderRgba：输出尺寸与 alpha 通道（边缘透明、内部不透明）', () => {
  const size = 16;
  const rgba = renderRgba(size, (dx, dy) => sampleSolid(dx, dy, 8));
  assert.strictEqual(rgba.length, size * size * 4, 'RGBA 字节数应为 size*size*4');
  const corner = rgba.subarray(0, 4); // 左上角（圆角外）
  assert.strictEqual(corner[3], 0, '圆角外 alpha 应为 0');
  const centerIdx = (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4;
  const center = rgba.subarray(centerIdx, centerIdx + 4);
  assert.strictEqual(center[3], 255, '中心 alpha 应为 255');
  assert.ok(
    center[2] > center[0] && center[2] > center[1],
    '中心应为蓝色系（B 分量大于 R/G）'
  );
});

test('encodePng：PNG 魔数、IHDR 尺寸与颜色类型、IEND 收尾', () => {
  const size = 4;
  const rgba = renderRgba(size, () => BLUE);
  const png = encodePng(size, size, rgba);
  // 魔数
  assert.deepStrictEqual(
    png.subarray(0, 8),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    '前 8 字节应为 PNG 魔数'
  );
  // IHDR：位置 8 起 length(4)+type(4)+width(4)+height(4)+bitDepth(1)+colorType(1)
  assert.strictEqual(png.readUInt32BE(8), 13, 'IHDR 数据长度固定 13');
  assert.strictEqual(png.toString('ascii', 12, 16), 'IHDR');
  assert.strictEqual(png.readUInt32BE(16), size, 'IHDR 宽度');
  assert.strictEqual(png.readUInt32BE(20), size, 'IHDR 高度');
  assert.strictEqual(png[24], 8, '位深 8');
  assert.strictEqual(png[25], 6, '颜色类型 6（RGBA）');
  // IEND 收尾
  assert.ok(png.toString('ascii', png.length - 8, png.length - 4).includes('IEND'), '应以 IEND chunk 收尾');
});

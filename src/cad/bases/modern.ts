/**
 * Modern Gridfinity Case label base — port of bases/modern.py.
 *
 * Tapered extrusion simulated via loft between offset profiles.
 * The 45° taper means each edge moves inward/outward by depth/2
 * from the mid-profile (label surface at z=0) to the top/bottom.
 */

import {
  draw,
  drawRectangle,
  type Sketch,
  type Solid,
} from "replicad";
import type { BaseConfig, LabelBaseResult } from "./base.js";
import type { Vec2 } from "../label.js";

/** Internal widths for discrete u-sizes (mm), before margins. */
const INTERNAL_WIDTHS: Record<number, number> = {
  3: 16,
  4: 35,
  5: 60,
  6: 100,
  7: 125,
  8: 125,
};

const MARGIN_X = 8;
const MARGIN_Y = 4.7;
const WINDOW_HEIGHT = 13;
const INDENT_DEPTH = 0.6;
const X_OFF_BASE = 0.1;
const X_OFF_FACE = 0.1415;
const Y_OFFSET = 0.28284; // top offset from face inset in onshape

/** Draw the modern base mid-profile (at the label surface, z=0). */
function modernProfile(wMm: number, hMm: number) {
  const dx = Math.abs(X_OFF_BASE - X_OFF_FACE);
  const co = 1.97574; // corner offset, measured after face offset
  const yo = Y_OFFSET;

  return draw([-wMm / 2 + dx, -hMm / 2])
    .lineTo([-wMm / 2 + dx, hMm / 2 - co - yo])
    .lineTo([-wMm / 2 + dx + co, hMm / 2 - yo])
    .lineTo([wMm / 2 - dx - co, hMm / 2 - yo])
    .lineTo([wMm / 2 - dx, hMm / 2 - co - yo])
    .lineTo([wMm / 2 - dx, -hMm / 2])
    .close();
}

export function buildModernBase(config: BaseConfig): LabelBaseResult {
  const iw = INTERNAL_WIDTHS[config.width];
  if (iw === undefined) {
    throw new Error(
      `Modern base only supports widths 3-8u, got ${config.width}u`,
    );
  }
  const wMm = iw + MARGIN_X * 2 - 2 * X_OFF_BASE;
  const hMm = config.height ?? MARGIN_Y * 2 + WINDOW_HEIGHT; // 22.4
  const depth = config.depth ?? 2.2;

  // Window width (for indent = internal width)
  const wWindow = wMm - MARGIN_X * 2 + 2 * X_OFF_BASE;

  // --- Taper body ---
  // Python draws profile at z=0 and extrudes ±depth/2 with 45° taper.
  // Entire solid is at/behind z=0:
  //   z=0:        full profile (label surface)
  //   z=-depth/2: shrunk by depth/2 (narrowest, middle)
  //   z=-depth:   full profile (back, identical to z=0)
  const fullProfile = modernProfile(wMm, hMm);
  const midProfile = fullProfile.offset(-depth / 2);

  const frontSketch = fullProfile.sketchOnPlane("XY", 0) as Sketch;
  const midSketch = midProfile.sketchOnPlane("XY", -depth / 2) as Sketch;
  const frontHalf = frontSketch.loftWith(midSketch, { ruled: true }) as unknown as Solid;

  const midSketch2 = midProfile.clone().sketchOnPlane("XY", -depth / 2) as Sketch;
  const backSketch = fullProfile.clone().sketchOnPlane("XY", -depth) as Sketch;
  const backHalf = midSketch2.loftWith(backSketch, { ruled: true }) as unknown as Solid;

  let solid = frontHalf.fuse(backHalf);

  // --- Base box at bottom edge ---
  // Python: Box(W_mm, 0.95858 + depth, depth) at (0, -H/2, -depth/2)
  //         align(CENTER, MIN, CENTER) → Y min at -H/2, Z centered at -depth/2
  //         → Z spans [-depth, 0]
  // Chamfer: Z-axis edges at highest Y, length=depth
  // We draw the XY profile with the chamfer built in, then extrude in Z.
  const baseBoxH = 0.95858 + depth;
  const bw = wMm / 2;
  const baseBoxProfile = draw([-bw, 0])
    .lineTo([bw, 0])
    .lineTo([bw, baseBoxH - depth])
    .lineTo([bw - depth, baseBoxH])
    .lineTo([-bw + depth, baseBoxH])
    .lineTo([-bw, baseBoxH - depth])
    .close();

  // Extrude Z from 0 to -depth, translate Y so yMin sits at -hMm/2
  let baseBoxSolid = baseBoxProfile
    .sketchOnPlane("XY", 0)
    .extrude(-depth) as Solid;
  baseBoxSolid = baseBoxSolid.translate([0, -hMm / 2, 0]) as unknown as Solid;

  solid = solid.fuse(baseBoxSolid);

  // --- Indent slot cut ---
  // Python: Box(wWindow, WINDOW_HEIGHT, INDENT_DEPTH) at (0, -H/2+MARGIN_Y, -depth)
  //         align(CENTER, MIN, MIN) → Y min at -H/2+MARGIN_Y, Z min at -depth
  const indentSolid = drawRectangle(wWindow, WINDOW_HEIGHT)
    .sketchOnPlane("XY", -depth)
    .extrude(INDENT_DEPTH) as Solid;
  const indentPositioned = indentSolid.translate([
    0,
    -hMm / 2 + MARGIN_Y + WINDOW_HEIGHT / 2,
    0,
  ]) as unknown as Solid;

  try {
    solid = solid.cut(indentPositioned);
  } catch {
    // Cut may fail on complex topology
  }

  const area: Vec2 = { x: wMm, y: hMm };
  return { solid, area };
}

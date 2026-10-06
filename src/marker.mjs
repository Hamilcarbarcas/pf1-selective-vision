/**
 * GM-only manual-override marker. DESIGN.md §7.4.
 */

import { SOURCE_MANUAL } from "./const.mjs";
import { hasLiveRule } from "./rules.mjs";

const ICON = "icons/svg/eye.svg";
const TINT = 0xffb000;
const MARKER = Symbol("pfsvMarker");

let texture = null;

const hasManual = (doc) => hasLiveRule(doc, (rule) => rule.source === SOURCE_MANUAL);

function sync(token) {
  if (!game.user.isGM) return;
  const want = !!texture && hasManual(token.document);
  let sprite = token[MARKER];
  if (!want) {
    if (sprite) sprite.visible = false;
    return;
  }
  if (!sprite || sprite.destroyed) {
    sprite = new PIXI.Sprite(texture);
    sprite.tint = TINT;
    sprite.eventMode = "none";
    token[MARKER] = token.addChild(sprite);
  }
  const size = Math.max(12, Math.min(token.w, token.h) * 0.22);
  sprite.width = sprite.height = size;
  sprite.position.set(token.w - size - 2, 2);
  sprite.visible = true;
}

export function registerMarker() {
  Hooks.on("refreshToken", sync);
  Hooks.on("canvasReady", async () => {
    if (!game.user.isGM) return;
    texture ??= await foundry.canvas.loadTexture(ICON);
    for (const token of canvas.tokens.placeables) sync(token);
  });
}

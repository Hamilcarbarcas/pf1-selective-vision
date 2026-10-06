/**
 * Visibility engine. DESIGN.md §4.
 */

import { MODULE_ID } from "./const.mjs";
import { senseFilter, verdictFor } from "./rules.mjs";
import { revealHidden } from "./settings.mjs";

const isToken = (object) => object instanceof foundry.canvas.placeables.Token;
const hasRules = (token) => !!token.document.flags?.[MODULE_ID]?.rules;
const activeSources = () => canvas.effects.visionSources.filter((s) => s.active);

/** Walls block, darkness doesn't. §4.2 */
function grantPasses(source, rule, config) {
  if (!rule.walls) return true;
  const backend = CONFIG.Canvas.polygonBackends.sight;
  return config.tests.some(
    (test) =>
      !backend.testCollision(source.origin, test.point, {
        type: "sight",
        mode: "any",
        source,
        useThreshold: true,
        edgeOptions: { darkness: false },
      })
  );
}

/** Active source → grant or deny rule; restore and no-rule sources are absent. */
function verdicts(targetDoc, sources) {
  let map = null;
  for (const source of sources) {
    const observer = source.object?.document;
    if (!observer) continue;
    const rule = verdictFor(targetDoc, observer);
    if (!rule || rule.kind === "restore") continue;
    (map ??= new Map()).set(source, rule);
  }
  return map;
}

/**
 * Core's loop (`groups/visibility.mjs:735-793`) with per-source verdicts. §4.1
 * @this {CanvasVisibility}
 */
function ruledTest(point, options, object, sources, ruled) {
  const open = sources.filter((s) => ruled.get(s)?.kind !== "deny");
  if (!open.length) return false;
  const grants = open.filter((s) => ruled.get(s)?.kind === "grant");
  const config = this._createVisibilityTestConfig(point, options);

  for (const lightSource of canvas.effects.lightSources) {
    if (!lightSource.data.vision || !lightSource.active) continue;
    if (lightSource.testVisibility(config) === true) return true;
  }

  for (const source of grants) {
    const rule = ruled.get(source);
    if (!senseFilter(rule.sense) && grantPasses(source, rule, config)) return true;
  }

  const sr = canvas.dimensions.sceneRect;
  const inBuffer = !sr.contains(point.x, point.y);
  const regional = open.filter((s) => inBuffer !== sr.contains(s.x, s.y));
  const modes = CONFIG.Canvas.detectionModes;

  for (const source of regional) {
    if (source.isBlinded) continue;
    const token = source.object.document;
    const basic = token.detectionModes.find((m) => m.id === "basicSight");
    if (basic && modes.basicSight.testVisibility(source, basic, config) === true) return true;
    const light = token.detectionModes.find((m) => m.id === "lightPerception");
    if (light && modes.lightPerception.testVisibility(source, light, config) === true) return true;
  }

  for (const source of regional) {
    const token = source.object.document;
    for (const mode of token.detectionModes) {
      if (mode.id === "basicSight" || mode.id === "lightPerception") continue;
      const dm = modes[mode.id];
      if (dm?.testVisibility(source, mode, config) === true) {
        object.detectionFilter = dm.constructor.getDetectionFilter();
        return true;
      }
    }
  }

  for (const source of grants) {
    const rule = ruled.get(source);
    const filter = senseFilter(rule.sense);
    if (filter && grantPasses(source, rule, config)) {
      object.detectionFilter = filter;
      return true;
    }
  }
  return false;
}

function testVisibility(wrapped, point, options = {}) {
  const object = options.object;
  if (!isToken(object) || !hasRules(object)) return wrapped(point, options);
  const sources = activeSources();
  if (!sources.length) return wrapped(point, options);
  const ruled = verdicts(object.document, sources);
  if (!ruled) return wrapped(point, options);
  return ruledTest.call(this, point, options, object, sources, ruled);
}

/** Grants alone, for GM-hidden tokens. §4.3 */
function grantsOnly(token) {
  const sources = activeSources();
  if (!sources.length) return false;
  const ruled = verdicts(token.document, sources);
  if (!ruled) return false;

  const { width, height } = token.document.getSize();
  const tolerance = Math.min(width, height) / 4;
  const config = canvas.visibility._createVisibilityTestConfig(token.center, { tolerance, object: token });

  let filtered = null;
  for (const [source, rule] of ruled) {
    if (rule.kind !== "grant" || !grantPasses(source, rule, config)) continue;
    const filter = senseFilter(rule.sense);
    if (!filter) {
      token.detectionFilter = null;
      return true;
    }
    filtered ??= filter;
  }
  if (!filtered) return false;
  token.detectionFilter = filtered;
  return true;
}

function isVisible(wrapped) {
  const visible = wrapped();
  if (visible) return visible;
  const doc = this.document;
  if (!doc.hidden || game.user.isGM || !hasRules(this)) return visible;
  if (!revealHidden() || !canvas.visibility.tokenVision) return visible;
  return grantsOnly(this);
}

export function registerVisibility() {
  libWrapper.register(
    MODULE_ID,
    "foundry.canvas.groups.CanvasVisibility.prototype.testVisibility",
    testVisibility,
    "MIXED",
    { perf_mode: "FAST" }
  );
  libWrapper.register(MODULE_ID, "foundry.canvas.placeables.Token.prototype.isVisible", isVisible, "WRAPPER");
}

/**
 * Display strings shared by the apply panel and the rules window.
 */

import { ALL_KEY, SOURCE_MANUAL } from "./const.mjs";
import { senses } from "./rules.mjs";

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

export const kindLabel = (kind) => t(`PF1SV.Kind.${kind}`);

export function senseLabels() {
  return Object.fromEntries(senses().map((s) => [s.id, s.label]));
}

/** "Grant · walls · Blindsense", "Deny", "Restore". */
export function ruleSummary(rule, senseNames = senseLabels()) {
  if (rule.kind !== "grant") return kindLabel(rule.kind);
  const walls = t(rule.walls ? "PF1SV.Walls.On" : "PF1SV.Walls.Off");
  return `${kindLabel("grant")} · ${walls} · ${senseNames[rule.sense] ?? rule.sense}`;
}

export function sourceLabel(source) {
  if (source === SOURCE_MANUAL) return t("PF1SV.Source.Manual");
  return game.modules.get(source)?.title ?? source;
}

export function observerName(key, scene) {
  if (key === ALL_KEY) return t("PF1SV.AllObservers");
  const id = key.slice(6);
  if (key.startsWith("token-")) return scene?.tokens.get(id)?.name ?? t("PF1SV.Missing", { id });
  if (key.startsWith("actor-")) return game.actors.get(id)?.name ?? t("PF1SV.Missing", { id });
  return key;
}

export function lifetimeLabel(lifetime) {
  const parts = [];
  if (lifetime?.anchor) parts.push(t("PF1SV.Lifetime.UntilMoves"));
  if (lifetime?.expiresAt != null) {
    const roundTime = CONFIG.time?.roundTime || 6;
    const left = Math.ceil((lifetime.expiresAt - game.time.worldTime) / roundTime);
    parts.push(left > 0 ? t("PF1SV.Lifetime.RoundsLeft", { rounds: left }) : t("PF1SV.Lifetime.Expired"));
  }
  if (lifetime?.buff) {
    let name = null;
    try {
      name = fromUuidSync(lifetime.buff)?.name;
    } catch {
      name = null;
    }
    parts.push(t("PF1SV.Lifetime.WhileBuff", { buff: name ?? t("PF1SV.Lifetime.MissingBuff") }));
  }
  if (!parts.length) return t("PF1SV.Lifetime.manual");
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

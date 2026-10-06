/**
 * Settings. DESIGN.md §9.
 *
 * `revealHidden` is read from `Token#isVisible`, so it is held in a module variable rather than
 * read through `game.settings.get` per call.
 */

import { MODULE_ID } from "./const.mjs";
import { refreshAllRuled } from "./refresh.mjs";

export const KEYS = Object.freeze({
  hudColumn: "hudColumn",
  revealHidden: "revealHidden",
});

let revealHiddenCache = true;

export const revealHidden = () => revealHiddenCache;

export function hudColumn() {
  return game.settings.get(MODULE_ID, KEYS.hudColumn) === "left" ? "left" : "right";
}

export function registerSettings() {
  game.settings.register(MODULE_ID, KEYS.hudColumn, {
    name: "PF1SV.Settings.HudColumn.Name",
    hint: "PF1SV.Settings.HudColumn.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      right: "PF1SV.Settings.HudColumn.Right",
      left: "PF1SV.Settings.HudColumn.Left",
    },
    default: "right",
  });

  game.settings.register(MODULE_ID, KEYS.revealHidden, {
    name: "PF1SV.Settings.RevealHidden.Name",
    hint: "PF1SV.Settings.RevealHidden.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => {
      revealHiddenCache = !!value;
      refreshAllRuled();
    },
  });
}

/** After registration; `onChange` keeps it current from then on. */
export function primeSettingsCache() {
  revealHiddenCache = !!game.settings.get(MODULE_ID, KEYS.revealHidden);
}

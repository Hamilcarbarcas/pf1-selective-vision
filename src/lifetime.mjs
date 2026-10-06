/**
 * Refresh triggers and garbage collection. DESIGN.md §4.5, §6.1.
 */

import { HOOK_CHANGED, MODULE_ID } from "./const.mjs";
import { bumpBuffEpoch, deadPredicate, invalidateIndex, removalUpdate, storedRules } from "./rules.mjs";
import { refreshAllRuled, refreshToken } from "./refresh.mjs";

const isActiveGM = () => game.users.activeGM?.isSelf ?? false;

async function sweepNow() {
  if (!isActiveGM()) return;
  for (const scene of game.scenes) {
    const updates = [];
    for (const doc of scene.tokens) {
      if (!storedRules(doc)) continue;
      const update = removalUpdate(doc, deadPredicate(doc));
      if (Object.keys(update).length) updates.push({ _id: doc.id, ...update });
    }
    if (!updates.length) continue;
    try {
      await scene.updateEmbeddedDocuments("Token", updates);
    } catch (err) {
      console.error(`${MODULE_ID} | sweep failed on scene ${scene.id}`, err);
    }
  }
}

/** Remove ended and orphaned rules everywhere. Active GM only. §6.1 */
export const sweep = foundry.utils.debounce(sweepNow, 500);

function onUpdateToken(doc, changes) {
  const diff = changes.flags?.[MODULE_ID];
  if (diff !== undefined) {
    invalidateIndex(doc);
    refreshToken(doc);
    Hooks.callAll(HOOK_CHANGED, doc, diff);
  }
  if (("x" in changes || "y" in changes) && storedRules(doc)) {
    refreshToken(doc);
    sweep();
  }
}

const isBuffLike = (item) => item?.system?.active !== undefined;

function buffsChanged() {
  bumpBuffEpoch();
  refreshAllRuled();
  sweep();
}

function onUpdateItem(item, changes) {
  if (foundry.utils.hasProperty(changes, "system.active")) buffsChanged();
}

function onDeleteItem(item) {
  if (isBuffLike(item)) buffsChanged();
}

function onUpdateWorldTime() {
  refreshAllRuled();
  sweep();
}

export function registerLifetimeHooks() {
  Hooks.on("updateToken", onUpdateToken);
  Hooks.on("updateItem", onUpdateItem);
  Hooks.on("deleteItem", onDeleteItem);
  Hooks.on("deleteActor", buffsChanged);
  Hooks.on("deleteToken", buffsChanged);
  Hooks.on("updateWorldTime", onUpdateWorldTime);
}

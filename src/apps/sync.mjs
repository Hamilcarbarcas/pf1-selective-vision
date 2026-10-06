/**
 * Keep open panels and rules windows current. DESIGN.md §7.2, §7.3.
 */

import { MODULE_ID } from "../const.mjs";
import { ApplyPanel } from "./apply-panel.mjs";
import { RulesWindow } from "./rules-window.mjs";

function* openWindows() {
  for (const app of foundry.applications.instances.values()) {
    if ((app instanceof ApplyPanel || app instanceof RulesWindow) && app.rendered) yield app;
  }
}

const renderAll = foundry.utils.debounce(() => {
  for (const app of openWindows()) app.render();
}, 100);

function onUpdateToken(doc, changes) {
  const relevant = changes.flags?.[MODULE_ID] !== undefined || "name" in changes || "x" in changes || "y" in changes;
  if (!relevant) return;
  for (const app of openWindows()) {
    if (app.targetDoc === doc || (app instanceof ApplyPanel && app.targetDoc.parent === doc.parent)) app.render();
  }
}

function onTokenListChange(doc) {
  for (const app of openWindows()) {
    if (app.targetDoc === doc) app.close();
    else if (app.targetDoc.parent === doc.parent) app.render();
  }
}

export function registerWindowSync() {
  Hooks.on("updateToken", onUpdateToken);
  Hooks.on("createToken", onTokenListChange);
  Hooks.on("deleteToken", onTokenListChange);
  Hooks.on("updateWorldTime", renderAll);
  Hooks.on("updateItem", (_item, changes) => {
    if (foundry.utils.hasProperty(changes, "system.active")) renderAll();
  });
}

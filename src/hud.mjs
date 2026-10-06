/**
 * Token HUD button. DESIGN.md §7.1.
 */

import { CSS } from "./const.mjs";
import { hasLiveRule } from "./rules.mjs";
import { hudColumn } from "./settings.mjs";
import { ApplyPanel } from "./apps/apply-panel.mjs";

function onRenderTokenHUD(hud, html) {
  if (!game.user.isGM) return;
  const doc = hud.document;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const col = root?.querySelector(`.col.${hudColumn()}`);
  if (!doc || !col || col.querySelector(`.${CSS}hud`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `control-icon ${CSS}hud`;
  if (hasLiveRule(doc)) button.classList.add("active");
  button.dataset.tooltip = "PF1SV.Hud.Button";
  button.innerHTML = `<i class="fa-solid fa-eye-low-vision" inert></i>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    ApplyPanel.open(doc);
  });
  col.append(button);
}

export function registerHud() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
}

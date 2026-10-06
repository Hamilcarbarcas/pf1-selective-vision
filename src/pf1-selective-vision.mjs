import { MODULE_ID } from "./const.mjs";
import { primeSettingsCache, registerSettings } from "./settings.mjs";
import { registerVisibility } from "./visibility.mjs";
import { registerLifetimeHooks, sweep } from "./lifetime.mjs";
import { registerSocket } from "./socket.mjs";
import { registerHud } from "./hud.mjs";
import { registerMarker } from "./marker.mjs";
import { registerWindowSync } from "./apps/sync.mjs";
import { api } from "./api.mjs";

Hooks.once("init", () => {
  registerSettings();

  if (!game.modules.get("lib-wrapper")?.active) {
    console.error(`${MODULE_ID} | libWrapper is not active; selective vision is disabled.`);
    return;
  }
  registerVisibility();

  // Index invalidation must run before the windows re-render on the same update.
  registerLifetimeHooks();
  registerWindowSync();
  registerSocket();
  registerHud();
  registerMarker();

  game.modules.get(MODULE_ID).api = api;
});

Hooks.once("setup", () => primeSettingsCache());

Hooks.once("ready", () => sweep());

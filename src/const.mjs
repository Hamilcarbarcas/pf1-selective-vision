export const MODULE_ID = "pf1-selective-vision";

/** CSS namespace. */
export const CSS = "pfsv-";

export const TEMPLATES = `modules/${MODULE_ID}/src/templates`;

/** Flag path holding every rule on a target token. §5.1 */
export const RULES_PATH = `flags.${MODULE_ID}.rules`;

export const KINDS = Object.freeze(["grant", "restore", "deny"]);

/** Suggested bands. §3.3 */
export const PRIORITY = Object.freeze({ AUTOMATION: 0, CERTAIN: 50, MANUAL: 100 });

export const SOURCE_MANUAL = "manual";
export const SOURCE_FALLBACK = "api";

export const ALL_KEY = "all";

export const HOOK_CHANGED = "pf1SelectiveVision.changed";

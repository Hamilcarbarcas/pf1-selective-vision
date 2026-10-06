/**
 * Rule data: observer keys, construction, the per-token index, liveness, precedence, and the
 * flag updates that write it. DESIGN.md §3, §5, §6.
 */

import { ALL_KEY, KINDS, MODULE_ID, PRIORITY, RULES_PATH, SOURCE_FALLBACK } from "./const.mjs";

const KEY_PATTERN = /^(token|actor)-[A-Za-z0-9]{16}$/;

/* -------------------------------------------- */
/*  Documents and keys (§5.2)                   */
/* -------------------------------------------- */

function resolveDocument(value) {
  if (typeof value === "string") {
    try {
      return fromUuidSync(value) ?? null;
    } catch {
      return null;
    }
  }
  if (value instanceof foundry.canvas.placeables.Token) return value.document;
  return value ?? null;
}

/** Token, TokenDocument, or UUID → TokenDocument | null. */
export function resolveTarget(target) {
  const doc = resolveDocument(target);
  return doc instanceof foundry.documents.TokenDocument ? doc : null;
}

/** Token, TokenDocument, Actor, UUID, `"all"`, or an existing key → observer key | null. */
export function observerKey(value) {
  if (value === ALL_KEY) return ALL_KEY;
  if (typeof value === "string" && KEY_PATTERN.test(value)) return value;
  const doc = resolveDocument(value);
  if (doc instanceof foundry.documents.TokenDocument) {
    return doc.actorLink && doc.actorId ? `actor-${doc.actorId}` : `token-${doc.id}`;
  }
  if (doc instanceof foundry.documents.Actor) {
    return doc.isToken ? `token-${doc.token.id}` : `actor-${doc.id}`;
  }
  return null;
}

/** Every key whose rules apply to an observer token. */
export function sourceKeys(observerDoc) {
  const keys = [`token-${observerDoc.id}`];
  if (observerDoc.actorLink && observerDoc.actorId) keys.push(`actor-${observerDoc.actorId}`);
  keys.push(ALL_KEY);
  return keys;
}

/** Keys whose rules apply to an observer given as token, actor, UUID, or `"all"`. */
export function keysForObserver(value) {
  if (value === ALL_KEY) return [ALL_KEY];
  const doc = resolveDocument(value);
  if (doc instanceof foundry.documents.TokenDocument) return sourceKeys(doc);
  if (doc instanceof foundry.documents.Actor) return [observerKey(doc), ALL_KEY];
  return null;
}

/* -------------------------------------------- */
/*  Senses (§3.1)                               */
/* -------------------------------------------- */

function filterOf(mode) {
  try {
    return mode?.constructor?.getDetectionFilter?.() ?? null;
  } catch {
    return null;
  }
}

export function defaultSense() {
  const modes = CONFIG.Canvas.detectionModes;
  if (modes.blindSense) return "blindSense";
  if (modes.feelTremor) return "feelTremor";
  return "sight";
}

/** `sight` plus every registered detection mode that draws a filter. */
export function senses() {
  const list = [{ id: "sight", label: game.i18n.localize("PF1SV.Sense.Sight") }];
  for (const [id, mode] of Object.entries(CONFIG.Canvas.detectionModes)) {
    if (!filterOf(mode)) continue;
    list.push({ id, label: game.i18n.localize(mode.label || id) });
  }
  return list;
}

/** The filter a granted sense draws; null renders the token normally. */
export function senseFilter(sense) {
  if (!sense || sense === "sight") return null;
  const modes = CONFIG.Canvas.detectionModes;
  return filterOf(modes[sense]) ?? filterOf(modes[defaultSense()]);
}

/* -------------------------------------------- */
/*  Construction                                */
/* -------------------------------------------- */

/**
 * API-form lifetime → stored form. §6
 * @param {{targetMoves?: boolean, rounds?: number, seconds?: number, buff?: string|Item}} [lifetime]
 */
export function buildLifetime(lifetime, targetDoc) {
  const lt = lifetime ?? {};
  const roundTime = CONFIG.time?.roundTime || 6;
  const seconds = (Number(lt.rounds) || 0) * roundTime + (Number(lt.seconds) || 0);
  let buff = lt.buff ?? null;
  if (buff && typeof buff !== "string") buff = buff.uuid ?? null;
  return {
    anchor: lt.targetMoves ? { x: targetDoc.x, y: targetDoc.y } : null,
    expiresAt: seconds > 0 ? game.time.worldTime + seconds : null,
    buff: buff || null,
  };
}

function toInteger(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * Complete stored rule; every field present so a dot-path write fully replaces an old one.
 * `opts.storedLifetime` (internal) keeps an existing lifetime as-is.
 */
export function makeRule(kind, opts, targetDoc) {
  if (!KINDS.includes(kind)) throw new Error(`unknown rule kind "${kind}"`);
  const grant = kind === "grant";
  return {
    kind,
    walls: grant ? opts.walls !== false : false,
    sense: grant ? opts.sense || defaultSense() : null,
    priority: toInteger(opts.priority, PRIORITY.AUTOMATION),
    source: String(opts.source || SOURCE_FALLBACK),
    tag: String(opts.tag ?? ""),
    label: String(opts.label ?? ""),
    applied: Date.now(),
    lifetime: opts.storedLifetime ?? buildLifetime(opts.lifetime, targetDoc),
  };
}

/** Stored fields only, dropping the index's `id` / `key`. */
export function toStored(rule) {
  const { kind, walls, sense, priority, source, tag, label, applied, lifetime } = rule;
  return { kind, walls, sense, priority, source, tag, label, applied, lifetime };
}

/* -------------------------------------------- */
/*  Index (§5.3)                                */
/* -------------------------------------------- */

const indexes = new WeakMap();

/** Higher priority first, then most recent. §3.2 */
const compare = (a, b) => b.priority - a.priority || b.applied - a.applied;

export const storedRules = (doc) => doc?.flags?.[MODULE_ID]?.rules ?? null;

/** @returns {Map<string, object[]>|null} observer key → rules, best first */
export function indexFor(doc) {
  const stored = storedRules(doc);
  if (!stored) return null;
  let idx = indexes.get(doc);
  if (idx) return idx;

  idx = new Map();
  for (const [key, group] of Object.entries(stored)) {
    if (!group || typeof group !== "object") continue;
    const list = [];
    for (const [id, rule] of Object.entries(group)) {
      if (!rule || !KINDS.includes(rule.kind)) continue;
      list.push({
        ...rule,
        id,
        key,
        priority: Number(rule.priority) || 0,
        applied: Number(rule.applied) || 0,
      });
    }
    if (list.length) idx.set(key, list.sort(compare));
  }
  indexes.set(doc, idx);
  return idx;
}

export const invalidateIndex = (doc) => indexes.delete(doc);

/* -------------------------------------------- */
/*  Liveness (§6)                               */
/* -------------------------------------------- */

/** uuid → active; cleared on any buff toggle or delete. */
const buffCache = new Map();

export const bumpBuffEpoch = () => buffCache.clear();

function buffActive(uuid) {
  let active = buffCache.get(uuid);
  if (active === undefined) {
    let item = null;
    try {
      item = fromUuidSync(uuid);
    } catch {
      item = null;
    }
    active = item?.system?.active === true;
    buffCache.set(uuid, active);
  }
  return active;
}

export function isLive(rule, targetDoc) {
  const lt = rule.lifetime;
  if (!lt) return true;
  if (lt.anchor && (lt.anchor.x !== targetDoc.x || lt.anchor.y !== targetDoc.y)) return false;
  if (lt.expiresAt != null && game.time.worldTime >= lt.expiresAt) return false;
  if (lt.buff && !buffActive(lt.buff)) return false;
  return true;
}

/* -------------------------------------------- */
/*  Precedence (§3.2)                           */
/* -------------------------------------------- */

/** Best live rule across `keys`, or null. */
export function winningFor(targetDoc, keys) {
  const idx = indexFor(targetDoc);
  if (!idx) return null;
  let best = null;
  for (const key of keys) {
    const list = idx.get(key);
    if (!list) continue;
    for (const rule of list) {
      if (!isLive(rule, targetDoc)) continue;
      if (!best || compare(rule, best) < 0) best = rule;
      break;
    }
  }
  return best;
}

export const verdictFor = (targetDoc, observerDoc) => winningFor(targetDoc, sourceKeys(observerDoc));

/** Ids of rules that are the verdict for at least one other token in the target's scene. */
export function winningIds(doc) {
  const ids = new Set();
  for (const observer of doc.parent?.tokens ?? []) {
    if (observer === doc) continue;
    const rule = verdictFor(doc, observer);
    if (rule) ids.add(rule.id);
  }
  return ids;
}

export function hasLiveRule(doc, predicate = () => true) {
  const idx = indexFor(doc);
  if (!idx) return false;
  for (const list of idx.values()) {
    for (const rule of list) if (predicate(rule) && isLive(rule, doc)) return true;
  }
  return false;
}

export function findRule(doc, ruleId) {
  const idx = indexFor(doc);
  if (!idx) return null;
  for (const list of idx.values()) {
    const rule = list.find((r) => r.id === ruleId);
    if (rule) return rule;
  }
  return null;
}

/* -------------------------------------------- */
/*  Write builders (§3.4, §5.1)                 */
/* -------------------------------------------- */

/**
 * Add `rule` under each key, removing same source + tag rules there first when replacing.
 * @returns {{update: object, ids: string[]}}
 */
export function applyUpdate(doc, keys, rule, { replace = true } = {}) {
  const stored = storedRules(doc) ?? {};
  const update = {};
  const ids = [];
  for (const key of keys) {
    if (replace) {
      for (const [id, old] of Object.entries(stored[key] ?? {})) {
        if (old?.source === rule.source && (old?.tag ?? "") === rule.tag) {
          update[`${RULES_PATH}.${key}.-=${id}`] = null;
        }
      }
    }
    const id = foundry.utils.randomID();
    update[`${RULES_PATH}.${key}.${id}`] = rule;
    ids.push(id);
  }
  return { update, ids };
}

/** Overwrite one rule in place. */
export const editUpdate = (key, ruleId, rule) => ({ [`${RULES_PATH}.${key}.${ruleId}`]: toStored(rule) });

/**
 * Remove every rule `predicate(rule, id, key)` accepts. Empty keys go whole; an empty rule set
 * drops the flag.
 */
export function removalUpdate(doc, predicate) {
  const stored = storedRules(doc);
  if (!stored) return {};
  const update = {};
  let remaining = 0;
  for (const [key, group] of Object.entries(stored)) {
    const ids = Object.keys(group ?? {});
    const doomed = ids.filter((id) => predicate(group[id], id, key));
    remaining += ids.length - doomed.length;
    if (!doomed.length) continue;
    if (doomed.length === ids.length) update[`${RULES_PATH}.-=${key}`] = null;
    else for (const id of doomed) update[`${RULES_PATH}.${key}.-=${id}`] = null;
  }
  if (Object.keys(update).length && !remaining) return { [`flags.${MODULE_ID}.-=rules`]: null };
  return update;
}

/** Sweep predicate: ended rules and rules for observers that no longer exist. §6.1 */
export function deadPredicate(doc) {
  const scene = doc.parent;
  return (rule, _id, key) => {
    if (!rule || !KINDS.includes(rule.kind)) return true;
    if (!isLive(rule, doc)) return true;
    if (key.startsWith("token-")) return !scene?.tokens.has(key.slice(6));
    if (key.startsWith("actor-")) return !game.actors.has(key.slice(6));
    return false;
  };
}

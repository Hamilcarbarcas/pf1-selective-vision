# PF1 Selective Vision

**Manifest URL:** `https://github.com/Hamilcarbarcas/pf1-selective-vision/releases/latest/download/module.json`

## Requirements

- Foundry VTT v13
- Pathfinder 1e system v11.11
- [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper)

## Contents

- [Overview](#overview)
- [Using it](#using-it)
  - [Apply panel](#apply-panel)
  - [Rules window](#rules-window)
  - [Manual-override marker](#manual-override-marker)
- [How rules combine](#how-rules-combine)
  - [Kinds](#kinds)
  - [Priority](#priority)
  - [Lifetimes](#lifetimes)
- [Settings](#settings)
- [API](#api)
  - [Calls](#calls)
  - [Options](#options)
  - [Priority conventions](#priority-conventions)
  - [Hook](#hook)
  - [Example](#example)
- [Limits](#limits)

## Overview

Decide which tokens can see a token, one observer at a time.

- A Perception check pinpoints an invisible creature: show it as an outline, only to whoever
  passed, until it moves.
- A failed Stealth contest hides a creature from the one observer who failed, though everyone else
  still sees it.
- A tracking spell lets its caster see a creature through walls for as long as the buff lasts.
- A mistake gets fixed: hand an observer back their normal vision.

Everything is set from the token HUD, or by other modules through the [API](#api).

## Using it

Right-click the token to be seen (or hidden), then click the **Selective Vision** button (a
partly closed eye) on the token HUD. GM only. The button is highlighted when the token has rules
in effect.

### Apply panel

Choose a rule, tick the observers it applies to, and click **Apply to checked**.

- **Rule**: *Grant* (the observer sees the token), *Deny* (the observer doesn't), or *Restore*
  (the observer's vision goes back to normal, ignoring lower-priority rules).
- **Shown as** (grants): *Normal sight*, or a sense's look, such as the blindsense outline or the
  see-invisibility glow.
- **Walls block** (grants): on, the token is seen only with a clear line past walls; off, it is
  seen through them. Darkness never blocks a grant.
- **Priority**: starts at 100, above automated rules from other modules.
- **Lasts**: until removed, until the target moves, a number of rounds, or while a buff is active
  (buffs on the target or on a checked observer).
- **Tag** and **Note**: optional. A new rule replaces an older manual rule for the same observer
  with the same tag; the note is shown in the rules window.

**All observers** applies the rule to every token, including tokens placed later. **Check
selected** ticks the tokens you have selected on the canvas. Each observer shows what it currently
gets; click that to edit the rule deciding it in the rules window, or right-click the observer to
remove that rule.

**Clear checked** removes your manual rules for the checked observers. Rules from other modules
stay; remove those in the rules window.

### Rules window

**Rules** opens every rule on the token, from every source, grouped by observer. Each shows its
priority, where it came from, and how long it lasts, and is marked **In effect** when it is
what decides an observer's vision. Ended rules are dimmed until they are cleaned up.

Edit any rule in place (saving counts as applying it again) or remove it.

### Manual-override marker

Tokens with a manual rule in effect show a small amber eye in their top-right corner, for the GM
only, so an override isn't forgotten.

## How rules combine

### Kinds

| Rule | The observer... |
|---|---|
| Grant | sees the token, ignoring range, light, invisibility, blindness, and GM-hidden. Walls block it only when *Walls block* is on. |
| Deny | contributes nothing toward seeing the token. Another token you control that can see it still shows it. |
| Restore | gets normal vision: lower-priority rules from this module are ignored. |

### Priority

For each observer, the highest-priority rule in effect decides. Ties go to the most recently
applied (or edited) rule. Rules for **All observers** compete with an observer's own rules the same
way, so "deny everyone at 0, grant one PC at 1" works in either order.

### Lifetimes

A rule ends when its lifetime does: the target moves, its rounds run out, or its buff ends.
Ended rules stop applying at once, even with no GM connected, and are removed by the GM's client
shortly after.

## Settings

| Setting | Scope | Default | |
|---|---|---|---|
| Token HUD button column | Per user | Right | Which side of the token HUD the button sits on. |
| Grants reveal hidden tokens | World | On | A grant can show a GM-hidden token to the observers it names. |

## API

```js
const api = game.modules.get("pf1-selective-vision")?.api;
```

Set during `init`. Check for it before calling; nothing here should be a hard dependency.

### Calls

| Call | Returns |
|---|---|
| `api.grant(target, observers, options)` | `Promise<string[]>` rule ids |
| `api.deny(target, observers, options)` | `Promise<string[]>` |
| `api.restore(target, observers, options)` | `Promise<string[]>` |
| `api.update(target, ruleId, changes)` | `Promise<void>`; omitted fields are kept, and the rule counts as newly applied |
| `api.remove(target, ruleIds)` | `Promise<void>` |
| `api.clear(target, { observers, source, tag })` | `Promise<void>`; every filter optional |
| `api.rules(target, { observer })` | Stored rules, each with `live` and `winning` |
| `api.verdict(target, observer)` | The rule deciding that observer's vision, or `null` |
| `api.senses()` | `[{ id, label }]` for the *Shown as* choices |
| `api.PRIORITY`, `api.KINDS`, `api.version` | |

- `target`: a Token, TokenDocument, or UUID.
- `observers`: one or an array of Token, TokenDocument, Actor, UUID, or `"all"`. A linked token
  means its actor, so the rule follows the actor's tokens.
- Writes from a user who can't edit the target token go through the active GM; with no GM
  connected they fail with a warning.

### Options

| Option | Default | |
|---|---|---|
| `source` | `"api"` | Your module id. Shown in the rules window; used for replacement. |
| `priority` | `0` | Integer. |
| `walls` | `true` | Grants only. |
| `sense` | blindsense outline | Grants only. `"sight"` or an id from `api.senses()`. |
| `lifetime` | none | `{ targetMoves, rounds, seconds, buff }`, any combination; `buff` is an item or UUID. |
| `tag` | `""` | |
| `label` | `""` | Shown in the rules window. |
| `replace` | `true` | Remove this source's earlier rules with the same tag for the same observers. |

### Priority conventions

| Priority | For |
|---|---|
| 0 | Routine automation: checks and contests. |
| 50 | Magical certainty, such as tracking effects. |
| 100 | Manual GM decisions (the panel's default). |

### Hook

`pf1SelectiveVision.changed` `(tokenDocument, diff)` runs on every client after a token's rules
change.

### Example

```js
const api = game.modules.get("pf1-selective-vision")?.api;
if (api) {
  // Passed Perception: pinpoint the hider as an outline until it moves.
  await api.grant(hider, passed, {
    source: "my-module", tag: "stealth", lifetime: { targetMoves: true },
    label: "Perception 24 vs. Stealth 19",
  });
  // Failed: hidden from them until it moves.
  await api.deny(hider, failed, { source: "my-module", tag: "stealth", lifetime: { targetMoves: true } });
}
```

## Limits

- Hiding is visual. The token's data still reaches every player, and the combat tracker still
  lists it.
- Only scenes with token vision enabled.
- A player who controls no token sees what any of their tokens can see, as usual in Foundry.
- A GM with no token selected sees everything; select the observer to check what it sees.

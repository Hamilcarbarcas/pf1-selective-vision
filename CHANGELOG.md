# Changelog

All notable changes to this module are documented here. Release notes are taken from the section
matching each release tag.

## [Unreleased]

### Added
- Per-observer visibility rules on tokens: **grant** (seen, with or without walls blocking, shown
  normally or with a sense's look such as the blindsense outline), **deny** (not seen), and
  **restore** (normal vision, ignoring lower-priority rules). Rules can target specific tokens or
  all observers.
- Rules combine by priority, then by which was applied most recently.
- Lifetimes: until removed, until the target moves, a number of rounds, or while a buff is active.
- **Selective Vision** button on the token HUD (GM): an apply panel with an observer checklist,
  and a rules window listing every rule on the token, with editing and removal.
- GM-only marker on tokens carrying a manual rule.
- Settings for the HUD button's column and whether grants reveal GM-hidden tokens.
- API at `game.modules.get("pf1-selective-vision").api` and the `pf1SelectiveVision.changed` hook.

Earlier releases: see the [GitHub Releases page](https://github.com/Hamilcarbarcas/pf1-selective-vision/releases).

# Audio Sourcing Guide (Current)

Last updated: 2026-02-17 (America/Los_Angeles)

## Why Folder Was Renamed
Current SFX are from mixed sources (not only Kenney), so folder name changed:
- old: `/Users/hhj/love_letters/public/audio/sfx/kenney-interface`
- new: `/Users/hhj/love_letters/public/audio/sfx/current`

Runtime mapping is in:
- `/Users/hhj/love_letters/components/black-white-online.tsx`

## Selection Process (How These Were Chosen)
1. Base set was loaded from Kenney Interface Sounds (CC0).
2. You requested per-event swaps by candidate number during iterative listening.
3. Some events were replaced with non-Kenney CC0 assets (OpenGameArt/Freesound).
4. Candidate pool was then reset and removed.
5. Final in-use files were consolidated under `/audio/sfx/current`.

## License Policy
- Only free assets with explicit license source were used.
- Current set is CC0-only.

## Source License References
- Kenney Interface Sounds (CC0):
  - https://kenney.nl/assets/interface-sounds
  - https://opengameart.org/content/kenney-interface-sounds
  - https://opengameart.org/sites/default/files/kenney_interfaceSounds.zip
  - local license copy: `/Users/hhj/love_letters/public/audio/sfx/current/KENNEY-LICENSE.txt`
- OpenGameArt 100 CC0 SFX:
  - https://opengameart.org/content/100-cc0-sfx
  - https://opengameart.org/sites/default/files/100-CC0-SFX_0.zip
- Freesound (CC0 sound page used):
  - https://freesound.org/s/15418/
  - download used in workflow: `https://cdn.freesound.org/previews/15/15418_45698-hq.mp3` (then converted to ogg)
- CC0 legal text:
  - https://creativecommons.org/publicdomain/zero/1.0/

## Current Applied SFX (Event -> File -> Origin)
- `uiClick` -> `/audio/sfx/current/ui-click.ogg` -> Kenney `click_005.ogg` (CC0)
- `tileSubmit` -> `/audio/sfx/current/tile-submit.ogg` -> OpenGameArt 100 CC0 SFX `plop_01.ogg` (CC0)
- `readyConfirm` -> `/audio/sfx/current/ready-confirm.ogg` -> Kenney `confirmation_003.ogg` (CC0)
- `gameStart` -> `/audio/sfx/current/game-start.ogg` -> Kenney `bong_001.ogg` (CC0)
- `victory` -> `/audio/sfx/current/victory.ogg` -> Kenney `confirmation_004.ogg` (CC0)
- `defeat` -> `/audio/sfx/current/defeat.ogg` -> Kenney `error_006.ogg` (CC0)
- `draw` -> `/audio/sfx/current/draw.ogg` -> Kenney `question_004.ogg` (CC0)
- `leave` -> `/audio/sfx/current/leave.ogg` -> Freesound `s/15418` CC0 preview conversion
- `error` -> `/audio/sfx/current/error.ogg` -> Kenney `error_003.ogg` (CC0)

## Current Applied SFX Integrity
Durations:
- `ui-click.ogg`: 0.010023
- `tile-submit.ogg`: 0.299917
- `ready-confirm.ogg`: 0.322018
- `game-start.ogg`: 0.122834
- `victory.ogg`: 0.490408
- `defeat.ogg`: 0.500045
- `draw.ogg`: 0.332472
- `leave.ogg`: 1.615958
- `error.ogg`: 0.533469

SHA256:
- `ui-click.ogg`: `a3ee7ebb036bc3cdc218ae52bb27548c4f49bcf07505274f8b61b1af8236acc2`
- `tile-submit.ogg`: `bd996051cd5de630329ba4b026d52e9452e34a54c40e87e3fbdede68c88ec185`
- `ready-confirm.ogg`: `3091bf0be0497f825769ee0733ca7bdc3bcd59bd6c6e8f2ba8f93d580ff38022`
- `game-start.ogg`: `d21d0f0b782445db579d11e2506b24cd1ac9d664ee33aeaf807761aa7b6fd710`
- `victory.ogg`: `568967a3d9f8a8f6af54ea01729c4882284308f2a27d78c07ffd7ee0d6951661`
- `defeat.ogg`: `a97513d7fd2b12b1210c423be943b4c1ab0e899b11db95855e9b74836e646ae0`
- `draw.ogg`: `585ecb58b529dc49b5c5ce5ba93427bf73b7052bae55e49c43ba8f169c93ac99`
- `leave.ogg`: `9c8117459085fb166f5588df7aa441082096acac6c9125e40f074197080aa303`
- `error.ogg`: `885b28175c7b511118bcffab95675b48bbac9005cf6514656ebdad979276b3ab`

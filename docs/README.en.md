# 抱抱龙 · Pixel Agent Pets

<p align="center"><img src="media/baobaolong.png" alt="Baobaolong logo" width="72" height="72"></p>

[![Four pixel companions by Baobaolong](media/cover.png)](https://plbbl.github.io/pixel-agent-pets/?quality=auto&size=240#theater)

**Four tiny coworkers. A whole lot of character.** Claude, white GPT, DeepSeek and original Clawd, with 66 full animations.

[Automatic quality](https://plbbl.github.io/pixel-agent-pets/?quality=auto&size=240#theater) · [720p showcase](https://plbbl.github.io/pixel-agent-pets/?quality=720&size=240#theater) · [360p showcase](https://plbbl.github.io/pixel-agent-pets/?quality=360&size=240#theater) · [Lightweight pixels](https://plbbl.github.io/pixel-agent-pets/?quality=pixel&size=120#theater) · [中文](../README.md)

The showcase selects quality from display size and screen density. You can also choose quality and size separately, pick an action, pause, scrub and replay. HD previews use saved video sources; pixel mode uses desktop atlases. Clawd retains its original pixels.

## Codex native integration preview: signing blocked

**Automatic native installation is not available.** The full renderer and source integration are implemented, sharing DSH's `Player`, behavior policy, 66 actions, captions and display controls. They target Codex's existing pet window without an additional floating window; the CLI and model kernel remain unchanged.

Actual signing checks found that a locally ad-hoc-signed outer app cannot pass macOS library validation. The required recognized signing conditions have not been met. The installer stops before application writes; it does not disable Hardened Runtime, library validation or other security protections to force installation.

The source integration was inspected against **macOS Codex 26.1013.40934 (20770)**. That is not a supported-installation claim. Frame parity, backup and restore have automated tests, but a working signed app and real native runtime validation are still outstanding. This release provides an integration preview, not a working Codex one-click installer or a reduced-sheet substitute.

## Install in official DeepSeek Harness

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --dsh
```

This is the available one-click installation. No clone, npm dependencies or pet API key is needed; a missing Node runtime is prepared separately without replacing system Node.

Install and launch the [official DSH web client](https://github.com/deepseek-ai/deepseek-harness) first. One existing web profile is selected automatically; multiple profiles prompt for a choice. Broken profiles or missing unrelated dependencies cause a stop with configuration preserved. Other plugins, permissions and model settings are not repaired or replaced.

Reopen the selected web window. **Right-click the pet to change character, size or quality.** Automatic quality chooses 80/160/320px atlases using size and screen density, keeping the current animation phase. The plugin has been tested with official **0.1.0-rc.6 web**. Terminal TUI profiles do not show this web UI plugin. Add `--profile YOUR_PROFILE` only when you want to name an existing profile explicitly.

## Check or restore

Use the same entry point; you do not need to locate a downloaded folder:

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- doctor --dsh

curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- uninstall --dsh
```

DSH removal affects only this plugin. `doctor` checks files, links and configuration. Codex native installation remains unavailable; source backup/restore tests are not a claim of a working signed installation. See [installation and recovery details](installation.md).

## Local behavior

The DSH plugin and Codex source preview share the same complete animation engine and policy. Decoded images replace frames only when ready; cache use is bounded, hidden players pause, and reduced motion is respected. Animation never requests a model or changes the CLI kernel. Captions are local presentation, never prompt additions. Current Chinese draft detection transfers only a local boolean, not input text.

Claude's Chinese-language sequence is a fictional local performance. It does not determine nationality or ban an account.

<details>
<summary><b>Optional: legacy nine-state sheets and development</b></summary>

The [compatibility links](https://plbbl.github.io/pixel-agent-pets/#native-install) add compact sheets to the official pet catalog. Those sheets have nine fixed states and do not include full action logic or story captions. They do not substitute for the blocked full native integration.

Source development still uses `git clone`, `npm ci`, `npm run build` and `npm test`. Running `node scripts/cli.mjs install --codex` from that source tree installs only the compatibility sheets. The older standalone macOS companion is archived. It creates an additional window, is not started or recommended by the current installer, and does not satisfy native in-place support.

</details>

Code is MIT. The Baobaolong logo, original Clawd, third-party artwork and trademarks are excluded; see [NOTICE](../NOTICE.md).

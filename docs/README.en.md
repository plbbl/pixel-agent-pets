# 抱抱龙 · Pixel Agent Pets

<p align="center"><img src="media/baobaolong.png" alt="Baobaolong logo" width="72" height="72"></p>

[![Four pixel companions by Baobaolong](media/cover.png)](https://plbbl.github.io/pixel-agent-pets/?quality=auto&size=240#theater)

**Four tiny coworkers. A whole lot of character.** Claude, white GPT, DeepSeek and original Clawd, with 66 full animations.

[Automatic quality](https://plbbl.github.io/pixel-agent-pets/?quality=auto&size=240#theater) · [720p showcase](https://plbbl.github.io/pixel-agent-pets/?quality=720&size=240#theater) · [360p showcase](https://plbbl.github.io/pixel-agent-pets/?quality=360&size=240#theater) · [Lightweight pixels](https://plbbl.github.io/pixel-agent-pets/?quality=pixel&size=120#theater) · [中文](../README.md)

The showcase automatically selects quality from display size and screen pixel density, and also lets you change quality and display size independently, choose an action, pause, scrub and replay. HD previews use the saved video sources; pixel mode uses the desktop atlases. Clawd retains its original pixel art. GitHub READMEs cannot run an interactive player, so these links open the showcase with your selected quality.

## Codex: the original pet position

```sh
git clone https://github.com/plbbl/pixel-agent-pets.git
cd pixel-agent-pets
npm ci
node scripts/cli.mjs install --codex
```

Select a character under Settings → Mini & Pets. This installs four compact native compatibility sheets in Codex's existing pet window. The official renderer fixes nine states, cell sizes, frame counts and timing. **Complete animations and captions are not yet supported in that original window.** Full playback works in the website and DSH. The separate companion below is not a substitute for native in-place integration.

## Official DeepSeek Harness: complete animations

After installing and launching [official DSH](https://github.com/deepseek-ai/deepseek-harness), run from the cloned repository:

```sh
npm ci
node scripts/cli.mjs install --dsh --profile web
```

Restart that profile. Right-click to switch pets. Complete actions and captions follow real UI states. Verified with official DSH 0.1.0-rc.6 web; terminal TUI is not supported by this UI plugin.

<details>
<summary><b>Optional: separate macOS companion</b></summary>

This option creates an additional floating window. It does not replace Codex's built-in renderer.

Download **Pixel-Agent-Pets-macOS.zip** from [Releases](https://github.com/plbbl/pixel-agent-pets/releases/latest), extract it and open **Pixel Agent Pets.app**. Supports macOS 13+, Apple Silicon and Intel. No Node.js or API key is needed for the prebuilt app. Right-click to switch characters or preview complete animations; drag to reposition.

No Accessibility or Screen Recording permission is required. Builds are locally signed and not Apple-notarized; handle any macOS confirmation yourself. Source builds require Node.js 20+ and Xcode Command Line Tools:

```sh
node scripts/cli.mjs install --codex-full
```

Open `~/Applications/Pixel Agent Pets.app` after installation.

</details>

## Local data

No animation requests a model or changes the CLI kernel. DSH and native compatibility sheets use their host's existing states. The optional separate companion incrementally reads `CODEX_HOME/sessions`, retains activity facts and reduces prompt text to a CJK boolean. No conversation text is stored or uploaded. That transcript format is not an official stable API, so unknown records are ignored.

Code is MIT. The Baobaolong logo, original Clawd, third-party artwork and trademarks are excluded; see [NOTICE](../NOTICE.md).

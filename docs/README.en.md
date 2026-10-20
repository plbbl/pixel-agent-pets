<p align="center">
  <a href="https://plbbl.github.io/pixel-agent-pets/?quality=auto&amp;size=240#theater"><img src="media/hero.gif" width="100%" alt="Baobaolong Pixel Agent Pets: Claude, GPT, DeepSeek and Clawd"></a>
</p>

<p align="center">
  <b>Clawd works alongside Claude in Claude Desktop.</b><br>
  Now Codex, DeepSeek Harness and your desktop get one too — plus three new coworkers.
</p>

<p align="center">
  <a href="https://github.com/plbbl/pixel-agent-pets/releases/latest"><img src="https://img.shields.io/github/v/release/plbbl/pixel-agent-pets?style=flat-square&amp;label=release&amp;labelColor=10111e&amp;color=ffd240" alt="Release"></a>
  <a href="../LICENSE"><img src="https://img.shields.io/badge/code-MIT-ffd240?style=flat-square&amp;labelColor=10111e" alt="MIT"></a>
</p>

<p align="center">
  <a href="#install">Install</a> · <a href="#it-works-when-you-work">States</a> · <a href="#the-crew">The crew</a> · <a href="#all-66-animations">66 animations</a> · <a href="../README.md">中文</a>
</p>

## Install

**One command** (macOS / Linux). Finds Codex and DeepSeek Harness on your machine; on a Mac with neither, installs the desktop app:

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash
```

**Or download the desktop app**. It follows Codex / DSH on its own:

<p>
  <a href="https://github.com/plbbl/pixel-agent-pets/releases/latest/download/Pixel-Agent-Pets-macOS-arm64.dmg"><img src="media/btn-mac-arm.png" width="224" alt="Download for macOS · Apple silicon"></a>&nbsp;
  <a href="https://github.com/plbbl/pixel-agent-pets/releases/latest/download/Pixel-Agent-Pets-macOS-x64.dmg"><img src="media/btn-mac-intel.png" width="171" alt="Download for macOS · Intel"></a>&nbsp;
  <a href="https://github.com/plbbl/pixel-agent-pets/releases/latest/download/Pixel-Agent-Pets-Windows-x64-setup.exe"><img src="media/btn-windows.png" width="113" alt="Download for Windows"></a>
</p>

**Or ask your agent**. Send this to Codex / Claude Code / DSH:

```text
Install the pixel pets from https://github.com/plbbl/pixel-agent-pets for me
```

<details>
<summary>For agents: flags and removal</summary>

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --codex      # Codex only
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --dsh        # DSH only; add --profile NAME if there are several web profiles
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --desktop    # macOS desktop app, launched when installed
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- doctor --codex
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- uninstall --codex   # or --dsh / --desktop
```

Afterwards: in Codex pick a pet under Settings → Mini & Pets; in DSH reopen the web window and right-click the pet to switch characters. [Full guide](installation.md)

</details>

## It works when you work

<p align="center"><img src="media/work.gif" width="100%" alt="Each character's animation for sending, thinking, reading code, running commands, done and error"></p>

Your agent works in the background; one glance tells you whether it is thinking, reading, running a command or done. The desktop app and DSH follow the real task state; Codex uses the nine official pet states.

## The crew

<p align="center">
  <img src="media/story-claude.gif" width="49%" alt="Claude: Chinese? A Chinese user? Account on hold">
  <img src="media/story-gpt.gif" width="49%" alt="GPT: probe, gates, smoke test, acceptance matrix, finally starts work">
  <img src="media/story-deepseek.gif" width="49%" alt="DeepSeek: no rice, begging, eating, stealing the rice cooker, food coma">
  <img src="media/story-clawd.gif" width="49%" alt="Clawd: the original pixel crab from Claude Desktop">
</p>

When idle they put on their own shows. Pat them, drag them or leave them alone — they react.

## All 66 animations

<p align="center"><a href="https://plbbl.github.io/pixel-agent-pets/?quality=auto&amp;size=240#theater"><img src="media/wall.gif" width="100%" alt="All 66 animations of the four characters"></a></p>

<p align="center"><a href="https://plbbl.github.io/pixel-agent-pets/?quality=auto&amp;size=240#theater"><b>Watch them in 320px HD →</b></a></p>

## Three ways to run

| | Desktop app | DeepSeek Harness | Codex |
|---|---|---|---|
| Animations | 66 + stories | 66 + stories | 9 official states |
| Follows | Codex · DSH | DSH web | Codex |
| System | macOS · Windows | macOS · Linux | macOS |

<details>
<summary>Build from source</summary>

```sh
git clone https://github.com/plbbl/pixel-agent-pets.git && cd pixel-agent-pets
npm ci && npm run build && npm test
```

Desktop app: see [desktop/](../desktop/README.md). The README animations are rendered from the original sprite atlases by `npm run build:media` (Python 3, Pillow, NumPy).

</details>

<p align="center"><sub>Made by Baobaolong · code MIT · character art and Clawd: see <a href="../NOTICE.md">NOTICE</a></sub></p>

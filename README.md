<p align="center">
  <img src="docs/media/cover.gif" alt="Pixel Agent Pets — Small pixels. Big personalities." width="1200">
</p>

<p align="center">
  <strong>给 Codex 和 DeepSeek Harness，添一点小脾气。</strong><br>
  四个角色，66 套完整动作。思考、干活、怀疑你，顺便吃口饭。
</p>

<p align="center">
  <a href="https://plbbl.github.io/pixel-agent-pets/">进入动作剧场</a> ·
  <a href="https://github.com/plbbl/pixel-agent-pets/releases/latest">下载 macOS 完整版</a> ·
  <a href="#安装">开始安装</a> ·
  <a href="docs/README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/plbbl/pixel-agent-pets/actions/workflows/test.yml"><img src="https://github.com/plbbl/pixel-agent-pets/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
  <a href="https://github.com/plbbl/pixel-agent-pets/releases"><img src="https://img.shields.io/github/v/release/plbbl/pixel-agent-pets?color=d6653c&label=release" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/code-MIT-827c70" alt="Code: MIT"></a>
</p>

---

### 认识四个小同事

<table>
<tr>
<td align="center" width="25%"><img src="docs/media/claude.gif" width="160" alt="Claude 完整待机预览"><br><strong>Claude</strong><br><sub>认真，但有一点怀疑。</sub><br><sub>12 套动作 · 中文彩蛋</sub></td>
<td align="center" width="25%"><img src="docs/media/gpt.gif" width="160" alt="纯白 GPT 完整待机预览"><br><strong>GPT</strong><br><sub>可以开始了。先确认一下。</sub><br><sub>14 套动作 · 探针与门禁</sub></td>
<td align="center" width="25%"><img src="docs/media/deepseek.gif" width="160" alt="DeepSeek 完整待机预览"><br><strong>DeepSeek</strong><br><sub>雷霆思考，光速开饭。</sub><br><sub>15 套动作 · 大米饭宇宙</sub></td>
<td align="center" width="25%"><img src="docs/media/clawd.gif" width="160" alt="原版 Clawd 待机预览"><br><strong>Clawd</strong><br><sub>那个熟悉的小家伙。</sub><br><sub>25 套原版动作</sub></td>
</tr>
</table>

**[去剧场逐帧看看 →](https://plbbl.github.io/pixel-agent-pets/#theater)** 可以挑动作、拖进度条、重播，完整看到每一帧。没有模型请求。

### 完整动作，带到桌面

**Codex 完整动作伴侣**使用 macOS 原生透明小窗口，播放原有图集与字幕。只读本地 Codex 活动事件，随发送、思考、工具调用、等待、完成和中断切换；多个会话同时运行时，不会因为其中一个结束就提前庆祝。

**官方 DSH 插件**直接显示在输入区附近，观察官方会话状态。右键切换角色，保留完整动作和本地短字幕。

固定脚底线、解码后切画、有限图片缓存。静止时不重复画，隐藏时停表；也尊重系统“减少动态效果”。不改模型内核，不把字幕写进提示词。

## 安装

### Codex：下载完整动作 App

1. 在 [Releases](https://github.com/plbbl/pixel-agent-pets/releases/latest) 下载 **Pixel-Agent-Pets-macOS.zip**，解压。
2. 把 **Pixel Agent Pets.app** 放进 Applications，打开即可。
3. **右键宠物**切换角色、逐个播放完整动作；左键拖动可改变位置。菜单栏爪印可以重新显示或退出。

macOS 13+，支持 Apple Silicon 与 Intel。App 是独立的原生伴侣窗口，**不替换 Codex 内置宠物渲染器**。如果原生宠物也开着，可在 Codex 的“Mini 与虚拟宠物”中隐藏它，避免两只同时显示。

预编译 App 无需 Node.js、API Key、辅助功能或录屏权限。开源构建使用本地签名，尚未经过 Apple 公证；若系统要求确认，请由你在 macOS 中完成，或使用下面的源码构建方式。

<details>
<summary><b>从源码构建和安装</b></summary>

需要 Node.js 20+、macOS 13+、Xcode Command Line Tools。

```sh
git clone https://github.com/plbbl/pixel-agent-pets.git
cd pixel-agent-pets
npm ci
node scripts/cli.mjs install --codex-full
```

打开 `~/Applications/Pixel Agent Pets.app`。源码构建只签名本项目自己的 App，不修改 Codex。

</details>

### 官方 DeepSeek Harness

先安装并启动过[官方 DSH](https://github.com/deepseek-ai/deepseek-harness)，再运行：

```sh
git clone https://github.com/plbbl/pixel-agent-pets.git
cd pixel-agent-pets
npm ci
node scripts/cli.mjs install --dsh --profile web
```

重开对应 DSH profile。**右键宠物切换角色**，左键预览。已实测官方 **0.1.0-rc.6 web 客户端**；终端 TUI 不显示这个网页插件。桌面包装器需要指定它实际使用、且已存在的 profile。

<details>
<summary><b>Codex 官方原生宠物槽 · 精简兼容版</b></summary>

原生槽的尺寸、帧数和触发器由官方应用固定，它不能直接播放这里的完整动作库。想要完整动作，请使用上面的 macOS 伴侣。

如果只需要官方宠物栏，仍可安装四套精简图集：

```sh
node scripts/cli.mjs install --codex
```

`⌘,` → **Mini 与虚拟宠物** → 列表旁圆形刷新箭头 → 选中宠物。也可在[展示页](https://plbbl.github.io/pixel-agent-pets/#install)点原生安装链接。

</details>

### 工作状态与本地数据

| | Codex 完整动作伴侣 | DSH 插件 | Codex 原生兼容版 |
|---|---|---|---|
| 动作 | 66 套原图集 | 66 套原图集 | 9 行固定图集 |
| 触发 | 本地活动事件 | 官方 UI 状态 | 官方原生状态机 |
| 本地字幕与角色剧情 | 有 | 有 | 原生不支持 |
| 角色切换 | 右键 / 菜单栏 | 右键 | 官方设置 |
| 模型请求 | 无 | 无 | 由官方应用负责 |

完整版在本机增量读取 `CODEX_HOME/sessions` 的活动记录，提取事件类型、工具名、运行状态；提示词只计算“是否含中文”。原文不保存、不上传，不扫描整个历史。这个文件格式不是稳定的官方 API，遇到不认识的事件会忽略。原生图集与 DSH 插件不需要这个读取步骤。

Claude 的中文剧情只是本地角色表演：不识别国籍，也不会封禁任何账户。更详细的触发规则见[行为说明](docs/behavior.md)。

### 开发与卸载

```sh
npm run build                   # DSH 与原生兼容图集
npm run build:site              # 互动动作剧场
npm run build:desktop           # macOS 完整动作 App
npm run check
npm test

node scripts/cli.mjs uninstall --codex-full
node scripts/cli.mjs uninstall --codex
node scripts/cli.mjs uninstall --dsh --profile web
```

卸载前先退出完整动作 App。安装器只处理本项目拥有的文件，保留可恢复备份，不覆盖其他宠物、插件、授权策略或 API Key。[详细安装说明](docs/installation.md)

---

<p align="center"><sub>Made with little pixels & a little too much personality.<br>独立同人项目。代码使用 MIT；原版 Clawd、第三方图形与商标不在该授权内，见 <a href="NOTICE.md">作品与来源说明</a>。</sub></p>

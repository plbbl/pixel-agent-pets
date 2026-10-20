<p align="center">
  <img src="docs/media/baobaolong.png" width="72" height="72" alt="抱抱龙标志">
</p>
<h1 align="center">抱抱龙 · Pixel Agent Pets</h1>
<p align="center">四个像素小同事，66 套动作。给桌面添一点小脾气。</p>

<p align="center">
  <a href="https://plbbl.github.io/pixel-agent-pets/?quality=auto&amp;size=240#theater"><img src="docs/media/cover.png" alt="抱抱龙出品：Claude、GPT、DeepSeek 与原版 Clawd。点击看高清完整动作。" width="1200"></a>
</p>

<p align="center">
  <a href="https://plbbl.github.io/pixel-agent-pets/?quality=auto&amp;size=240#theater"><strong>看高清完整动作 ↗</strong></a> ·
  <a href="#安装">安装到桌面</a> ·
  <a href="docs/README.en.md">English</a>
</p>
<p align="center">
  <a href="https://github.com/plbbl/pixel-agent-pets/actions/workflows/test.yml"><img src="https://github.com/plbbl/pixel-agent-pets/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
  <a href="https://github.com/plbbl/pixel-agent-pets/releases"><img src="https://img.shields.io/github/v/release/plbbl/pixel-agent-pets?color=d6653c&amp;label=release" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/code-MIT-827c70" alt="Code: MIT"></a>
</p>

### 先挑清晰度，再看看它们

**[自动清晰度](https://plbbl.github.io/pixel-agent-pets/?quality=auto&size=240#theater)** · **[原画 720p](https://plbbl.github.io/pixel-agent-pets/?quality=720&size=240#theater)** · **[清晰 360p](https://plbbl.github.io/pixel-agent-pets/?quality=360&size=240#theater)** · **[轻量像素](https://plbbl.github.io/pixel-agent-pets/?quality=pixel&size=120#theater)**

展示页默认根据显示大小与屏幕像素密度自动选择清晰度，也可以分别手动调整**清晰度**与**显示大小**，挑选动作、暂停、拖动进度、重播。720p 与 360p 使用保存的清晰视频素材；轻量模式使用桌面宠物图集。Clawd 保持原版像素。GitHub README 不运行交互脚本，上面的入口会直接打开对应清晰度的展示页，进去后仍可随时切换。

<table>
<tr>
<td align="center" width="25%"><a href="https://plbbl.github.io/pixel-agent-pets/?quality=720&amp;size=240#theater"><img src="docs/media/claude.gif" width="160" alt="Claude 像素待机预览"></a><br><strong>Claude</strong><br><sub>认真，但有一点怀疑。</sub><br><sub>12 套动作 · 中文彩蛋</sub></td>
<td align="center" width="25%"><img src="docs/media/gpt.gif" width="160" alt="纯白 GPT 像素待机预览"><br><strong>GPT</strong><br><sub>可以开始了。先确认一下。</sub><br><sub>14 套动作 · 探针与门禁</sub></td>
<td align="center" width="25%"><img src="docs/media/deepseek.gif" width="160" alt="DeepSeek 像素待机预览"><br><strong>DeepSeek</strong><br><sub>雷霆思考，光速开饭。</sub><br><sub>15 套动作 · 大米饭宇宙</sub></td>
<td align="center" width="25%"><img src="docs/media/clawd.gif" width="160" alt="原版 Clawd 像素待机预览"><br><strong>Clawd</strong><br><sub>那个熟悉的小家伙。</sub><br><sub>25 套原版动作</sub></td>
</tr>
</table>

上面的动图是轻量像素预览。清晰版在[动作展示页](https://plbbl.github.io/pixel-agent-pets/?quality=720&size=240#theater)中按需加载，不增加桌面插件的资源开销。

## 安装

**DSH 一键安装已就绪；Codex 原位完整接入仍受 macOS 签名条件阻塞，暂不可自动安装。**不把精简图集或额外窗口当作原位完整支持。

### Codex：原位完整播放器预览 · 签名验证中

原位播放器与接入源码已经完成，与 DSH 共用 `Player` 和行为逻辑，包含 66 套完整动作、剧情字幕与显示控制；目标是 **Codex 原来的宠物窗口**，不增加悬浮窗口，CLI 与模型内核保持不变。

**自动安装暂不可用。**实际签名核验发现，外层应用临时本地签名无法通过 macOS 的库验证，所需的受认可签名条件尚未满足。当前安装器在修改应用前停止，不会关闭系统安全保护来强行安装。

源码接入按 **macOS Codex 26.1013.40934（20770）** 核验；这不是可用安装版本的承诺。播放器逐帧一致性、备份与恢复有自动测试，真实原位运行仍未完成验证。

<details>
<summary>为什么不能直接重新签名？</summary>

macOS 会验证应用加载的库是否符合签名条件。临时签名不足以满足当前应用的库验证；仅重签外层应用会得到无法正常加载的安装结果。完整恢复备份与源码测试不能替代这项验证，因此本版本只提供原位集成预览，不提供可执行的 Codex 一键安装入口。

</details>

### 官方 DeepSeek Harness：直接住进输入框

复制到终端即可。安装器下载已构建资源并逐文件校验；无需克隆仓库、`npm install` 或手动复制图集。缺少 Node.js 时会准备独立运行环境，不替换系统 Node。宠物不需要 API Key。

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --dsh
```

先安装并启动过[官方 DSH 网页客户端](https://github.com/deepseek-ai/deepseek-harness)。只有一个网页 profile 时自动选择；有多个时在终端选一个。已有 profile 缺失依赖或损坏时会停止并保留原配置，不修补其他插件、模型或权限设置。

安装后重新打开对应 DSH 网页窗口。**右键宠物切换角色、大小和清晰度**；自动清晰度根据显示大小和屏幕像素密度选择 80/160/320px 源，调整时继续当前动作。已实测官方 **0.1.0-rc.6 web 客户端**；终端 TUI 不显示网页宠物。

### 检查与恢复

使用同一个入口即可检查或卸载，不需要寻找下载目录：

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- doctor --dsh

curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- uninstall --dsh
```

DSH 卸载只移除本插件。`doctor` 检查安装文件与配置。Codex 原位安装尚未开放；不能把安装器测试或文件检查称作真实运行验收。[详细安装、可选参数与恢复说明](docs/installation.md)

### 小，也要认真

| | Codex 原位集成预览 | DSH 插件 |
|---|---|---|
| 当前状态 | 签名条件阻塞，暂不可安装 | 一键安装可用 |
| 位置 | 原来的宠物窗口 | 输入区 |
| 动作与触发 | 共享完整 66 套动作与行为逻辑 | 共享完整 66 套动作与行为逻辑 |
| 状态来源 | 当前原生任务、工具与输入状态 | 官方客户端 UI 状态 |
| 显示控制 | 右键角色、大小、清晰度 | 右键角色、大小、清晰度 |

固定脚底线、图片解码后再切换、有限缓存；隐藏时停表，尊重系统“减少动态效果”。动画不调用模型、不改变 CLI 内核，也不把字幕写进提示词。当前输入是否含中文只生成一个本地布尔值，不传输输入原文。

Claude 的中文剧情只是本地角色表演：不识别国籍，也不会封禁任何账户。详见[行为说明](docs/behavior.md)。

<details>
<summary><b>可选：9 状态兼容图集与开发</b></summary>

只想添加官方可识别的兼容图集，可使用[展示页的兼容入口](https://plbbl.github.io/pixel-agent-pets/#native-install)。这是 **9 种固定状态的精简版**，不包含完整动作逻辑与剧情字幕，不能替代原位完整集成。

从源码开发需要 Node.js 与项目依赖：

```sh
git clone https://github.com/plbbl/pixel-agent-pets.git
cd pixel-agent-pets
npm ci
npm run build
npm run check
npm test

# 仅安装旧的兼容图集
node scripts/cli.mjs install --codex
```

兼容图集可在 `⌘, → Mini 与虚拟宠物` 中刷新并选中。旧独立 macOS 伴侣已归档；它会额外创建窗口，不在当前安装流程中推荐，也不能用于宣称原位完整支持。

</details>

---

<p align="center"><sub>抱抱龙出品。小小像素，认真陪伴。<br>独立同人项目。代码使用 MIT；抱抱龙标志、原版 Clawd、第三方图形与商标不在代码授权内，见 <a href="NOTICE.md">作品与来源说明</a>。</sub></p>

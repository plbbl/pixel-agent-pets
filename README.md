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

**[自动清晰度](https://plbbl.github.io/pixel-agent-pets/?quality=auto&size=240#theater)** · **[高清 320px](https://plbbl.github.io/pixel-agent-pets/?quality=720&size=240#theater)** · **[清晰 160px](https://plbbl.github.io/pixel-agent-pets/?quality=360&size=240#theater)** · **[轻量像素](https://plbbl.github.io/pixel-agent-pets/?quality=pixel&size=120#theater)**

展示页默认根据显示大小与屏幕像素密度自动选择清晰度，也可以分别手动调整**清晰度**与**显示大小**，挑选动作、暂停、拖动进度、重播。高清与清晰模式使用真实 320px／160px 动作图集；轻量模式使用桌面宠物图集。Clawd 保持原版像素。GitHub README 不运行交互脚本，上面的入口会直接打开对应清晰度的展示页，进去后仍可随时切换。

### Claude · 完整中文彩蛋

<p align="center"><a href="https://plbbl.github.io/pixel-agent-pets/?pet=claude&amp;quality=720&amp;size=300#theater"><img src="docs/media/claude.gif" height="340" alt="Claude 高清完整中文彩蛋"></a><br><sub>中文？→中国人？→白眼→封禁印章 · 195 帧，9.75 秒</sub></p>

### GPT · 流程走完，终于开工

<p align="center"><a href="https://plbbl.github.io/pixel-agent-pets/?pet=gpt&amp;quality=720&amp;size=300#theater"><img src="docs/media/gpt.gif" height="340" alt="GPT 高清完整探针门禁冒烟验收矩阵到开工"></a><br><sub>探针→门禁→冒烟→验收矩阵→开工 · 520 帧，26 秒</sub></p>

### DeepSeek · 大米饭宇宙

<p align="center"><a href="https://plbbl.github.io/pixel-agent-pets/?pet=deepseek&amp;quality=720&amp;size=300#theater"><img src="docs/media/deepseek.gif" height="340" alt="DeepSeek 高清完整没饭讨饭吃饭偷饭晕碳演出"></a><br><sub>没饭→讨饭→吃饭→偷饭→晕碳ing · 400 帧，20 秒</sub></p>

<p align="center"><img src="docs/media/clawd.gif" width="120" alt="原版 Clawd"><br><sub>另有原版 Clawd · 25 套经典像素动作</sub></p>

上面三套动图使用高清素材，完整播放经典演出链；Clawd 保持原版像素。[动作展示页](https://plbbl.github.io/pixel-agent-pets/?quality=auto&size=240#theater)可切换清晰度、大小与每个独立动作。展示媒体按需加载，不增加桌面插件的资源开销。

## 安装

选择客户端，把对应命令复制到终端。安装器下载并校验已构建的资源；无需克隆仓库、`npm install` 或手动复制文件。缺少 Node.js 时会准备独立运行环境，不替换系统 Node。宠物不需要 API Key。

### 独立桌宠：macOS 与 Windows

**[下载安装包](https://github.com/plbbl/pixel-agent-pets/releases/latest)**。macOS 打开 DMG，把「抱抱龙桌宠」拖到 Applications；Windows 运行安装程序。无需安装 DSH、Codex 或 Node.js。

桌面上只有透明的小宠物。**默认自动跟随本机 Codex／DSH 的真实任务状态**：发送、思考、工具、等待、输出、完成、错误与停止。右键或托盘的「跟随工作」可以指定 Codex、DSH，或关闭跟随。

单击摸摸，连续摸有不同反应；悬停会回应，拖动松手有落地反馈，久闲会休息，点击可唤醒。空闲时自动演出各角色的小剧情；真实任务优先，开始工作会接回工作动作。双击播放完整经典演出，右键切换四个角色、单独动作、大小与清晰度。字幕始终在上方，偏好和位置保存在本机。

使用系统 WebView，本地素材播放不请求模型 API。Codex 通过只读任务事件跟随；DSH 由本插件的公开事件桥提供状态。DSH 更新插件后，需要等任务结束再正常重启网页服务，单刷新网页不会重载后台插件。

### Codex：官方 9 状态兼容版

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --codex
```

需要支持自定义宠物的 Codex 桌面版。安装器只添加官方支持的宠物图集，**不修改 Codex 应用、签名或 CLI**。安装后打开 `⌘, → Mini 与虚拟宠物`，刷新列表并选择角色；若列表尚未更新，重新打开 Codex。

Claude、GPT、DeepSeek 各有**高清与 80px 像素资源**可选，Clawd 保留原版像素。在官方宠物「外观」中调整大小（80–224px）。角色、位置与工作状态由官方宠物系统管理，使用原来的宠物窗口。

**Codex 固定播放 9 种官方状态映射。**思考、文字输出和工具执行共用官方 `running` 状态；不包含完整 66 动作自动触发、中文剧情或上方字幕。展示页可以播放所有原始动作，不能据此推断 Codex 兼容版拥有相同的完整演出逻辑。

### 官方 DeepSeek Harness：完整 66 动作

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --dsh
```

先安装并启动过[官方 DSH 网页客户端](https://github.com/deepseek-ai/deepseek-harness)。只有一个网页 profile 时自动选择；多个时在终端选一个。已有 profile 缺失依赖或损坏时停止并保留原配置，不修补其他插件、模型或权限设置。

安装后重新打开对应网页窗口。**右键宠物切换角色、大小和清晰度**，也可以预览完整动作。66 套动作按真实发送、思考、输出、工具、确认、错误与完成状态触发；空闲动作轮换。自动清晰度结合显示大小和屏幕像素密度选择 80/160/320px 源，调整时继续当前动作。已实测官方 **0.1.0-rc.6 web 客户端**；终端 TUI 不显示网页宠物。

### 三个版本，按用途选择

| | 独立桌宠 | Codex 官方兼容版 | DSH 完整插件 |
|---|---|---|---|
| 动作 | 完整 66 套与经典演出链 | 9 种官方状态映射 | 完整 66 套动作与细分触发 |
| 状态来源 | 本机 Codex／DSH 只读事件、鼠标互动、自主行为 | 官方宠物状态机 | 当前官方 UI 活动 |
| 剧情与字幕 | 支持 | 不包含 | 支持 |
| 角色与大小 | 右键／托盘 | 官方设置；80–224px | 右键；80–224px |
| 清晰度 | 自动／80／160／320px | 高清／80px 图集选项；Clawd 原像素 | 自动／80／160／320px；Clawd 原像素 |
| 应用与内核 | 独立应用 | 不改应用、签名或 CLI | 不改 CLI、provider 或权限 |

Codex 和 DSH 使用客户端现有界面；独立桌宠是另一个可单独安装的桌面应用。

### 检查与卸载

使用同一个入口，不需要寻找下载目录：

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- doctor --codex
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- doctor --dsh

curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- uninstall --codex
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- uninstall --dsh
```

Codex 只移除本项目管理的宠物文件并保留恢复备份；DSH 只移除本插件。其他宠物、插件、会话、模型和密钥不受影响。[详细安装与恢复说明](docs/installation.md)

### 小，也要认真

独立桌宠与 DSH 使用固定脚底线、解码后切换和有限缓存；隐藏时停表，尊重系统“减少动态效果”。完整动作与字幕在本地播放，不调用模型，不把字幕写进提示词。当前草稿是否含中文只生成本地布尔值；Codex 兼容图集不观察草稿或扫描会话文件。

独立桌宠仅投影白名单状态，不保存聊天正文、工具参数或命令输出。Codex 的新中文输入只生成本地布尔触发值；关闭跟随后停止读取任务日志。

Claude 的中文剧情仅存在于完整预览、独立桌宠与 DSH 本地演出：不识别国籍，也不会封禁真实账户。详见[行为说明](docs/behavior.md)。

<details>
<summary><b>从源码开发</b></summary>

```sh
git clone https://github.com/plbbl/pixel-agent-pets.git
cd pixel-agent-pets
npm ci
npm run build
npm run check
npm test
```

源码开发需要项目依赖；使用上面的一键安装不需要。展示页的[逐只导入入口](https://plbbl.github.io/pixel-agent-pets/#native-install)也是 Codex 官方 9 状态兼容图集，不增加完整剧情触发。

</details>

---

<p align="center"><sub>抱抱龙出品。小小像素，认真陪伴。<br>独立同人项目。代码使用 MIT；抱抱龙标志、原版 Clawd、第三方图形与商标不在代码授权内，见 <a href="NOTICE.md">作品与来源说明</a>。</sub></p>

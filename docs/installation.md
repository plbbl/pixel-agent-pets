# 安装、检查与卸载

插件安装入口使用已经构建的 Release，校验压缩包和每个文件。无需克隆仓库、编译、安装 npm 依赖或为宠物填写 API Key。缺少 Node.js 22+ 时会缓存校验过的官方运行环境，不替换系统 Node。

## 独立桌宠：macOS / Windows

在 [最新 Release](https://github.com/plbbl/pixel-agent-pets/releases/latest) 下载对应系统的桌宠安装包。macOS 打开 DMG 并拖入 Applications，Windows 运行安装程序。不需要 Node.js、DSH、Codex 或 API Key。

启动后只显示透明宠物。拖动移动；右键宠物或打开系统托盘菜单，切换角色、完整演出、单个动作、大小、画质、显示／隐藏与退出。偏好和窗口位置自动保存。关闭／隐藏时暂停绘制，退出即结束进程。系统 WebView 负责显示，不捆绑另一份浏览器。

卸载时移除应用即可。独立桌宠不会注入 Codex 或 DSH，也不观察模型会话。

## Codex：官方 9 状态兼容版

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --codex
```

使用支持自定义宠物的 Codex 桌面版。安装器仅添加官方格式的 `pet.json` 与 `spritesheet.png`，不修改应用、签名、CLI 或模型内核，不需要重新签名。已有本项目宠物更新前移入备份；不会覆盖其他来源的宠物。

打开 `⌘, → Mini 与虚拟宠物`，刷新列表并选择角色；若没有更新，重新打开 Codex。Claude、GPT、DeepSeek 各有高清与 80px 像素资源，Clawd 使用原版像素。官方宠物「外观」可调整大小（80–224px）。

**安装结果是 9 种固定状态映射。**图集由官方任务状态机播放，思考、文字输出与工具执行共用 `running`，没有完整 66 动作自动触发、中文剧情或上方字幕。展示页播放的是完整素材库，和 Codex 安装后的映射范围不同。

默认遵循 `CODEX_HOME`，仅管理带本项目标记的 `pets/pixel-agent-*` 目录。旧版本与卸载文件保留在其 `pixel-agent-pets-backups/` 中。

## 官方 DSH：完整动作插件

先安装并启动过[官方 DeepSeek Harness 网页版](https://github.com/deepseek-ai/deepseek-harness)，再运行：

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --dsh
```

安装器发现已有网页 profile：单个自动选择，多个询问。终端 TUI profile 无法显示网页插件；没有网页 profile 时先用官方 DSH 启动一次。安装后重新打开所选网页窗口，右键宠物调整角色、大小和清晰度，或预览完整动作。

DSH 保留全部 66 套动作与细分状态触发，包括本地剧情字幕。自动清晰度随大小与屏幕精度选择 80／160／320px 源；Clawd 保留原始像素。调整显示不会重启当前动作。实际网页显示已核验于官方 **0.1.0-rc.6 web 客户端**。

通过官方插件命令安装，只添加本项目依赖与 bundle。原配置先备份；已有损坏配置、缺失的其他插件或官方安装命令失败时停止并恢复配置，不修补其他用户配置。

默认遵循 `DSH_HOME`。可明确指定已存在的网页 profile：

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --dsh --profile YOUR_PROFILE
```

官方 `dsh` 不在标准位置时，可指定可执行文件：

```sh
export PIXEL_PETS_DSH_BIN=/absolute/path/to/dsh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --dsh
```

## 检查

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- doctor --codex
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- doctor --dsh
```

检查文件、版本、插件链接与启用状态，不启动模型任务。多个 DSH profile 仍会询问，也可追加 `--profile YOUR_PROFILE`。

## 卸载与恢复

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- uninstall --codex
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- uninstall --dsh
```

Codex 仅把本项目管理的宠物目录移入备份，不需要恢复或重新签名应用。DSH 只禁用并移除本插件，不卸载官方 DSH 或其他插件。备份目录与安装记录保留，供需要时恢复本项目文件。

安装器资源与记录默认保存在：

- macOS：`~/Library/Application Support/抱抱龙/Pets/`。
- Linux（DSH）：`~/.local/share/baobaolong-pets/`，或 `$XDG_DATA_HOME/baobaolong-pets/`。

可通过 `PIXEL_PETS_INSTALL_HOME` 指定位置。Codex 与 DSH 插件均使用已有界面；独立桌宠是独立安装的应用。

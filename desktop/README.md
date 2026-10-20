# 抱抱龙桌宠

macOS 和 Windows 上的透明桌宠。四个角色、66 套动作和完整剧情都打包在应用里，离线可用。

## 安装

| 系统 | 下载 |
|---|---|
| Apple 芯片 Mac | [`Pixel-Agent-Pets-macOS-arm64.dmg`](https://github.com/plbbl/pixel-agent-pets/releases/latest/download/Pixel-Agent-Pets-macOS-arm64.dmg) |
| Intel Mac | [`Pixel-Agent-Pets-macOS-x64.dmg`](https://github.com/plbbl/pixel-agent-pets/releases/latest/download/Pixel-Agent-Pets-macOS-x64.dmg) |
| Windows 64 位 | [`Pixel-Agent-Pets-Windows-x64-setup.exe`](https://github.com/plbbl/pixel-agent-pets/releases/latest/download/Pixel-Agent-Pets-Windows-x64-setup.exe) |

macOS 也可以一行命令装好并启动：

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --desktop
```

## 怎么玩

- **跟着干活**：默认跟随本机 Codex / DSH 的任务状态。右键或托盘「跟随工作」可选自动、Codex、DSH 或关闭。
- **互动**：单击摸摸，连续摸反应不同；悬停会回应；拖起来松手有落地反应；久了会睡，点一下叫醒。
- **自己演**：闲下来轮流演小剧情，双击播放完整剧情。
  - Claude：中文？→ 中国人？→ 封禁
  - GPT：探针 → 门禁 → 冒烟 → 验收矩阵 → 开工
  - DeepSeek：没饭 → 讨饭 → 吃饭 → 偷饭 → 晕碳
  - Clawd：Claude Desktop 原版 25 套动作
- **右键菜单**：换角色、单个动作、大小、清晰度，隐藏或退出。位置和设置自动保存。

DSH 需要本项目的新版插件提供状态；更新插件后，等当前任务结束再重启 DSH 网页服务。

## 从源码构建

需要 Node.js 22+、Rust 和 [Tauri 构建依赖](https://v2.tauri.app/start/prerequisites/)：

```sh
cd desktop
npm ci && npm run check && npm test
npm run build:app && npm run smoke && npm run package
```

`smoke` 会真实启动应用，检查四个角色 × 四档清晰度都画出了画面，报告写入 `artifacts/`。

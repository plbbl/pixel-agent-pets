# 抱抱龙桌宠

macOS 和 Windows 的独立透明桌宠，使用系统 WebView。四个角色、66 套完整动作和经典演出都随应用打包，播放不需要联网。

从 [最新 Release](https://github.com/plbbl/pixel-agent-pets/releases/latest) 下载：

| 系统 | 安装包 |
|---|---|
| Apple Silicon Mac | `Pixel-Agent-Pets-macOS-arm64.dmg` |
| Intel Mac | `Pixel-Agent-Pets-macOS-x64.dmg` |
| Windows 64 位 | `Pixel-Agent-Pets-Windows-x64-setup.exe` |

macOS 打开 DMG 并拖入 Applications；Windows 运行安装程序。每个安装包旁附 SHA-256 校验文件。当前为社区构建，未使用商业开发者证书或 Apple 公证；系统可能要求确认来源。Windows 缺少 WebView2 时由安装程序引导安装系统运行环境。

拖动宠物调整位置。右键宠物或点击菜单栏／系统托盘的抱抱龙标志，选择角色、动作、完整演出、大小与清晰度；也可隐藏或退出。设置和位置自动保存在本机。

- Claude：完整中文彩蛋。
- GPT：探针 → 门禁 → 冒烟 → 验收矩阵 → 开工。
- DeepSeek：没饭 → 讨饭 → 吃饭 → 偷饭 → 晕碳。
- Clawd：25 套完整原版动作。

这些是本地角色演出，不读取模型会话；Claude 的封禁印章不会影响任何账户。与 DSH 的真实任务状态触发不同，独立桌宠通过空闲轮换、点击和菜单互动。

## 从源码构建

需要 Node.js 22+、Rust，以及 [Tauri 系统构建依赖](https://v2.tauri.app/start/prerequisites/)。在仓库根目录：

```sh
cd desktop
npm ci
npm run check
npm test
npm run build:app
npm run smoke
npm run package
```

构建脚本读取仓库唯一一份 `assets/`、`assets-hd/` 和抱抱龙图标，生成物均被 Git 忽略。原生烟测真实启动应用，检查四角色 × 四档清晰度的非空画面，报告写入 `artifacts/`。

DSH 和 Codex 插件的安装方式见[主说明](../README.md)。独立桌宠不会修改两者的应用或内核。

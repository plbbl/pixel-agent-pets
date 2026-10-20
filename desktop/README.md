# 抱抱龙桌宠

macOS 和 Windows 的独立透明桌宠，使用系统 WebView。四个角色、66 套完整动作和经典演出都随应用打包，播放不需要联网。

从 [最新 Release](https://github.com/plbbl/pixel-agent-pets/releases/latest) 下载：

| 系统 | 安装包 |
|---|---|
| Apple Silicon Mac | `Pixel-Agent-Pets-macOS-arm64.dmg` |
| Intel Mac | `Pixel-Agent-Pets-macOS-x64.dmg` |
| Windows 64 位 | `Pixel-Agent-Pets-Windows-x64-setup.exe` |

macOS 打开 DMG 并拖入 Applications；Windows 运行安装程序。每个安装包旁附 SHA-256 校验文件。当前为社区构建，未使用商业开发者证书或 Apple 公证；系统可能要求确认来源。Windows 缺少 WebView2 时由安装程序引导安装系统运行环境。

默认自动跟随本机 Codex／DSH 的真实工作状态。右键或托盘的「跟随工作」可以指定来源，或关闭跟随进入自主模式。

单击摸摸，连续摸有不同反应；悬停停留会回应，拖动松手有落地反馈。久闲会休息，点击唤醒。空闲时自主演出，开始真实任务时工作状态优先；双击播放完整经典演出。

右键或托盘也能选择角色、单个动作、大小与清晰度、隐藏与退出。设置和位置自动保存在本机。

- Claude：完整中文彩蛋。
- GPT：探针 → 门禁 → 冒烟 → 验收矩阵 → 开工。
- DeepSeek：没饭 → 讨饭 → 吃饭 → 偷饭 → 晕碳。
- Clawd：25 套完整原版动作。

本地演出不会影响账户。Codex 通过只读任务事件投影状态，排除子代理；新中文输入仅用于生成布尔触发值。DSH 需要本项目新版插件提供公开状态事件，后台任务也能跟随；更新后等当前任务结束再正常重启网页服务，单刷新网页不够。

不保存聊天正文、工具参数、命令输出或凭据，不注册全局键盘监听，不控制模型任务。未连接来源时自主活动，不伪造工作状态。

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

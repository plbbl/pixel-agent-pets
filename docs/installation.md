# 安装、检查与卸载

## 一行命令

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash
```

按本机已有的东西安装：

| 找到 | 安装 |
|---|---|
| `~/.codex`（或 `$CODEX_HOME`） | Codex 宠物图集 |
| DSH 网页 profile（`~/.dsh` 或 `$DSH_HOME`） | DSH 完整动作插件 |
| 都没有（macOS） | 桌面版，装进“应用程序”并启动 |

下载的安装包都会先做 SHA-256 校验。缺 Node.js 22+ 时，安装器自带一份独立运行环境。

## 指定目标

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --codex
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --dsh --profile YOUR_PROFILE
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --desktop
```

- `--both`：Codex 和 DSH 都装。
- `--profile NAME`：有多个 DSH 网页 profile 时指定一个。
- `PIXEL_PETS_DSH_BIN=/path/to/dsh`：`dsh` 不在标准位置时使用。
- Windows 桌面版：下载 [`Pixel-Agent-Pets-Windows-x64-setup.exe`](https://github.com/plbbl/pixel-agent-pets/releases/latest/download/Pixel-Agent-Pets-Windows-x64-setup.exe) 运行即可。

## 装完以后

- **桌面版**：右键宠物或托盘图标，换角色、动作、大小、清晰度；「跟随工作」选自动、Codex、DSH 或关闭。双击播放完整剧情。
- **Codex**：`⌘,` → Mini 与虚拟宠物，刷新后选角色；大小在「外观」里调（80–224px）。
- **DSH**：重新打开网页窗口。右键宠物换角色、大小和清晰度；拖动可自由摆放，右键「重置位置 · 跟随输入框」回到输入框旁。DSH 更新插件后，等当前任务结束再重启网页服务。

## 检查与卸载

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- doctor --codex      # 或 --dsh / --desktop
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- uninstall --codex   # 或 --dsh / --desktop
```

卸载 Codex 宠物时，文件移到 `$CODEX_HOME/pixel-agent-pets-backups/`，需要时可以找回。

## 文件位置

- 安装器缓存：macOS `~/Library/Application Support/抱抱龙/Pets/`，Linux `~/.local/share/baobaolong-pets/`；可用 `PIXEL_PETS_INSTALL_HOME` 改。
- Codex 宠物：`$CODEX_HOME/pets/pixel-agent-*`。
- 桌面版：`/Applications/抱抱龙桌宠.app`（无写权限时为 `~/Applications`）。

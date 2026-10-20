# 安装、检查与恢复

**当前自动安装仅对 DSH 开放。Codex 原位完整播放器仍受 macOS 签名条件阻塞，暂不可自动安装。**

DSH 安装入口下载本项目已构建的 Release，校验压缩包和每个文件；无需克隆仓库、编译、安装 npm 依赖或为宠物填写 API Key。缺少 Node.js 22+ 时会缓存一个校验过的官方运行环境，不替换系统 Node。

## Codex：原位集成预览，自动安装暂不可用

原位完整播放器与接入源码已经完成，共享 DSH 的 `Player`、行为逻辑、66 套动作、字幕与右键显示控制；不增加悬浮窗口，不改 CLI、模型内核与提供方。

实际签名核验发现，临时本地签名的外层应用无法通过 macOS 的库验证，所需受认可签名条件尚未满足。安装入口会在修改应用前停止，不会关闭 Hardened Runtime、库验证或其他系统保护来强行安装。

源码接入按 **macOS Codex 26.1013.40934（20770）** 核验，播放器逐帧一致性、完整备份与恢复有自动测试。这些测试不等于可用的签名应用，也不等于真实原位运行已经通过验证。当前版本不提供可执行的 Codex 一键安装步骤，不把 9 状态图集或额外窗口作为替代成果。

未来原位安装仍以完整备份、已核验版本与可恢复展示层修改为前提；签名条件解决并完成实际运行验证后，才会开放安装入口。

## 官方 DSH 网页客户端

先安装并启动过[官方 DeepSeek Harness 网页版](https://github.com/deepseek-ai/deepseek-harness)，再运行：

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --dsh
```

安装器发现已有网页 profile：只有一个时自动选择，多个时询问。终端 TUI profile 无法显示网页插件；没有网页 profile 时先用官方 DSH 启动一次。安装后重新打开选择的网页窗口，右键宠物调整角色、大小和清晰度。

安装通过官方 DSH 插件命令进行，只添加本项目的依赖和 bundle。原配置先备份；已有损坏配置、缺失的其他插件或官方安装命令失败时停止并恢复配置，不顺便修补用户 profile。实际网页显示已核验于 **0.1.0-rc.6 web 客户端**。

默认遵循 `DSH_HOME`。需要明确选择时，在主命令后追加参数：

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --dsh --profile YOUR_PROFILE
```

`YOUR_PROFILE` 必须已存在。官方 `dsh` 不在标准位置时，可为安装器指定可执行文件：

```sh
export PIXEL_PETS_DSH_BIN=/absolute/path/to/dsh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- --dsh
```

## 检查

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- doctor --dsh
```

检查文件、版本、插件链接与启用状态，不启动模型任务，不更改配置。多个 DSH profile 仍会询问，也可追加 `--profile YOUR_PROFILE`。

## 恢复与卸载

```sh
curl -fsSL https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/install.sh | bash -s -- uninstall --dsh
```

DSH 只禁用并移除本插件，不卸载官方 DSH 或其他插件。Codex 原位安装目前没有开放；源码中保留完整备份与恢复逻辑，但不能将其描述成已经可用的应用安装。

安装包与恢复记录默认保存在：

- macOS：`~/Library/Application Support/抱抱龙/Pets/`。
- Linux（DSH）：`~/.local/share/baobaolong-pets/`，或 `$XDG_DATA_HOME/baobaolong-pets/`。

可通过 `PIXEL_PETS_INSTALL_HOME` 指定位置。请保留该目录中的备份与安装记录，直到确认不再需要恢复。

<details>
<summary>可选：旧的 9 状态兼容图集</summary>

这是素材导入方案，不接入完整播放器。由官方固定的 9 种状态播放精简帧，没有完整剧情字幕。可在[展示页兼容入口](https://plbbl.github.io/pixel-agent-pets/#native-install)选角色，然后到 Codex「Mini 与虚拟宠物」刷新选择。

从已准备好依赖的源码目录运行 `node scripts/cli.mjs install --codex` 也只安装兼容图集。旧独立 macOS 伴侣已归档，会创建额外窗口，不在当前安装流程中启动或推荐。

</details>

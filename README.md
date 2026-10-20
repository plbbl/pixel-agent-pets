# Pixel Agent Pets

四个小伙伴，适配 **Codex 桌面端原生宠物**和 **官方 DeepSeek Harness**：像素 Claude、纯白 GPT、DeepSeek，以及原版 Clawd。

- Codex：四套标准 v1 原生图集，由 Codex 自己根据任务状态触发动画。
- DSH：66 个完整动作，跟随思考、输出、工具调用、确认、结束与错误；右键切换角色。
- 本地运行，不需要 API Key，不发送模型请求，不改官方应用文件或模型内核。

[安装页面](https://plbbl.github.io/pixel-agent-pets/) · [下载最新版](https://github.com/plbbl/pixel-agent-pets/releases/latest) · [状态逻辑](docs/behavior.md)

## 安装

需要 Node.js 20+、npm。支持 macOS；脚本使用跨平台路径，其他平台请自行验证原生宠物入口。

```sh
git clone https://github.com/plbbl/pixel-agent-pets.git
cd pixel-agent-pets
npm ci
node scripts/cli.mjs install --codex
```

**Codex 显示位置：** `⌘,` 打开设置 → **Mini 与虚拟宠物 / Mini & Pets** → 宠物列表旁的圆形刷新箭头 → 选中角色。旧版本入口叫 **Pets**。只复制文件不会替你选择宠物；如果宠物隐藏，请打开该页面的显示开关。安装路径默认 `~/.codex/pets/`，自定义环境遵循 `CODEX_HOME`。

也可打开[安装页面](https://plbbl.github.io/pixel-agent-pets/)，点角色的原生安装链接，在 Codex 的安装预览中确认。此方式从 GitHub 下载该角色的 PNG，不运行第三方代码。

macOS 下载 ZIP 后也可在解压目录运行上述 `npm ci` 和安装命令，或双击 `Install-Codex.command`。

### 官方 DSH

先安装并启动过[官方 DSH](https://github.com/deepseek-ai/deepseek-harness)，在本仓库目录运行：

```sh
node scripts/cli.mjs install --dsh --profile web
```

关闭并重新启动这个 DSH profile。宠物出现在输入区附近；未进入会话时在窗口右下角。**右键**宠物切换四个角色，左键预览动作。选择会保存在当前浏览器本地。

安装器调用官方 `dsh plugin --profile web add`，再把插件追加到该 profile 的 bundle 列表；安装前备份原 package.json。不会改授权策略、模型配置、API Key 或已有插件。设置 `DSH_HOME` 可安装到其他 DSH 主目录；若 `dsh` 不在 PATH，用 `PIXEL_PETS_DSH_BIN=/absolute/path/to/dsh` 指定它。

已在官方 DSH **0.1.0-rc.6 web 客户端**实测。桌面包装器使用同一 web 客户端，可对它实际使用的 profile 安装，例如 `--profile desktop`；必须先存在该 profile。终端 TUI 不显示这个网页 UI 插件。

## 行为与限制

| 场景 | Codex 原生 | DSH 插件 |
|---|---|---|
| 空闲、拖动、打招呼、跳跃 | 官方交互驱动 | 空闲轮换与点击预览 |
| 任务运行 | 原生 `running`，思考/输出/工具共用 | 分别显示思考、输出和工具动作 |
| 等待确认、失败、结果待查看 | 独立原生状态 | 独立动作，确认优先 |
| 角色剧情、长思考、字幕 | 原生图集不支持这些触发器和字幕 | 完整动作与短字幕 |

Codex 原生协议是 **9 行、57 帧、1536×1872**，不能把几十个完整视频直接塞进去。这里提供经过固定比例、固定脚底线采样的原生版；没有注入脚本、读取聊天日志或伪造原生状态。`review` 指**任务完成且结果未读**，因此使用庆祝/准备就绪动作。

DSH 的 Claude 中文梗只由本地输入框的中文字符触发，并有冷却；它不识别国籍，也不封禁任何账户。所有字幕只是宠物演出，不进入提示词。完整原始动作与来源说明见 [NOTICE](NOTICE.md)。

## 性能

- DSH 完整 66 套透明图集总计不足 4 MiB；小画布通常 80 px，高 DPI 上限 2。
- 懒加载官方插件，解码后再切画；解码缓存最多两张且限制 10 MiB，隐藏页面立即停表并释放缓存。
- 状态选择器不订阅逐 token 文本；静止姿势不重复绘制。空闲每 15 秒一次动作，睡觉至少空闲 90 秒。
- 动作单向播放到停留姿势，不用倒放和缩放制造假补帧；透明像素硬 alpha，切换保留上一画面。
- 尊重系统“减少动态效果”。Codex 版的播放性能由官方原生渲染器负责。

## 预览、检查与卸载

```sh
npm run build
npm run preview              # http://127.0.0.1:19359，模拟状态，不调用模型
npm run doctor
npm run check
npm test

node scripts/cli.mjs uninstall --codex
node scripts/cli.mjs uninstall --dsh --profile web
```

Codex 卸载仅移动带本项目标记的四套宠物到可恢复备份目录，不删其他宠物。DSH 卸载仅禁用并移除本插件。安装器可重复运行，旧版本备份在各主目录的 `pixel-agent-pets-backups/`。

原版 Clawd 已附带本地适配资产。如需从自己安装的 Claude 桌面提取更新：

```sh
node scripts/cli.mjs import-clawd --source /Applications/Claude.app/Contents/Resources/app.asar
npm run build
```

导入器只解析允许的字面量，不执行安装包里的 JavaScript。

## English

Four local companions for Codex desktop's native pet protocol and official DeepSeek Harness. Run `npm ci`, then `node scripts/cli.mjs install --codex` or `node scripts/cli.mjs install --dsh --profile web`. Select a pet under **Settings → Mini & Pets** in Codex; restart the selected DSH profile and right-click its companion to switch. Native Codex supports nine fixed animation states; DSH preserves all 66 animations and local captions. No API key, model requests, application patching, or model-kernel changes.

Code is MIT. Third-party artwork and trademarks are excluded from that grant; see [NOTICE](NOTICE.md). This is an independent fan project, not affiliated with OpenAI, Anthropic, or DeepSeek.

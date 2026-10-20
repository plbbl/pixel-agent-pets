# 安装与恢复

主入口见 [README](../README.md)。完整模式是 macOS 原生 App；DSH 模式是官方客户端插件；原生兼容模式是固定图集。三者可以独立安装和卸载。

## 完整动作 App

下载 Release 的 `Pixel-Agent-Pets-macOS.zip`，解压并打开 App，或从源码运行：

```sh
npm ci
node scripts/cli.mjs install --codex-full
```

安装到 `~/Applications/Pixel Agent Pets.app`。旧的本项目 App 备份在 `~/Library/Application Support/Pixel Agent Pets/backups/`。不会覆盖同名但不属于本项目的应用。App 自身保存角色和位置；不会自动加入登录启动项。

退出 App 后卸载：

```sh
node scripts/cli.mjs uninstall --codex-full
```

App 会移入备份目录。要恢复，可以手动把备份 `.app` 移回 Applications。macOS 若要求打开确认，需要用户在系统界面中完成；安装器不关闭系统安全检查。

## DSH 配置

```sh
node scripts/cli.mjs install --dsh --profile web
```

遵循 `DSH_HOME`，默认 `~/.dsh`。需要 profile 已存在；通过官方 `dsh plugin --profile web add` 链接本项目，再追加自己的 bundle。安装前备份 package.json，不改 `cordis.patch.yml`、授权规则、已有插件或密钥。

`dsh` 不在 PATH 时：

```sh
PIXEL_PETS_DSH_BIN=/absolute/path/to/dsh node scripts/cli.mjs install --dsh --profile web
```

安装后重新打开对应 profile。其他 profile 可使用 `--profile NAME`，它必须真实存在。

## 原生兼容图集

```sh
node scripts/cli.mjs install --codex
```

遵循 `CODEX_HOME`，默认 `~/.codex`。仅管理 `pets/pixel-agent-*` 中带本项目标记的文件，更新前移动旧版本到 `pixel-agent-pets-backups/`。不会选择或隐藏官方宠物，需要在“Mini 与虚拟宠物”页面刷新并选择。

```sh
node scripts/cli.mjs uninstall --codex
node scripts/cli.mjs uninstall --dsh --profile web
```

## 检查

`npm run doctor` 检查原生文件和 DSH bundle。完整模式可以从菜单栏爪印显示宠物；没有动作时先确认 Codex 本机会话正在运行。远程云端会话若未写入本机活动记录，完整伴侣无法观察。

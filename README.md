# 千星点歌监控 Yunzai 插件

这是 Miliastra Wonderland Music 的配套 Yunzai 监控插件。除启动原神、进入千星和结构化海龟汤题目提交外，插件只查询 HTTP API，不提供聊天发送、点歌、播放控制、队列修改或监听模式切换能力。

## 安装

在 Yunzai 根目录执行：

```bash
git clone https://github.com/XingNian-www/miliastra-music-yunzai-plugin.git ./plugins/miliastra-music-yunzai-plugin
```

然后重启 Yunzai。

要求 Yunzai 使用 Node.js 18 或更新版本。

## 配置

插件首次加载时会根据 `config/default.js` 自动生成本地配置 `config/config.js`。首次重启 Yunzai 后，直接编辑生成的文件：

```js
export default {
  configVersion: 1,
  requestTimeoutMs: 5000,
  queuePreviewLimit: 5,
  screenshotQuality: 88,
  accessToken: "",
  turtleSoupAi: {
    enabled: true,
    endpoint: "https://api.deepseek.com/chat/completions",
    apiKey: "你的 API Key",
    model: "deepseek-chat",
    timeoutMs: 30000,
    maxTokens: 1200
  },
  backends: [
    {
      key: "A",
      name: "1号千星",
      baseUrl: "http://127.0.0.1:18888",
      accessToken: ""
    },
    {
      key: "B",
      name: "2号千星",
      baseUrl: "http://127.0.0.1:18889",
      accessToken: ""
    }
  ]
}
```

`config/config.js` 已加入 `.gitignore`，插件更新时不会被 `git pull` 覆盖。`config/default.js` 是插件跟踪的配置结构，请只修改自动生成的 `config/config.js`。

每次加载时，插件会检查 `configVersion`。升级后的默认配置存在新增字段时，插件会自动补入本地配置并原子写回；已有后端、地址、访问令牌、AI 密钥和未知扩展字段都会保留，每个自定义后端也会补齐新增的后端字段。配置版本高于当前插件时只读取、不降级或覆盖。

本地配置按普通数据对象管理，只支持 `export default { ... }` 对象字面量。为避免迁移时执行代码或把环境变量密钥固化到文件，`process.env`、import、函数、getter 和其他运行逻辑会被拒绝。发生生成或迁移时会规范化写回，手写注释不保证保留。

如果 `config/config.js` 存在语法错误或 default export 不是对象，插件会停止加载并报告错误，不会覆盖原文件。不要手动修改 `configVersion`。

如果 Miliastra Wonderland Music 配置了 `http.access_token`，需要把同一个值填到对应后端的 `accessToken`。多个后端令牌相同也可以只填顶层 `accessToken`，后端未单独配置时会继承它。

`key` 会用于命令里的后端选择，例如 `#千星A状态`。不要把后端 key 配成 `状态`、`监控`、`队列`、`健康`、`海龟汤状态`、`卧底状态`、`启动原神`、`进入千星`、`截图` 或 `列表`。

旧版本没有 `configVersion` 的配置会被识别为 v0，并在首次加载新版插件时自动迁移到 v1。

## 命令

不指定后端时：

```text
#千星状态
#千星监控
#千星队列
#千星健康
#千星海龟汤状态
#千星卧底状态
#千星启动原神
#千星进入千星
#千星截图
#千星海龟汤 标题、汤面和汤底原始内容
#千星列表
#千星帮助
```

`#千星状态` 会同时请求所有后端并合并状态和队列。

`#千星海龟汤状态` 会读取当前阶段、题目标题、参与人数、提问数和待处理 AI 数量，不返回汤底。`#千星卧底状态` 会读取脱敏的阶段、模式、轮次、进度和玩家存活状态，不返回词语、身份、描述或投票。

`#千星海龟汤 <原始内容>` 会先用插件配置的 OpenAI 兼容 AI 整理标题、汤面、汤底和裁决备注，再选择一个后端串行保存。主程序只接收整理后的结构化内容，不执行 AI 优化；未启用或未完整配置 `turtleSoupAi` 时提交会被拒绝。

`#千星监控` 会读取播放控制器、运行状态、音乐队列、正式任务生命周期、聊天监听、海龟汤和脱敏卧底状态。后端仍只有旧版 `pendingTasks` 时，插件会自动回退到旧任务标签。`#千星启动原神` 和 `#千星进入千星` 始终会先显示后端状态，并要求回复数字确认一个后端；`#千星截图` 仅在配置多个后端时要求选择。

插件仅允许只读访问 `/status`、`/monitor`、`/queue`、`/health`、`/screenshot`、`/turtle-soup` 和 `/undercover`。写接口白名单只有 `/startup/game`、`/startup/enter-wonderland` 和结构化题目提交 `/turtle-soup/questions`，其他会影响游戏的接口全部被插件拒绝。

指定后端时：

```text
#千星A状态
#千星A监控
#千星A队列
#千星A健康
#千星A海龟汤状态
#千星A卧底状态
#千星A启动原神
#千星A进入千星
#千星A截图
#千星A海龟汤 标题、汤面和汤底原始内容
```

这些命令只请求 A 后端。

后端离线或接口异常时，插件会回复 `千星机器人未在线或接口不可用`。

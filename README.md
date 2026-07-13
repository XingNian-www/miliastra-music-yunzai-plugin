# 千星点歌监控 Yunzai 插件

这是 Miliastra Wonderland Music 的配套 Yunzai 监控插件。除启动原神、进入千星和经过私聊确认的结构化海龟汤题目提交外，插件只查询 HTTP API，不提供聊天发送、点歌、播放控制、队列修改或监听模式切换能力。

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
  configVersion: 2,
  requestTimeoutMs: 5000,
  queuePreviewLimit: 5,
  screenshotQuality: 88,
  accessToken: "",
  turtleSoupAi: {
    endpoint: "https://api.openai.com/v1/responses",
    apiKey: "你的 API Key",
    model: "gpt-5.6",
    reasoningEffort: "medium",
    verbosity: "high",
    maxOutputTokens: 16384,
    timeoutMs: 180000,
    systemPrompt: "首次生成配置时会写入完整默认提示词"
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

`turtleSoupAi.endpoint` 是完整请求地址，可以改为代理或自建网关，但目标必须兼容 OpenAI Responses API 和 `text.format` 严格 JSON Schema。插件不会自动回退到 Chat Completions。默认提示词的可读版本位于 `lib/turtle-soup-prompt.js`，首次生成或迁移配置时会完整写入 `systemPrompt`，之后可在本地配置中覆盖。

每次加载时，插件会检查 `configVersion`。升级后的默认配置存在新增字段时，插件会自动补入本地配置并原子写回；已有后端、地址、访问令牌、AI 密钥和未知扩展字段都会保留，每个自定义后端也会补齐新增的后端字段。配置版本高于当前插件时只读取、不降级或覆盖。

本地配置按普通数据对象管理，只支持 `export default { ... }` 对象字面量。为避免迁移时执行代码或把环境变量密钥固化到文件，`process.env`、import、函数、getter 和其他运行逻辑会被拒绝。发生生成或迁移时会规范化写回，手写注释不保证保留。

如果 `config/config.js` 存在语法错误或 default export 不是对象，插件会停止加载并报告错误，不会覆盖原文件。不要手动修改 `configVersion`。

如果 Miliastra Wonderland Music 配置了 `http.access_token`，需要把同一个值填到对应后端的 `accessToken`。多个后端令牌相同也可以只填顶层 `accessToken`，后端未单独配置时会继承它。

`key` 会用于命令里的后端选择，例如 `#千星A状态`。不要把后端 key 配成 `状态`、`监控`、`队列`、`健康`、`海龟汤状态`、`卧底状态`、`启动原神`、`进入千星`、`截图` 或 `列表`。

旧版本没有 `configVersion` 的配置会被识别为 v0，并逐步迁移到当前版本。v1 升级到 v2 时，`maxTokens` 会迁移为 `maxOutputTokens`，废弃的 AI `enabled` 字段会移除。未配置密钥且仍使用旧版默认 DeepSeek 地址时会更新为 OpenAI 默认值；已经配置密钥或自定义地址时会原样保留，避免把第三方密钥发送到其他服务。保留下来的端点如果只支持 Chat Completions，需要手动改为兼容 Responses API 的地址。

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
#千星列表
#千星帮助
```

`#千星状态` 会同时请求所有后端并合并状态和队列。

`#千星海龟汤状态` 会读取当前阶段、题目标题、参与人数、提问数和待处理 AI 数量，不返回汤底。`#千星卧底状态` 会读取脱敏的阶段、模式、轮次、进度和玩家存活状态，不返回词语、身份、描述或投票。

海龟汤投稿仅允许私聊。群聊触发投稿、调整、确认或取消命令时，只回复 `海龟汤投稿仅支持私聊`，不会回显投稿内容，也不会调用 AI 或后端 API。

首次投稿：

```text
#千星海龟汤投稿 标题、汤面和汤底原始内容
#千星A海龟汤投稿 标题、汤面和汤底原始内容
```

初稿中可以用独立行添加可选目标：

```text
难度：高
风格：现实因果
```

未指定后端且配置了多个后端时，插件会先显示各后端状态并要求回复数字。确定后端后，插件通过配置的 OpenAI Responses API 生成标题、汤面、汤底和完整裁决备注，只向投稿者显示预览，不立即写入题库。预览不会显示 `enabled`，最终提交固定使用 `enabled: true`。

预览操作：

```text
#千星确认投稿
#千星调整投稿 缩短汤面并补全时间线
#千星取消投稿
```

每位用户同时只有一份待确认预览，新投稿会替换旧投稿。预览有效期为 10 分钟，每份投稿最多成功调整 10 次；AI 调整失败不计次数。同一用户正在调用 AI 或后端 API 时，新的投稿、调整、确认和取消会被拒绝。

确认投稿后才会调用后端 `/turtle-soup/questions`。请求固定只包含 `title`、`surface`、`bottom`、`adjudicationNotes` 和 `enabled: true`，不会发送客户端 ID。首次请求遇到 HTTP 错误、网络错误或超时时会自动重试一次，第二次仍失败则直接报错并保留原预览到原到期时间。由于后端尚无幂等键，响应丢失后重试存在极小的重复投稿风险。

`#千星监控` 会读取播放控制器、运行状态、音乐队列、正式任务生命周期、聊天监听、海龟汤和脱敏卧底状态。后端仍只有旧版 `pendingTasks` 时，插件会自动回退到旧任务标签。`#千星启动原神` 和 `#千星进入千星` 始终会先显示后端状态，并要求回复数字确认一个后端；`#千星截图` 仅在配置多个后端时要求选择。

插件仅允许只读访问 `/status`、`/monitor`、`/queue`、`/health`、`/screenshot`、`/turtle-soup` 和 `/undercover`。写接口只有 `/startup/game`、`/startup/enter-wonderland`，以及专用投稿客户端在确认后访问的 `/turtle-soup/questions`；其他会影响游戏的接口全部被插件拒绝。

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
#千星A海龟汤投稿 标题、汤面和汤底原始内容
```

这些命令只请求 A 后端。

后端离线或接口异常时，插件会回复 `千星机器人未在线或接口不可用`。

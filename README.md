# 千星点歌监控 Yunzai 插件

这是 Miliastra Wonderland Music 的配套 Yunzai 插件。它提供监控、受控启动、QQ 代发言和经过私聊确认的结构化海龟汤题目提交；不提供点歌、播放控制、队列修改或监听模式切换能力。

## 安装

在 Yunzai 根目录执行：

```bash
git clone https://github.com/XingNian-www/miliastra-music-yunzai-plugin.git ./plugins/miliastra-music-yunzai-plugin
cd ./plugins/miliastra-music-yunzai-plugin
pnpm install
```

然后重启 Yunzai。

要求 Yunzai 使用 Node.js 18 或更新版本。

插件使用官方 OpenAI Node SDK，并通过 `https-proxy-agent` 支持可选的 AI HTTP 代理；两者都会由上述 `pnpm install` 安装。

## 配置

插件首次加载时会根据 `config/default.js` 自动生成本地配置 `config/config.js`。首次重启 Yunzai 后，直接编辑生成的文件：

```js
export default {
  configVersion: 3,
  requestTimeoutMs: 5000,
  queuePreviewLimit: 5,
  screenshotQuality: 88,
  accessToken: "",
  turtleSoupAi: {
    endpoint: "https://api.openai.com/v1/responses",
    proxyUrl: "",
    apiKey: "你的 API Key",
    model: "gpt-5.6",
    reasoningEffort: "max",
    verbosity: "high",
    extraBody: {},
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

`turtleSoupAi.endpoint` 是以 `/responses` 结尾的完整请求地址，可以改为代理或自建网关，也可以带网关要求的查询参数，但同一个查询参数名不能重复；OpenAI SDK 无法通过 `defaultQuery` 无损表达重复键，插件会在发送前明确拒绝这类地址，避免静默改变请求。目标必须兼容 OpenAI Responses API 和 `text.format` 严格 JSON Schema。插件不会自动回退到 Chat Completions，也不会自动重试失败的 AI 请求。默认提示词的可读版本位于 `lib/turtle-soup-prompt.js`，首次生成配置时会完整写入 `systemPrompt`，之后可在本地配置中覆盖。

`turtleSoupAi.extraBody` 默认是空对象，用于向兼容网关传递标准请求体之外的第三方扩展字段。插件会先展开 `extraBody`，再写入自身使用的 OpenAI Responses 标准字段，因此 `model`、`instructions`、`input`、`reasoning`、`text`、`max_output_tokens`、`store` 和 `stream` 等冲突项始终以插件标准值为准。该配置只能是安全、可序列化的普通 JSON 对象，不能把数组、`null` 或带自定义原型的对象用作顶层值。`extraBody` 内允许任意普通 JSON 字段；它以外的配置不允许未知字段。

自定义 `systemPrompt` 时必须要求模型返回 `title`、`surface`、`bottom`、`adjudicationNotes` 和 `logicReview`。插件会原样使用当前配置中的自定义提示词，不会自动改写其中的输出约定。

`turtleSoupAi.proxyUrl` 只代理 AI 请求，不影响千星后端 API。留空表示直连；HTTP 代理示例为 `http://127.0.0.1:7890`，需要认证时可使用 `http://用户名:密码@代理地址:端口`。同时接受 HTTPS 代理地址，不支持 SOCKS。

每次加载时，插件都会严格检查 `configVersion`、全部必需字段、字段类型和未知字段。已有文件必须与当前 `config/default.js` 使用相同版本和完整结构；旧版本、未来版本、缺失字段及未知字段都会直接报错，插件不会迁移、补默认值或改写已有文件。自定义后端可以自由增删，但每个后端必须完整包含当前后端结构中的字段。

修改 `config/config.js` 后发送 `#千星重载配置` 即可在不重启 Yunzai 的情况下生效。重载会先完整读取并严格校验新配置，再原地替换运行时配置；读取失败时会回复错误并继续使用上一次有效配置。

本地配置按普通数据对象管理，只支持 `export default { ... }` 对象字面量。为避免加载配置时执行代码或意外展开环境变量密钥，`process.env`、import、函数、getter 和其他运行逻辑会被拒绝。只有文件不存在时插件才会生成并写入完整配置；已有文件通过校验后保持原文和注释不变。

如果 `config/config.js` 存在语法错误或 default export 不是对象，插件会停止加载并报告错误，不会覆盖原文件。不要手动修改 `configVersion`。

如果 Miliastra Wonderland Music 配置了 `http.access_token`，需要把同一个值填到对应后端的 `accessToken`。多个后端令牌相同也可以只填顶层 `accessToken`，后端未单独配置时会继承它。

`key` 会用于命令里的后端选择，例如 `#千星A状态`。不要把后端 key 配成 `状态`、`监控`、`队列`、`健康`、`海龟汤状态`、`卧底状态`、`启动原神`、`进入千星`、`截图`、`列表` 或 `重载配置`。

旧配置不会自动迁移。升级插件后如果配置结构发生变化，请先备份密钥、地址和自定义提示词，再以新的 `config/default.js` 或首次生成的 `config/config.js` 为模板手工填写当前配置。

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
#千星重载配置
#千星帮助
```

`#千星状态` 会同时请求所有后端并合并状态和队列。

`#千星海龟汤状态` 会读取当前阶段、题目标题、参与人数、提问数和待处理 AI 数量，不返回汤底。`#千星卧底状态` 会读取脱敏的阶段、模式、轮次、进度和玩家存活状态，不返回词语、身份、描述或投票。

## QQ 代发言

普通用户发送 `!内容` 或 `！内容` 可以把内容加入游戏内发言队列，触发符不区分全角和半角。首次发送会显示各后端状态并要求回复数字；选择成功且发言入队后，插件会在内存中为该 QQ 用户记住后端 1 小时。同一用户在不同 QQ 群继续发言时会复用该选择，插件重启或配置热重载后记忆清空。

```text
!你好
#发言
```

`#发言` 会清除当前用户记住的后端并重新要求选择。最终游戏内文本默认为 `[QQ号]:内容`，前缀和正文之间不添加空格；输入中的换行会折叠为空格，确保整条游戏发言只使用一个可追溯前缀。代发言通过后端 `/chat/send` 正式任务队列执行，回复会包含任务编号和队列位置。

BOT 管理员可以为 QQ 号设置持久昵称：

```text
#发言昵称 123456789 昵称
#发言昵称删除 123456789
#发言昵称列表
```

设置后该用户的游戏内文本改为 `[昵称]:内容`。昵称映射单独原子写入 `config/chat-aliases.json`，不写入主配置，不会被 `git pull` 覆盖；昵称不能包含方括号、冒号或控制字符。普通用户无权使用昵称管理命令。

海龟汤投稿仅允许私聊。群聊触发投稿、调整、确认或取消命令时，只回复 `海龟汤投稿仅支持私聊`，不会回显投稿内容，也不会调用 AI 或后端 API。

首次投稿：

```text
#千星海龟汤投稿 标题、汤面和汤底原始内容
```

投稿可以换行，但命令和全部正文必须放在同一条私聊消息中，例如：

```text
#千星海龟汤投稿
标题：消失的灯
汤面：男人关灯后，远处发生了事故。
汤底：男人是灯塔管理员，关闭航标灯导致船只失去指引。
难度：中
风格：现实因果
```

初稿中可以用独立行添加可选目标：

```text
难度：高
风格：现实因果
```

首次投稿不会选择或请求千星后端。插件先通过配置的 OpenAI Responses API 完成 AI 审查，提取标题、汤面和汤底，重点生成完整裁决备注，并单独显示潜在逻辑漏洞。默认审查不会为了修补漏洞而改写投稿者的汤面或汤底；漏洞只在预览的“逻辑审查”中报告，不写入题库。

调整阶段除提示注入外会无条件执行投稿者的最新修改要求，即使修改可能降低题目质量，也只会在逻辑审查中提醒。未要求修改汤底时保持原文；明确要求修改汤底时，在满足要求后尽量控制在 240 个中文字符以内。要求忽略系统规则、泄露提示词、调用工具、输出无关内容或把审稿功能当作通用 AI 使用的内容会被视为提示注入而不执行。

预览不会显示 `enabled`，最终提交固定使用 `enabled: true`。投稿命令不支持预先指定后端。

预览操作：

```text
#千星确认投稿
#千星调整投稿 缩短汤面并补全时间线
#千星取消投稿
```

每位用户同时只有一份待确认预览，新投稿会替换旧投稿。预览有效期为 10 分钟，每份投稿最多成功调整 10 次；AI 调整失败不计次数。同一用户正在调用 AI 或后端 API 时，新的投稿、调整、确认和取消会被拒绝。

发送 `#千星确认投稿` 后才选择最终提交后端：只配置一个后端时直接提交；配置多个后端时，插件先显示各后端状态并要求回复数字。选择完成后才会调用对应后端的 `/turtle-soup/questions`。最终 JSON 会把汤面写为 `此题由用户名提供:汤面内容`，署名由插件从 Yunzai 消息事件读取，不交给 AI 生成。请求固定只包含 `title`、`surface`、`bottom`、`adjudicationNotes` 和 `enabled: true`，不会发送客户端 ID。首次请求遇到 HTTP 错误、网络错误或超时时会自动重试一次，第二次仍失败则直接报错并保留原预览到原到期时间。由于后端尚无幂等键，响应丢失后重试存在极小的重复投稿风险。

`#千星监控` 会读取播放控制器、运行状态、音乐队列、正式任务生命周期、聊天监听、海龟汤和脱敏卧底状态。后端仍只有旧版 `pendingTasks` 时，插件会自动回退到旧任务标签。`#千星启动原神` 和 `#千星进入千星` 始终会先显示后端状态，并要求回复数字确认一个后端；`#千星截图` 仅在配置多个后端时要求选择。

插件仅允许只读访问 `/status`、`/monitor`、`/queue`、`/health`、`/screenshot`、`/turtle-soup` 和 `/undercover`。写接口只有 `/startup/game`、`/startup/enter-wonderland`、QQ 代发言使用的 `/chat/send`，以及专用投稿客户端在确认后访问的 `/turtle-soup/questions`；其他会影响游戏的接口全部被插件拒绝。

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
```

这些命令只请求 A 后端。

后端离线或接口异常时，插件会回复 `千星机器人未在线或接口不可用`。

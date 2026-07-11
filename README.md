# 千星点歌监控 Yunzai 插件

这是 Miliastra Wonderland Music 的配套 Yunzai 只读监控插件。插件只查询 HTTP API，不提供启动、聊天发送、点歌、播放控制、队列修改或监听模式切换能力。

## 安装

在 Yunzai 根目录执行：

```bash
git clone https://github.com/XingNian-www/miliastra-music-yunzai-plugin.git ./plugins/miliastra-music-yunzai-plugin
```

然后重启 Yunzai。

要求 Yunzai 使用 Node.js 18 或更新版本。

## 配置

插件自带默认配置 `config/default.js`。需要修改后端地址时，复制示例配置为本地配置：

```bash
cp config/config.example.js config/config.js
```

然后编辑 `config/config.js`：

```js
export default {
  requestTimeoutMs: 5000,
  queuePreviewLimit: 5,
  screenshotQuality: 88,
  accessToken: "",
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

`config/config.js` 已加入 `.gitignore`，插件更新时不会被 `git pull` 覆盖。更新只会改动默认配置和示例配置。

如果 Miliastra Wonderland Music 配置了 `http.access_token`，需要把同一个值填到对应后端的 `accessToken`。多个后端令牌相同也可以只填顶层 `accessToken`，后端未单独配置时会继承它。

`key` 会用于命令里的后端选择，例如 `#千星A状态`。不要把后端 key 配成 `状态`、`监控`、`队列`、`健康`、`截图` 或 `列表`。

从旧版本更新且已经改过 `config/config.js` 时，先备份自己的配置，再更新插件，最后把配置放回去：

```bash
cp config/config.js /tmp/miliastra-music-config.js
git checkout -- config/config.js
git pull
cp /tmp/miliastra-music-config.js config/config.js
```

## 命令

不指定后端时：

```text
#千星状态
#千星监控
#千星队列
#千星健康
#千星截图
#千星列表
#千星帮助
```

`#千星状态` 会同时请求所有后端并合并状态和队列。

`#千星监控` 会读取播放控制器、音乐队列、待执行任务和聊天监听状态。`#千星截图` 会先显示所有后端状态，并要求回复数字选择一个后端。

插件仅允许访问 `/status`、`/monitor`、`/queue`、`/health` 和 `/screenshot`，所有请求固定使用 `GET`，不会向后端提交会影响游戏的操作。

指定后端时：

```text
#千星A状态
#千星A监控
#千星A队列
#千星A健康
#千星A截图
```

这些命令只请求 A 后端。

后端离线或接口异常时，插件会回复 `千星机器人未在线或接口不可用`。

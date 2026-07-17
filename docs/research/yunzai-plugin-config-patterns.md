# Yunzai / TRSS-Yunzai 插件配置生命周期调研

调研日期：2026-07-13。结论基于下列仓库的固定提交；链接均指向不可漂移的 commit，而非分支最新版本。

## 结论摘要

成熟插件最常见的结构是“仓库跟踪默认配置，运行时创建并忽略用户配置，读取时合并两者”。这能让 `git pull` 更新默认值而不覆盖用户文件。样本中，锅巴插件的实现最完整：首次复制 YAML、递归合并新增默认项、忽略用户目录，并在首次启动生成 JWT secret。TRSS-Yunzai 官方 helper 还会把合并结果写回用户 YAML。

但本次核验的三个插件都没有完整的 `configVersion` + 有序迁移框架，也都直接使用 `writeFile` / `writeFileSync` 写配置，没有“同目录临时文件 + 替换”的安全写入流程。因此这些部分应吸收其分层思路，但不能原样照搬。

## 已核验实现

### 1. guoba-plugin

- 仓库：[guoba-yunzai/guoba-plugin](https://github.com/guoba-yunzai/guoba-plugin/tree/eab9cb27c0a4af105307568a84fee33ba6413b95)，commit `eab9cb27c0a4af105307568a84fee33ba6413b95`。
- [`utils/cfg.js`](https://github.com/guoba-yunzai/guoba-plugin/blob/eab9cb27c0a4af105307568a84fee33ba6413b95/utils/cfg.js)：若 `config/application.yaml` 不存在，创建目录并从 `defSet/application.yaml` 复制；随后用 `lodash.merge({}, defaults, user)` 递归合并，因此升级后新增的对象字段会在运行时出现。首次初始化还生成随机 `jwt.secret`，不会把真实 secret 放进默认文件。
- [`.gitignore`](https://github.com/guoba-yunzai/guoba-plugin/blob/eab9cb27c0a4af105307568a84fee33ba6413b95/.gitignore) 忽略 `/config/*`，所以用户配置与 secret 不参与 `git pull`。
- [`framework/src/components/YamlReader.js`](https://github.com/guoba-yunzai/guoba-plugin/blob/eab9cb27c0a4af105307568a84fee33ba6413b95/framework/src/components/YamlReader.js) 使用 `YAML.parseDocument` 保留注释，但保存时直接 `fs.writeFileSync`，不是安全替换写入。
- 局限：首次复制的是完整默认配置，之后默认值的“修改”会被旧用户值压住；这是合理的保守策略，但需要显式迁移才能改变已有配置语义。未发现配置版本字段或字段重命名迁移。

### 2. miao-plugin

- 仓库：[yoimiya-kokomi/miao-plugin](https://github.com/yoimiya-kokomi/miao-plugin/tree/f80f831658659baf406a79bbbdcf789fefb7ea0b)，commit `f80f831658659baf406a79bbbdcf789fefb7ea0b`。
- [`components/cfg/CfgData.js`](https://github.com/yoimiya-kokomi/miao-plugin/blob/f80f831658659baf406a79bbbdcf789fefb7ea0b/components/cfg/CfgData.js)：从受版本控制的 `config/system/cfg_system.js` schema 读取默认值，把用户缺失项补齐，再生成 `config/cfg.js`。因此首载会生成用户配置，schema 新增项也会在升级后补入。
- [`components/Cfg.js`](https://github.com/yoimiya-kokomi/miao-plugin/blob/f80f831658659baf406a79bbbdcf789fefb7ea0b/components/Cfg.js) 在模块加载时执行“读取 -> 补默认值 -> 保存”，设置配置时也立即重写生成文件。
- [`.gitignore`](https://github.com/yoimiya-kokomi/miao-plugin/blob/f80f831658659baf406a79bbbdcf789fefb7ea0b/.gitignore) 忽略 `/config/cfg.js`，用户值可跨 git 更新保留。
- 取舍：JS 配置便于导入，但它本质上是可执行代码；该插件通过 schema 生成器限制文件形状。写入仍是直接 `writeFileSync`，未发现配置版本或重命名迁移。

### 3. xiaoyao-cvs-plugin

- 仓库：[ctrlcvs/xiaoyao-cvs-plugin](https://github.com/ctrlcvs/xiaoyao-cvs-plugin/tree/e7ab3e8b276a11680beb47d0c5517f6e0a4c2022)，commit `e7ab3e8b276a11680beb47d0c5517f6e0a4c2022`。
- [`model/gsCfg.js`](https://github.com/ctrlcvs/xiaoyao-cvs-plugin/blob/e7ab3e8b276a11680beb47d0c5517f6e0a4c2022/model/gsCfg.js)：首次读取时从 `defSet/config/config.yaml` 复制到 `config/config.yaml`，之后只读取用户文件。
- [`.gitignore`](https://github.com/ctrlcvs/xiaoyao-cvs-plugin/blob/e7ab3e8b276a11680beb47d0c5517f6e0a4c2022/.gitignore) 忽略运行数据，但没有忽略 `config/`。因此其首载复制模式虽能避免更新直接覆盖未跟踪文件，却仍可能让用户配置出现在 `git status` 并被误提交。
- 局限：未见默认配置与已有用户配置的合并，所以同一 YAML 文件新增字段不会自动进入旧配置；未见版本迁移。配置和凭据数据的写入均为直接 `writeFileSync`。

## TRSS-Yunzai 官方基线

- 官方仓库：[TimeRainStarSky/Yunzai](https://github.com/TimeRainStarSky/Yunzai/tree/a3d75d5dd28af6e36d7b697d061038df53c8b78f)，commit `a3d75d5dd28af6e36d7b697d061038df53c8b78f`。
- [`lib/plugins/config.js`](https://github.com/TimeRainStarSky/Yunzai/blob/a3d75d5dd28af6e36d7b697d061038df53c8b78f/lib/plugins/config.js) 是最直接的插件开发参考：读取 YAML，将用户值递归合并进调用方提供的默认对象；文件缺失或合并结果变化时写回完整 YAML；支持 watch 和不可被用户覆盖的 `keep`。它同样直接 `fs.writeFile`，没有临时文件替换。
- [`lib/config/config.js`](https://github.com/TimeRainStarSky/Yunzai/blob/a3d75d5dd28af6e36d7b697d061038df53c8b78f/lib/config/config.js) 首载复制 `default_config/`，已有目录则补复制缺失文件；同时兼容旧 `masterQQ` / `master` 与新 `masterQQs` / `masters`。这是字段重命名兼容的真实案例，但迁移只发生在内存中，没有版本号、删除旧字段或持久化升级。
- [`.gitignore`](https://github.com/TimeRainStarSky/Yunzai/blob/a3d75d5dd28af6e36d7b697d061038df53c8b78f/.gitignore) 仅跟踪 `config/default_config`，忽略实际 `config`，明确分开仓库默认值与用户状态。

## 本插件采用的当前方案

上述样本说明“默认配置 + 用户配置”分层很常见，但自动合并和跨版本迁移会让运行时长期背负旧结构。当前项目已经明确不保留内部配置兼容，因此本插件只吸收首次生成、安全解析和原子写入能力，不采用默认值合并或版本迁移。

- `config/default.js` 是唯一受版本控制的当前结构，密钥和令牌默认留空；`config/config.js` 被忽略。
- 用户文件不存在时，插件根据当前默认配置在同目录临时文件中生成完整配置，再以 rename 原子落盘。
- 用户文件已经存在时，`configVersion` 必须与当前版本完全一致；全部字段必须存在且类型匹配，未知字段会被拒绝。
- `turtleSoupAi.extraBody` 是唯一开放对象，用来保存第三方网关扩展；其他位置都执行封闭结构校验。
- 自定义后端可以增删，但每项必须符合当前后端结构，不会从默认后端补字段。
- 插件不会迁移旧版本、接受未来版本、合并默认值或改写已有文件。升级后由维护者以当前模板手工整理配置。
- 本地 JS 仍由严格数据解析器读取，只接受 `export default` 的普通数据；函数、环境变量表达式、import、getter 和其他可执行内容不会运行。
- 重载先完整解析和校验，成功后才原地替换运行时对象；失败时继续使用上一次有效配置。

对应测试覆盖首次生成、版本不一致、缺失字段、未知字段、类型错误、开放 `extraBody`、自定义后端、原文不改写、失败重载保留旧配置及可执行表达式拒绝。

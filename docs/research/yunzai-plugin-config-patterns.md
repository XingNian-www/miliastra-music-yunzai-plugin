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

## 对本插件的建议

调研开始时，本插件采用“跟踪 `config/default.js` 与 `config/config.example.js`、忽略 `config/config.js`、运行时递归合并”的方案，方向正确，但仍缺少自动生成和持久迁移。建议按以下顺序完善：

1. **改为数据型 YAML。** 跟踪 `config/default.yaml`（所有 token/key 均为空）并忽略 `config/config.yaml`；本配置没有函数需求，YAML 比动态 `import()` JS 更易校验、迁移和安全写回，也符合 Guoba/TRSS 的主流接口。若暂不改格式，也应继续把用户 JS 视为不可信可执行代码。
2. **首载自动创建。** 用户文件不存在时从默认值生成；创建前确保目录存在。启动不应再要求手工 `cp`。
3. **每次加载执行固定流水线：** 解析用户文件 -> 校验对象形状 -> 按版本迁移 -> `deepMerge(defaults, migratedUser)` -> 校验最终值 -> 仅在发生创建/迁移/补键时写回。对象递归合并，数组整体替换，避免按索引混合 `backends`。
4. **加入顶层 `configVersion`。** 使用连续整数和有序迁移函数。字段重命名时仅在新字段缺失时复制旧值，然后删除旧字段并升级版本；例如未来重命名 `accessToken` 时不能靠默认合并完成。迁移失败应保留原文件并拒绝带着半迁移配置启动。
5. **安全写入。** 串行化写操作；把 YAML 写到同目录唯一临时文件，flush/close 成功后再 rename 替换目标。解析或写入失败时保留原文件并记录不含 secret 的错误。三个样本均未做到这一点，不应复制其直接覆盖写法。
6. **隔离 secrets。** 默认与示例文件只保留空值；用户文件继续由 `.gitignore` 精确忽略，并额外支持环境变量覆盖 `accessToken`、`turtleSoupAi.apiKey`。日志和配置展示必须脱敏。可在测试中执行 `git check-ignore config/config.yaml` 防止规则回退。
7. **最低测试集。** 覆盖首次启动、旧用户文件保留、自默认配置新增嵌套键、数组替换、每一版迁移、旧/新字段同时存在、畸形 YAML、写入中断后原文件仍可读，以及 tracked files 中不存在非空 secret。

推荐优先级：先实现“自动创建 + YAML + 忽略用户文件 + 深合并”，再加入 `configVersion` 迁移和安全写入。不要把“补默认值”和“修改用户已有值”混为一件事：前者可自动执行，后者必须通过可审计迁移完成。

## 本次实现决策

本插件采用上述生命周期，但暂不把已有 `config/config.js` 强制迁移为 YAML：

- 保留 JS 数据文件，兼容已经部署的地址、令牌和 AI 密钥，也避免依赖宿主安装方式是否暴露 YAML 包。
- 删除重复的 `config/config.example.js`，以 `config/default.js` 作为唯一受版本控制的 schema，首次加载自动生成被忽略的 `config/config.js`。
- 加入顶层 `configVersion` 和连续迁移表；v0 是历史上无版本号的真实配置，v1 补齐后续新增字段。
- 对普通对象递归补默认值；`backends` 不按数组索引与默认后端混合，而是保留用户列表，并用单个后端 schema 为每项补新增字段。
- 仅在首次生成、迁移或发现缺失字段时写回，采用同目录临时文件再 rename；加载失败和未来版本均不覆盖原文件。
- 本地 JS 由严格数据解析器读取，只接受 `export default` 后的对象、数组、字符串、有限数字、布尔和 `null`；历史配置使用的未引号键、单引号、注释和尾逗号仍兼容。函数调用、计算表达式、`process`、import、getter 和循环引用等运行逻辑不会执行，并会拒绝迁移、保留原文件。写回会规范化普通数据，手写注释不作为稳定契约保留。这一限制已在 README 明示。

该方案沿用 miao-plugin 的 JS 生成模式和 Guoba/TRSS 的“默认值 + 用户值”分层，同时补上样本中缺失的有序版本迁移和原子替换。

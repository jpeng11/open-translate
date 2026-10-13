# 翻译延迟逆向调查

本轮在固定的 Immersive Translate 1.33.3 包中确认了几项与速度有关的机制：按模型关闭或降低推理、分组并发请求、双语模式使用纯文本译文、视口调度和缓存。隔离浏览器实验进一步确认，自定义 OpenAI 接口的普通网页翻译可以采用**非流式、无 HTML 标记的请求**。

这些证据不能证明原版使用同一个模型能在 10 秒内完成约 1,000 个英文单词的冷启动整页翻译，也不能把“首屏出现译文”当成“整页翻译完成”。本报告没有测量原版商业服务的延迟。

## 对象与证据范围

- 参考版本：扩展 **1.33.3**；包内配置的 `releaseVersion` 为 **1.30.2**。
- 固定参考提交：`c470f0aca3c75b2785c9009a0ac48e78ead34126`。
- 调查日期：2026-10-13。
- 目标文件：已保存的发布包 `content_main.js`、`default_config.json`。没有据此验证当前最新版本。
- 工具：REA 6.4.0，配合只读 AST 提取和隔离 Chromium 实验。没有复制原版提示词、源代码或界面资源到产品实现。

| 原始文件 | SHA-256 |
| --- | --- |
| `content_main.js` | `bfe7e3e640bf90bb6b1103b0fe2e097068a751ca182beadc0bba25a8e38cda4c` |
| `default_config.json` | `74502fffc1540c900eec63714daa9ee5a744483c1f4b83e091251a7d1cddc375` |

完整 bundle 静态分析曾超时。本轮改为按 AST 边界提取 45 个相关函数或方法，对方法添加仅供解析的类包装，再交给 REA 分析。原文件字节范围和摘录哈希另行保留；摘录中的动态依赖没有被执行或完整解析。

静态 REA Evidence ID：`ev_ae069fee2ba76136e1264b591d8f34524baaa225e910763b9565d5ddf18d8e01`。

这份 Evidence 对应**派生摘录集合**，不是完整发布包的应用图，也不证明这些路径在任意用户配置下都会执行。本地研究材料位于 `/tmp/ot-rev-latency-static/`，其中 `findings.json`、`source-map.json` 和 `rea-focused.json` 分别保存结论、原始位置映射和 REA 输出；它们不是产品运行依赖。

## 静态观察

下列配置路径均相对于 `default_config.json`。它们描述包内配置，在线配置、助手设置或用户覆盖可能改变实际行为。

### 模型推理参数

| 配置路径 | 观察 |
| --- | --- |
| `translationServices.ai.modelsOverrides` | GPT-5.6 系列等模型设 `reasoning_effort: "none"`；匹配 `/responses` 的附加规则使用 `reasoning.effort: "none"`。部分较早 GPT-5 模型使用 `minimal`，并移除不适用的 temperature 参数。 |
| `translationServices.deepseek.modelsOverrides` | `deepseek-flash`、`deepseek-v4-pro` 设置 `thinking.type: "disabled"`。 |
| `translationServices.qwen.bodyConfigs` | `enable_thinking: false`。 |
| `translationServices.zhipu.modelsOverrides` | 部分较早 GLM 模型关闭推理；GLM-5.3/Flash 专门设置 `thinking.type: "enabled"` 和 `reasoning_effort: "low"`。 |
| `translationServices.gemini.modelsOverrides` | 部分 Flash 模型使用零 thinking budget 或 minimal thinking level；Gemini-3.8-Flash 使用 low。 |

配置合并函数按模型正则及可选接口路径选择覆盖。创建翻译实例时，如果用户原始配置已经包含 `bodyConfigs`，代码会跳过这一步模型默认覆盖。因此，“原版使用某模型”不代表它与我们的请求参数相同。

这些是供应商专用参数。尤其不能把直接 DeepSeek 接口的模型规则无条件套在名称不同的 OpenCode Go 模型上；需要验证实际接口是否接受，以及返回的 reasoning token 是否减少。

### 普通 OpenAI 网页翻译

`translationServices.ai.aiBatch.mode` 的包内值为 `custom`。在此模式下，普通批处理把段落用简短分隔符组织成文本，等待完整响应，再拆分结果。`translationServices.openai.maxTextGroupLengthPerRequest` 为 4，AI 基类文本长度预算为 1,200 字符。分组数上限不表示每次请求一定装满 4 个段落。

代码还支持 `recommended` 模式；包内 `translationServices.ai.aiBatch` 为它提供 8 项、每项 200 字符、最多 32 项的配置。这是另一套条件分支，不能与 `custom` 的当前默认值混为一谈。

普通路径 `_translate → handleAiOptions → rawRequestWithBatchTrace` 等待完整响应。`handleAiOptions` 本身不添加 `stream` 字段。另有 `sendMessageStream` 和 SSE 解析逻辑，但它们的存在不能证明普通网页批处理默认流式输出。

### 双语模式的格式成本

`translationServices.openai` 同时包含：

- `enableRichTranslate: true`；
- `dualEnableRichTranslate: false`；
- `translationEnableRichTranslate: true`。

渲染配置选择函数在双语模式下明确采用 `dualEnableRichTranslate`。因此，看到全局富文本开关为 true，不能推断双语译文会保留链接和加粗。

这会改变模型处理的任务：纯文本翻译无需输出并校验用于恢复译文链接的标记。它很可能减少输出量和格式错误，但减少多少延迟需要在相同模型上实测，不能从配置直接得出数字。

### 调度、专用服务与缓存

| 机制 | 包内观察及边界 |
| --- | --- |
| 默认服务 | `translationService: "bing"`。默认体验不是通用聊天模型的性能基准。 |
| 并发 | 基类上限为 200，可由 `concurrencyLimit` 覆盖；`translationServices.openai-pro` 为 50，`deepseek-pro` 为 100，`bing` 为 50。任务通过后台许可队列运行，并有单独的速率限制。 |
| OpenAI 速率 | 子类默认 10 次/1,300 ms，包内 OpenAI 配置把 interval 设为 1,350 ms；Pro 具体服务还可覆盖 limit。高并发上限不等于允许无限制请求。 |
| BabelFast | `translationServices.babelfast-pro` 设置 20 项/7,900 字符、并发 50、limit 50。独立 SSE 路径逐项接受结果并完成段落，请求声明 speed 模式。这不属于普通 OpenAI 聊天接口。 |
| 首屏与视口 | `translationStartMode: "dynamic"`；全局初始文本预算 4,999 字符、滚动范围 1 屏；OpenAI 初始预算 3,000 字符。代码使用视口观察和分批排队。 |
| 缓存 | `cache: true`、`cacheMaxAgeDay: 30`、`cacheCleanIntervalDay: 1`。AI 缓存标识包含模型、接口、提示词及批处理模式；术语和上下文也参与相关缓存标识。代码还包含站点 IndexedDB 回退及请求复用。 |

较低的首屏延迟、专用翻译服务、缓存命中和较快的非推理模型，都可能解释用户所见的“秒出”。本轮没有证据将其中任一原因确定为用户实际场景的唯一原因。

## 隔离浏览器验证

使用 Chromium **156.0.8078.4** 加载固定参考扩展，通过 `openai-custom` 配置连接回环地址上的确定性 OpenAI-compatible fixture。Playwright 配置并触发翻译；REA 随后被动观察页面。实验阻断外部主机名解析，未使用商业账号凭据。

fixture 页面 SHA-256：`e41cbc1704fb4247233b6e55727cd83122a9e8edceff83b2a4368e32350164d8`。

实际端点日志记录到标题和正文对应的两个 `/v1/chat/completions` 请求：

| 请求 | Body 字段 | System / user 字符数 | stream 字段 | 消息含 HTML 标记 |
| --- | --- | --- | --- | --- |
| 1 | `model`, `temperature`, `messages` | 296 / 100 | 未提供 | 否 |
| 2 | `model`, `temperature`, `messages` | 296 / 254 | 未提供 | 否 |

摘要中的 `stream: false` 是归一化结果；原始请求没有显式发送这个字段。两个请求的模型均为本地 `fixture-model`。

最终页面中，原文仍有 **1 个链接**，已插入的正文译文有 **0 个链接、0 个加粗节点**。这为上述默认双语纯文本路径提供了运行时证据。它只覆盖这个 fixture 和配置，不代表所有网站、模式和服务。

REA 页面 Evidence ID：`ev_d93bd69fae15db369e0fc69752a38daac8998cb49946b7db7092652587866b76`；目标枚举 Evidence ID：`ev_dabb16f1e017e4129599b719683f01bcdc3a39038a152a928fdffd767f5df2ca`。

页面观察窗口为 `2026-10-13T02:27:37.233Z` 至 `2026-10-13T02:27:42.477Z`。REA 报告的完整性状态为 `policy_filtered`，且有 `attach_limited`：附加之前的网络事件不可见，存储、部分资源和控制台等字段受过滤。REA 没有保留原始请求 body；请求内容结论来自独立 fixture 端点日志，不能错误归因给这次被动页面捕获。该页面 Evidence 本身也未认证扩展制品身份，身份由独立的包文件哈希绑定。

### 原始记录核对

已解析 `dist/rev/translation-latency-custom/` 下四份 JSON，核对摘要与原始请求的数量、路径、字段和消息长度一致，并确认页面 Evidence 的 operation 为 `inspect_web_page`、上述 Evidence ID 与记录一致。文件哈希用于区分这一轮原始记录；它们不替代 REA 的语义 Evidence ID。

| 本地记录 | SHA-256 |
| --- | --- |
| `summary.json` | `62f817f25091671526986ecef23b1240b2c2913e7b6136f098fb4457687ee63c` |
| `requests.json` | `db77a2fdcc667e19e007c77003c5bb2b53915ec61ab48c2f4104e12f2b378f03` |
| `page-evidence.json` | `058ba3074b330df9b8845ed68dae96004cc9fde7a345198d95fcc9c4681673eb` |
| `targets.json` | `8dc1cb0f9e0234ccf887474d77641da9355396cd8eda58821f2406196d6bfbd5` |

两个请求 body 按 UTF-8、对象键排序、无额外空格、保留 Unicode 序列化后的 SHA-256 分别为：

- 请求 1：`febc22b1eb3623f5e8e8d26be9891b9a3e83f854abb4f7016efa50a567b4f773`。
- 请求 2：`2bb83e93ca7c1683ede3fcdc2a046472f4b0c3edfbc52bbbec6977658a0c41f6`。

原始捕获保存在本地研究输出目录。本报告仅保留必要统计和身份信息，不转载请求中的原版提示词。

## 关键静态定位

以下为原始文件中的 **UTF-8 字节偏移，起点包含、终点不包含**，不是 minified 文件的行号或 JavaScript UTF-16 下标。精确摘录哈希保存在本地 `findings.json`。

| 文件 | 范围 | 对应行为 |
| --- | --- | --- |
| `default_config.json` | `53425–55484` | `translationServices.ai.aiBatch` |
| `default_config.json` | `99262–100743` | AI 模型参数覆盖 |
| `default_config.json` | `107024–107055` | OpenAI 双语富文本关闭 |
| `default_config.json` | `118234–118348` | DeepSeek 关闭思考 |
| `content_main.js` | `1339957–1340792` | 普通文本批处理与结果映射 |
| `content_main.js` | `1341211–1341556` | 分隔符结果解析 |
| `content_main.js` | `1347030–1347215` | 并发上限选择 |
| `content_main.js` | `1398945–1399334` | 按双语/仅译文模式选择富文本行为 |
| `content_main.js` | `1414852–1415759` | 模型/API 覆盖匹配 |
| `content_main.js` | `1427829–1432189` | 普通 AI 翻译请求路径 |
| `content_main.js` | `1437437–1438617` | OpenAI 请求体构造 |
| `content_main.js` | `1600307–1601863` | BabelFast 逐项流式处理 |
| `content_main.js` | `1603870–1604260` | BabelFast 请求体 |
| `content_main.js` | `1634241–1634940` | 用户 bodyConfigs 与模型默认覆盖的关系 |

## 对 Open Translate 的实施约束

这次调查支持继续验证简短协议、模型专用的低推理设置和有界并发；它没有证明只改提示词就能使所有可用模型达到 10 秒。专用翻译服务的速度也不能作为用户自带通用模型的保证。

当前产品仍遵守 [accepted-behavior.md](accepted-behavior.md)：保留译文中的安全链接、格式和受保护内容，并可恢复原文。原版默认双语纯文本行为只能作为单独、明确的产品选择讨论，不能悄悄替换现有约定。

原版传统分隔符解析允许合并多余结果、补缺项，部分路径会回退原文。本项目不以这些宽松行为作为“翻译完成”的标准：必须保留所有段落、标记和输出完整性检查，拒绝把截断、原文回填或部分成功计为整页成功。

后续每轮优化仍应覆盖当轮所有可用模型，以同一正文分别记录首批译文和完整翻译时间，并记录失败、限流、推理参数、token 用量以及已知缓存命中。若上游缓存状态不可知，应明确标注；不能将该结果称为严格无缓存测试。只有全部目标段落完成并通过格式检查，才能判断是否达到整页 10 秒目标。

## 可复现对照

`scripts/reference-latency.mjs` 只接受上述固定包哈希，并使用全新的浏览器配置及本地模拟接口。原始捕获必须写入被 git 忽略的 `dist/`。运行前需安装项目依赖和 Chromium；参考扩展由研究者自行提供，不随项目分发。

```bash
node scripts/reference-latency.mjs /private/reference-extension dist/rev/plain
node scripts/reference-latency.mjs /private/reference-extension dist/rev/rich rich
```

两种配置均已运行通过。显式关闭双语富文本时，正文 user 消息为 254 字符，译文有 0 个链接、0 个粗体；开启后为 273 字符，译文有 1 个链接、1 个粗体。模拟响应仅回显测试文字以验证标记往返，不能评价翻译质量或模型速度。上述默认配置首次实验与这两次显式配置对照的摘要、Evidence ID 和制品哈希见 [运输与渲染记录](acceptance/reference-translation-transport.json)。

基于这项差异，Open Translate 将无需翻译的数字引用子树在本地保存为一个原子标记；译文仍恢复安全链接及格式，而不要求模型重复输出每层嵌套 span。此项优化是否降低真实耗时，以单独的全模型测试结果为准。

## 后续实现与实测

用户随后把迭代范围收窄为 `deepseek-v4.1-flash`，要求整页低于 5 秒后再测试其他模型。第三轮全目录扫描因此在 47 条路由完成后停止，未声称完成当轮全部 57 条路由。

直接请求追踪确认，此 OpenCode Go 路由接受 `thinking.type: disabled`；最终配置还使用 `temperature: 0`。翻译中的另一个故障来自我们的校验：正确中文会移动完整的链接词组，原先要求所有标记保持英语顺序会误报。实现改用成对的 DOM 标签，允许同一父节点下的完整词组移动，同时核验每个标记恰好一次、正确配对和原有父子关系。缺失、重复、交叉或改变嵌套仍会失败。

本地 HTTP 通道的请求追踪显示，8 个计划请求分成首批 6 个和随后 2 个连接波次。短文章采用 6 个按文本长度平衡的批次，避免这次测量中的第二个波次。其适用范围是本次浏览器和传输配置，不能当作所有 HTTP/2 服务的统一并发上限。

最终固定 977 词、16 段、70 个链接的原格式英译中页面连续三次完成于 **3.799、4.327、3.822 秒**。三次均通过链接、格式结构和原文恢复检查；应用缓存关闭。第一轮记录到零推理 token 和零 prompt cache token，第二轮零推理 token、2,176 个 prompt cache token，直连重复没有采集上游 token 用量。详细参数、失败迭代和边界见 [DeepSeek 测量记录](acceptance/deepseek-five-second.json) 与 [性能说明](translation-performance.md)。这些是 Open Translate 的实测结果，不是对原版商业服务耗时的测量。

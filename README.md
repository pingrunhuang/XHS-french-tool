# 法语每日五词

Bug tracker for the Xiaohongshu H5 minitool「法语每日五词」(FRK的独立开发生活).

本仓库用来跟踪小红书 H5 小工具「法语每日五词」的缺陷，并做功能完整性走查。账号：**FRK的独立开发生活**。产品源码在别处维护；这里集中记 bug，方便审核期间处理「页面按钮无法点击」这一类问题。

## 产品

法语每日五词是提交到小红书的 H5 小工具（zip）。

- **每日闪卡**：每天五个词的闪卡
- **性别速查**：名词阴阳性快速查询
- **造句填空**：句子填空练习
- **名著朗读**：经典课文朗读，支持整段 TTS 与按句 TTS
- **点赞、收藏**：状态写在本机 localStorage

当前小红书 redapp 提审信息：

- 版本：v1.0.1
- appId：`6ae582e08eb4360015cc7e86`
- 状态：审核中

## 源码结构

- `src/`：源码
- `dist/`：与 `src` 相同的打包输入
- `french-daily-5.zip`：v1.0.4 待上传包，md5 `e117984bcb3c7ccb73dc56aedeebced1`
- `assets/`：`icon.jpg`、`cover.jpg`

## 版本记录

### v1.0.4（扩词库 CLB 1–5 + 朗读四档语速）

对应 issue #5。

#### 词库（CLB 1–CLB 5）

- 总词量：**600**
- 分层：CLB1=120 · CLB2=120 · CLB3=120 · CLB4=120 · CLB5=120
- 词性：名词 457 · 动词 90 · 形容词 53
- 保留原有 52 个词条并补上 `clb` 字段；新增词均为高频日常 / 移民学习相关
- 每个词保留字段：`id/word/pos/gender/article/zh/ipa/genderTip/examples/cloze`，并新增 **`clb`（1–5）**
- 例句默认 2 条，控制包体（words.js ≈ 275 KiB）

#### 每日抽词策略（分层混抽）

给定 `dayKey`（本地日历日）：

1. 按 `clb` 分成 1–5 五个词池
2. 每个词池用 `dayKey` 做种子洗牌，各取 **1** 个未重复词
3. 若某档为空，则从最近档（±1、±2…）补足
4. 同一天打开结果稳定；换日换一组

性别速查仍只列出名词（`pos==="n"`），默认显示前 30 个，搜索可筛全库。填空 / 点赞收藏跟随新词库。

#### 朗读语速（仅 TTS 可用设备）

- 四档：**0.25× / 0.5× / 0.75× / 1×**（便于跟读）
- 仅在 `speechSynthesis` + 法语语音可用时显示（与现有「朗读」控件同条件；安卓继续隐藏全部朗读相关控件）
- 写入 `SpeechSynthesisUtterance.rate`；整段朗读按句生效，播放中改速从下一句起
- 用户上次选择的语速写入本地进度存储，跨天保留；默认 1.0

#### 版本与产物

- 版本号：收藏页页脚 **v1.0.4**
- zip：`french-daily-5.zip`
- md5：`e117984bcb3c7ccb73dc56aedeebced1`
- 体积：99475 bytes（约 97.1 KiB）
- 审计：`write_manifest` + `audit_artifact`（Node/Python）对 `dist/` 与最终 zip 均为 **PASS**
- 名著朗读 / passages **未改**（本版只扩词库 + 语速）

#### 验证提醒

请将 zip 上传创服平台：先在平台模拟器完整点验，再分别用 Android / iOS 真机扫码验证。浏览器直跑不可作为验收依据。

### v1.0.3（名著朗读：整段朗读暂停 / 继续 + 当前句高亮放大，仅 iOS）

对应 issue #3。

- 去掉「按句朗读」和「朗读模式」切换，只保留整段朗读。
- 整段朗读支持 开始 → 暂停 → 继续，另有「停止」，读完后按钮变成「再读一遍」。内部按句拆成多个 utterance 依次朗读；暂停 = `cancel()` 并记住当前句，继续 = 从当前句开头重读。不依赖 iOS WebKit 上不稳定的 `speechSynthesis.pause()` / `resume()`。
- 正在读的句子高亮并放大（背景色 + 1.18em 字号 + 加粗，0.25s 过渡，Chrome 61 可用），暂停时变成灰色样式，并自动滚动到可视区域；停止或读完后清除高亮。按钮下方显示进度「朗读中 · 第 n / N 句」。
- 语速（慢速 / 常速）保留，朗读中切换会从下一句生效。
- 离开名著 tab、返回篇目列表、切换篇目时停止朗读；页面隐藏（visibilitychange / pagehide）时自动暂停。
- 只在支持 `speechSynthesis` 的环境（iOS）显示；安卓和 v1.0.2 一样隐藏所有朗读控件。不使用预录音频。
- 收藏页底部显示 v1.0.3。

### v1.0.2（修复 v1.0.1 审核驳回：「页面按钮无法点击」）

- 根因：朗读类按钮依赖 Web Speech API（`speechSynthesis`），安卓小红书 WebView（Android System WebView）不提供该 API，点击后代码静默 return、没有任何反馈；同时首屏内容要等端能力（`getLaunchOptions` / `getStorage`）异步返回后才渲染，桥接慢、挂起或抛错时页面是空的、按钮点了没反应。
- 首屏同步渲染，端存储读取改为后台进行（1.5s 超时兜底、同步异常捕获、结果合并不覆盖用户操作）。
- 朗读改为渐进增强：不支持 TTS 的环境隐藏全部朗读按钮，「名著朗读」tab 显示为「名著短文」；支持时点击有「正在朗读…」提示，失败或 2.5s 无声音给出明确提示。
- 全局 toast 反馈（`pointer-events: none`，不遮挡点击）；点赞 / 收藏有提示。
- 所有事件处理统一 try/catch 包装，单个异常不会让按钮失效；iOS 补 `touchstart` 让按压态生效。
- 安全区：Chrome 61 保留普通值，新内核和 PC 模拟器通过 `@supports` 使用 `var(--safe-area-inset-*, env(...))`；客户端 9.49+ 用 `getWindowInfo` 避让顶部胶囊按钮。
- 收藏页底部显示版本号 v1.0.2。

目录说明：`src/` 源码，`dist/` 与 `src/` 一致（打包来源），`french-daily-5.zip` 为待上传包（index.html 在 zip 根目录）。

## 这个仓库记什么

- 在 [Issues](https://github.com/pingrunhuang/XHS-french-tool/issues) 里记录缺陷
- 用功能完整性检查清单核对每个页面和关键操作
- 优先看按钮点了没反应、点错、或被遮罩挡住的问题

源码、打包输入和 v1.0.4 待上传包已在本仓库，见「源码结构」。

## 怎么提 Bug

打开 [新建 Issue](https://github.com/pingrunhuang/XHS-french-tool/issues/new/choose)，选择模板：

1. [功能缺陷](https://github.com/pingrunhuang/XHS-french-tool/issues/new?template=bug-report.yml) — 一般 bug：复现步骤、期望 / 实际、所在页面或功能、iOS 或 Android 小红书、截图
2. [按钮不可点](https://github.com/pingrunhuang/XHS-french-tool/issues/new?template=button-unclickable.yml) — 按钮无响应或点错：按钮文案、页面、点击无反应还是错误动作、是否怀疑遮罩 / z-index、WebView 备注
3. [功能完整性检查清单](https://github.com/pingrunhuang/XHS-french-tool/issues/new?template=completeness-checklist.yml) — 逐项标通过 / 不通过 / 未测，并写备注。覆盖每日闪卡、性别速查、造句填空、名著朗读（整段 TTS / 按句 TTS）、点赞、收藏

模板文件在 `.github/ISSUE_TEMPLATE/`：`bug-report.yml`、`button-unclickable.yml`、`completeness-checklist.yml`。英文文件名让新建 Issue 时渲染成表单；选择器里显示的名称是上面三个中文标题。

按钮无响应用「按钮不可点」，其它异常用「功能缺陷」。走查用检查清单；标成不通过的项，再各开一条对应缺陷。

## 标签

| 标签 | 用途 |
| --- | --- |
| `bug` | 功能缺陷（仓库已有） |
| `button` | 页面按钮无法点击 |
| `checklist` | 功能完整性检查 |
| `needs-repro` | 还缺复现步骤、机型或截图 |

`bug` 已存在。另外三个可在仓库里补上：

```bash
gh label create button --repo pingrunhuang/XHS-french-tool --description "页面按钮无法点击" --color "B60205"
gh label create checklist --repo pingrunhuang/XHS-french-tool --description "功能完整性检查" --color "0E8A16"
gh label create needs-repro --repo pingrunhuang/XHS-french-tool --description "需要补充复现信息" --color "FBCA04"
```

模板不会自动加尚未创建的标签。补上之后，给对应 Issue 贴 `button`、`checklist` 或 `needs-repro` 即可。

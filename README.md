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
- `french-daily-5.zip`：v1.0.2 待上传包，md5 `5e6c5a1b1bd48c0cbf28e8d4897419b7`
- `assets/`：`icon.jpg`、`cover.jpg`

## 版本记录

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

源码、打包输入和 v1.0.2 待上传包已在本仓库，见「源码结构」。

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

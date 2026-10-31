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

## 这个仓库记什么

- 在 [Issues](https://github.com/pingrunhuang/XHS-french-tool/issues) 里记录缺陷
- 用功能完整性检查清单核对每个页面和关键操作
- 优先看按钮点了没反应、点错、或被遮罩挡住的问题

源码和打包产物（dist）之后可以补进本仓库。

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

# 受控浏览器

[English](adaptive-learning.en.md) · [指南目录](index.zh-CN.md)

设置 `browserMode: managed` 使用插件独立浏览器。标准安装使用[原生工具](native-and-sharing.md)，两种模式的元素引用不同。

## 使用流程

调用 `erp_system_status`，再用 `erp_connect` 打开配置入口，由你登录。`erp_browser_status` 返回会话和版本；`erp_browser_resume` 请求确认身份，允许最多 10 分钟的页面观察。

`erp_browser_snapshot` 保存可见菜单、表格、字段、选项和应用内 frame，返回证据与短期元素引用。`erp_learning_import_snapshot` 记录可见结构，DSH 补充业务解释和关系，保留用户修正与已有解释。

`erp_browser_action` 执行一次获批的点击、填写、选择或滚动，再获取结果快照。所有交互都需确认，包括查询和可能自动保存的输入。引用两分钟后过期，执行前重新核验，发出动作前消费；失败不自动重试。结果不明时先检查页面。

人工导航或接手会暂停观察。`erp_browser_takeover` 交还控制；`erp_browser_close` 关闭会话并保留私有浏览器资料。登录可能过期，重启不会恢复观察许可。

## 学习队列

通过 `erp_learning_start/status/extend/finish_unit/pause` 先梳理菜单，再了解页面、字段和业务行为。新发现的浅层任务先于深层工作。每次最多添加 200 项，总数最多 2000。进度只覆盖已登记工作，不代表网站所有功能。重启后运行中任务暂停，需明确继续。

## 限制

快照采集可见 DOM：最多 10 个应用内 frame，每个最多 30000 字符和 500 个候选控件，总计最多 300 个可用引用。跳过隐藏内容与跨应用 frame；自定义下拉需打开后重新观察。Canvas、封闭 Shadow DOM、复杂 SSO 和多窗口仍有限制。

排除密码、隐藏和文件输入、凭据字段及 `data-erp-private` 区域。这只是部分过滤，业务数据仍可能保存并发送给配置的模型。应用范围限制选取的页面与元素，不限制网站全部网络流量。

[被动观察](https://github.com/GuoMonth/dsh-erp/blob/main/docs/browser-observation.md)与[契约导航](https://github.com/GuoMonth/dsh-erp/blob/main/docs/controlled-read-navigation.md)是用于特定场景的受控模式接口；后者需要经过审查的本地策略。存储和知识工具与原生模式共用。

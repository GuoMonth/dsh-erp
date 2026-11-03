# 受控浏览器

[English](adaptive-learning.en.md) · [指南目录](index.zh-CN.md)

设置 `browserMode: managed` 使用插件独立浏览器。标准安装使用[原生工具](native-and-sharing.md)，两种模式的元素引用不同。

## 使用流程

调用 `erp_system_status`，再用 `erp_connect` 打开配置入口，由你登录。`erp_browser_status` 返回会话和版本；`erp_browser_resume` 请求确认身份，允许最多 10 分钟的页面观察。

`erp_browser_snapshot` 保存可见菜单、表格、字段、选项和应用内 frame，返回证据与短期元素引用。`erp_learning_import_snapshot` 记录可见结构，DSH 补充业务解释和关系，保留用户修正与已有解释。

`erp_browser_action` 执行一次获批的点击、填写、选择或滚动，再获取结果快照。所有交互都需确认，包括查询和可能自动保存的输入。引用两分钟后过期，执行前重新核验，发出动作前消费；失败不自动重试。结果不明时先检查页面。

人工导航或接手会暂停观察。`erp_browser_takeover` 交还控制；`erp_browser_close` 关闭会话并保留私有浏览器资料。登录可能过期，重启不会恢复观察许可。

## 学习队列

`erp_learning_begin` 创建由控制器持有的队列，不接受模型提交的单元。第 1 层可以只做入口快照。第 2 层打开页面，仍须逐次批准。第 3 层记录已看见的字段、Tab 和窗口，然后停止，不再进入业务行为层。每一层全部结束后，控制器先写入一条摘要，再进入下一层。`erp_learning_accept` 提交当前步骤的观察，`erp_learning_block` 只阻塞当前步骤，`erp_learning_status/pause` 查看或暂停。一轮最多 2000 项，每次发现最多 200 项。进度只覆盖这条队列，不代表网站所有功能。重启后运行中的轮次暂停，需明确继续。

## 限制

快照采集可见 DOM：最多 10 个应用内 frame，每个最多 30000 字符和 500 个候选控件，总计最多 300 个可用引用。跳过隐藏内容与跨应用 frame；自定义下拉需打开后重新观察。Canvas、封闭 Shadow DOM、复杂 SSO 和多窗口仍有限制。

排除密码、隐藏和文件输入、凭据字段及 `data-erp-private` 区域。这只是部分过滤，业务数据仍可能保存并发送给配置的模型。应用范围限制选取的页面与元素，不限制网站全部网络流量。存储和知识工具与原生模式共用。

## 被动标签

`erp_browser_open` 打开空白窗口，由你在配置的应用内导航并登录。`erp_browser_observe` 只读取当前唯一页面及应用内 frame 的可见标签并保存证据：不点击、不读取输入值、不截图。多于一个页面时暂停，由人留下一页。观察许可不是 ERP 写入批准。已审查路由另见[只读契约](controlled-read-navigation.md)，默认关闭。

# SCM/USA 历史只读验证基线

> 本文描述 alpha.1–alpha.5 的历史固定适配器。alpha.6 已将其移至开发测试，不再注册 erp_scm_* 工具。当前安装与使用见 [README](../README.md) 和[通用学习](adaptive-learning.md)。

`0.1.0-alpha.5` 面向一个经过实测的 SCM/USA 系统家族。宿主为 dsh `0.1.5-rc.2`，模型复用宿主配置，实测使用 `deepseek-official / deepseek-flash`。这是带明确适配范围的只读预览版；它不承诺任意 ERP 自动适配或全部页面自动操作。

## 安装与开始

安装与完整中英文首次使用流程以 [README](../README.md) 和[中文指南](README.zh-CN.md)为准；alpha.5 源码文档不表示该版本已经发布。首次发布前可构建并安装 TGZ。

在 DSH profile 的 `cordis.patch.yml` 配置 `erp.config.system.url`，可选填写名称和身份别名；路径不以 `/` 结尾的入口另填应用 `baseUrl`。详见[系统配置](system-configuration.md)。不在对话中逐次提供 URL，不将密码交给模型。

工具流程为 `erp_system_status → erp_scm_connect → 人工登录 → erp_browser_status → erp_scm_enable`。connect 无参数，读取用户配置并原样打开入口，不拼接登录路由。确认绑定当前会话、版本和配置范围，最多 10 分钟、250 次查询；人工键鼠、导航、弹窗、退出、到期或失败会暂停并撤销许可。重新确认不自动重放失败任务。

新对话通过系统状态拿到精确 scope，查询本地知识无需登录；实时读取需要当前登录和审批。缺少令牌表示未登录或适配不兼容，保持人工模式；配置任意 URL 不会自动适配它的接口。

## 能做什么

| 工具 | 用途 |
| --- | --- |
| `erp_scm_read(query=menu)` | 读取当前账号菜单元数据，保留空翻译与层次，不虚报页面访问 |
| `erp_learning_import_menu` | 将同范围菜单观察生成版本化菜单节点与 contains 关系，重复导入同观察幂等 |
| `erp_learning_start/status/finish_unit/pause` | 持久化有限任务集，L1→L2→L3→L4 顺序、证据、blocked 原因和暂停恢复 |
| `erp_knowledge_export` | 生成本地 Markdown/JSON 当前视图，保留版本、证据引用与缺口，不替代数据库备份 |
| `erp_knowledge_record/search/get/neighbors/history` | AI 解释业务域、对象、字段，与菜单双向关联；查看来源、版本和失效依赖 |
| `erp_scm_read` | 商品、SPU 库存、采购/销售列表与详情、库存流水；固定路径和参数，禁止任意网络请求 |
| `erp_scm_trace_product` | 按精确商品编码，查商品 SKU、SPU 库存和关联采购/销售，返回每一步的 observationId |

商品链的 `maxDocuments` 为每类订单扫描上限（1–100），两类合计最多 200 个详情。结果明确给出扫描数与当时总数；未扫描完不能断言没有关联。商品列表查 keyword；采购/销售列表的 keyword 分别查单号，不查商品。关联通过 `product.skus[].id → order.items[].skuId`，库存通过 productId/SPU 关联。保留草稿、取消等原始状态，不把全部订单数量当成实际出入库。取消单可能保留历史 qtyOut，状态本身也不能证明从未出库或已冲销；对账必须另核库存流水、退货与单位换算。

查询后让 AI 记录有依据的含义、关系和方法，引用 observationId 与字面 quote。结构来源、AI 推断、用户纠正/确认分别保存。可要求它从采购领域查关联菜单，再从菜单反查支持的领域。菜单再次读取后旧观察与版本保留；移除的适配器节点/关系退休，依赖旧版本的解释需复核。用户纠正不被菜单导入覆盖。

## 边界

- 浏览器用于登录、人工接管及被动页面标签观察；业务查询采用已核实的固定 API 适配器。API 数据和实际渲染页面证据明确区分。
- 适配器从当前页面的 sessionStorage 读取登录态，在工作进程内添加认证头；不向模型、宿主工具参数或公开日志返回令牌。响应移除凭据及本次查询不需要的联系地址字段。
- 仅支持同源 `/api/loveinway-admin` 的指定 SCM/USA 查询接口。模型不能扩展路径、HTTP 方法或请求头；重定向不跟随、失败不自动重试。其他 ERP 的自动适配仍待开发。
- 这里的只读是所支持接口的已审查用途，不是“GET 天然安全”的判断，也不是对同机其他插件/工具的安全沙箱。插件不注册 ERP 写入工具；不支持用确认开启未实现的写入。
- 全局菜单发现不等于所有页面访问。任务队列只保证已列任务的顺序和持久化，不自动生成全网站任务，不运行按钮、Tab、窗口扫描。相关未覆盖范围应显示为 pending/blocked。
- 状态值是已观察样本，枚举完整性仍为 unknown；跨请求不是数据库事务快照。
- 原 `erp_browser_read_*` 精确路由契约保留为实验入口，与本适配器独立，不是本版本上手前置条件。

## 重启、升级与卸载

退出 dsh 会关闭所属浏览器/进程并等待 SQLite 已接收操作结算。知识和任务保留；下次启动必须重新检查登录和确认。sessionStorage 登录通常不能跨浏览器重启保留，因此不承诺免登录恢复。

升级前调用 `erp_storage_backup`，再在同一 profile 用 `dsh plugin ... add <新包>` 替换；数据库迁移前也会自动备份。恢复到新数据目录的过程见 [存储说明](storage.md)。不承诺把新版数据库交给旧版直接读取。

卸载使用 `dsh plugin --profile web remove @guosheng_047/dsh-erp`，不会自动删除知识、证据或浏览器配置。需要清空时，先退出宿主，核对自己设置的 dataDir 后单独删除；默认位置见存储说明。请勿删 dsh 的宿主数据目录。

从 alpha.1/alpha.2 迁移时，先退出 dsh 并备份，再用同一 profile 执行 `dsh plugin --profile web remove dsh-erp` 移除旧包，然后安装新 scope 包。新旧包使用相同的数据目录和插件行 id，不要同时启用；移除旧包不会删除知识。

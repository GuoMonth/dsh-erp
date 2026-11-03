# 指南目录

[English](index.md) · [场景与快速开始](README.zh-CN.md)

Adapt ERP 在 DeepSeek Harness 里学习一套浏览器 ERP，并把结果留在运行 dsh 的这台机器上。先读[场景](README.zh-CN.md#助手还不认识这套-erp-时)，再读[安装](README.zh-CN.md#安装)和[第一次会话](README.zh-CN.md#快速开始)。[索引](README.zh-CN.md#索引如何工作)是控制器持有的深度 3 漫游，存在本地 SQLite 里，读取时是摘要加一页证据。ERP 写入留在获批的浏览器动作上。标准路径是原生 dsh。不依赖 Deskwork。插件自带浏览器是显式选项。

| 你要做的事 | 指南 |
| --- | --- |
| 看这个插件承接哪些 ERP 工作 | [场景](README.zh-CN.md#助手还不认识这套-erp-时) |
| 安装并完成第一次会话 | [快速开始](README.zh-CN.md#快速开始) |
| 设置网站与身份 | [配置](system-configuration.md) |
| 观察、批准写入、分享 Skill | [原生操作](native-and-sharing.md) |
| 读取索引或修订本地知识 | [知识](knowledge.md) |
| 备份或恢复 SQLite | [存储](storage.md) |
| 使用插件自带浏览器 | [受控浏览器](adaptive-learning.md) |
| 开发与测试 | [开发](development.md) |
| 发布安装包 | [发布](npm-publishing.md) |

上表描述的是当前产品。[ADR 0003](adr/0003-controller-bfs-index.md) 记录深度 3 索引的决定。其余决策留在 `docs/adr`，更早的规划留在 Git 历史里。

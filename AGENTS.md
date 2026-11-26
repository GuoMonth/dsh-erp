# dsh-erp 开发规范

## 工程检查

- 使用 `.nvmrc` 与 `package.json` 固定的工具链。升级 DSH 时同步插件依赖、锁文件、`DSH_TARGET`、安装说明和打包冒烟。
- `npm run lint` 对 TypeScript 源码执行类型感知 Oxlint。规则沿用适用于本仓库的 DSH 规则。新增规则覆盖整个适用范围，例外应定位到具体代码并说明理由。
- 根 `tsconfig.json` 引用独立的宿主和客户端项目。宿主按 Node ESM 编译，客户端用浏览器类型和 React JSX 检查，由 esbuild 打包。共享模块可以被两个项目引用，浏览器模块不从宿主入口加载。
- 测试使用 Vitest。改动按公开行为和失败结果验证，优先复用现有夹具。提交前运行 `npm run verify`，覆盖文档、lint、类型、测试和真实 DSH 安装冒烟。

## TypeScript

- 在配置、JSON、文件、IPC 和工具输入处校验 `unknown`，尽早收窄成具体类型。内部类型从现有模型和 schema 派生。用判别联合表达互斥状态，导出的函数写明返回类型，局部值优先使用推断。
- 用校验、类型守卫或正确的签名解决类型错误。避免 `any`、非空断言和未经证明的强制转换。`as const` 和 `satisfies` 可用于保留字面量或校验结构。
- 优先用函数、普通对象和已有能力。抽象应服务于已有的调用或隔离明确的职责。命名体现业务含义和必要的单位，外部协议字段沿用原名。注释说明约束、原因或副作用。
- 区分查询失败、未知结果和有效的空结果。只捕获当前层能处理的错误，包装错误时保留 `cause`。Promise 应等待、返回或显式处理拒绝。可独立执行的操作可以并行，依赖顺序和清理顺序保持明确。
- 回归测试通过入口验证可观察的结果、状态和错误。在外部边界使用夹具或替身，保留断言的约束力度。评审时只保留当前需求需要的改动。

规则参考 [DSH 0.2.2-rc.5](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.5)、[Clean TypeScript](https://github.com/hikariming/anti-slop/blob/9198178bd68c9c50e7a009794c33c40214bcf197/skills/clean-typescript/SKILL.md) 和 [Writing clean code](https://github.com/hikariming/anti-slop/blob/9198178bd68c9c50e7a009794c33c40214bcf197/skills/writing-clean-code/SKILL.md)。

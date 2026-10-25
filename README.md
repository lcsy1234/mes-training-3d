# MES 车间实训室

一个用于新人培训的 3D 物料流转演练。点击托盘、电子秤、投料罐和退料区，亲手完成签收、称量、投料、退料，理解实物、任务和数量账的区别。

使用教学模拟数据，不连接真实 MES、仓库或财务系统。

## 演练内容

1. **签收**：核对 A 批次并签收 100kg，错误批次会被拦截。
2. **称量**：将示数 74 调整为任务要求的 75kg，生成模拟物料标签。
3. **投料**：核对 A 批次与指定罐体 T-01，投入 70kg；错误批次或设备会被拦截。
4. **退料**：未称量的 25kg＋桶内剩余的 5kg，一起退回 30kg。

最终核对：**签收 100kg＝投料 70kg＋退料 30kg**。

支持场景旋转、缩放、实体选中、物料移动与投料动画、步骤提示、操作记录、JSON 导出、重新演练和键盘操作。

这里的数量、称量要求和次序是教学场景规则，不能替代真实现场的容差、审批和外部系统处理规则。扫码通过选择模拟标签实现。

## 本地运行

需要 Node.js 20.19+ 或 22.12+。

```bash
npm ci
npm run dev
```

浏览器访问终端显示的地址。刷新页面会开始新一轮演练，关闭前可导出演练记录。

```bash
npm test
npm run build
npm run preview
```

## 模型与代码

- `model-library/`：四类推荐 GLB 模型与预览图，发布包内独立保存。
- `public/models`：指向项目内模型目录的相对符号链接。
- `src/training.js`：教学流程及数量校验。
- `src/scene.js`：Three.js 场景、模型和动画。
- `src/main.js`：交互界面。
- `qa/example-training-report.json`：完整演练的示例记录。

模型由 Tripo 生成。应用使用模型文件即可运行，不需要 Tripo API Key。生成凭据、原始任务响应和本机配置不在仓库中。

## GitHub Pages

`.github/workflows/pages.yml` 在推送到 `main` 时安装依赖、运行测试和依赖审计、构建并发布 Pages；Pull Request 只执行检查和构建。

仓库 Settings → Pages 的 Source 选择 **GitHub Actions**。发布时自动将 `BASE_PATH` 设为仓库子路径，本地默认使用 `/`。

需要测试同样的子路径构建时：

```bash
BASE_PATH=/mes-training-3d/ npm run build
```

回退版本可使用 Git revert 还原提交并推送，自动部署流程会重新发布对应版本。

# 关联关系可视化工具 MVP

一个前后端分离的“星云关系图/宇宙关系网”MVP。

## 技术栈

- 前端：React + TypeScript + Vite + Three.js + d3-force
- 后端：Python FastAPI + pandas + openpyxl
- 数据源：Excel/CSV，预留 PostgreSQL 图谱读取能力

## 项目结构

```text
frontend/  前端星云关系图
backend/   FastAPI 数据接口
docs/      Excel 模板与说明
```

## 前端运行

```bash
cd frontend
npm install
npm run dev
```

访问：`http://localhost:5173`

## 后端运行

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

也可以直接使用固定虚拟环境的启动脚本：

```bash
cd backend
./scripts/run_dev.sh
```

## API

```text
GET  /api/health
GET  /api/graph
POST /api/import/excel
POST /api/import/csv
POST /api/datasources/postgres/test
POST /api/datasources/postgres/graph
POST /api/graph/filter
POST /api/graph/path
POST /api/graph/extract-table
```

## 第三阶段能力

- PostgreSQL：左侧数据源面板支持连接测试、节点表/边表和字段映射读取。
- 字段映射：通过 JSON 映射配置，例如 `{"id":"id","name":"name","type":"type","group":"group","weight":"weight"}`。
- 二维表抽取：左侧“二维表抽取”支持粘贴 CSV/TSV 文本，指定 source/target/relation/weight 字段后生成标准图谱。
- 筛选：支持节点类型、关系类型、权重阈值筛选。
- 路径查询：前端搜索框支持 `节点A::节点B`，后端 `/api/graph/path` 支持按节点 ID 或名称查询多条路径的并集图谱。

## 核心节点计算

前端不再依赖 mock 数据顺序判断核心节点，而是对所有数据源统一计算 `core_score`。适用数据源包括 mock、Excel、CSV、PostgreSQL 和二维表抽取。

当前核心评分公式：

```text
core_score =
  度中心性 * 0.40
  + 节点权重 * 0.35
  + 加权关系强度 * 0.20
  + 类型优先级 * 0.05
```

计算说明：

- `度中心性`：节点直接连接的边数量，按当前图谱最大度数归一化。
- `节点权重`：节点字段 `weight`，按当前图谱最大节点权重归一化。
- `加权关系强度`：节点所有相邻边的 `weight` 之和，按当前图谱最大关系强度归一化。
- `类型优先级`：根据节点类型给出轻量业务修正，例如核心主体、集团、企业、实际控制人、家族长辈等会获得更高基础优先级。

核心评分用途：

- 初始化布局时，`core_score` 最高的节点放在图谱中央。
- 前若干高分节点围绕中心形成核心层。
- 大规模数据概览优先展示高分核心节点及其高权重一跳关系。
- 初始化相机取景优先围绕核心节点群，而不是随机节点或 mock 中的固定节点。

节点层级按 `color.md` 固定数量规则划分：

```text
核心节点 = min(max(1, 总节点数 * 1%), 30)
一级重要 = min(总节点数 * 8%, 160)
二级节点 = min(总节点数 * 30%, 800)
三级节点 = 其余
特殊节点 = 风险规则覆盖
```

实现位置：

```text
frontend/src/graph/coreScore.ts
frontend/src/graph/createForceLayout.ts
frontend/src/hooks/useGraphViewport.ts
frontend/src/workers/graphViewport.worker.ts
```

## 大规模数据展示策略

大规模图谱不会一次性完整渲染所有节点、所有边和所有动画。系统采用 WebGL + LOD + 聚合 + 局部展开策略，保证画布可读和交互性能。

当前策略：

- 当节点数超过阈值，或存在聚合簇节点，或节点数较多时，进入大图布局模式。
- 初始化只展示综合评分最高的一批核心节点，以及它们的高权重一跳关系。
- 超出展示阈值的外围节点会按 `group + type` 聚合为簇节点。
- 缩小时优先显示核心节点和聚合点，避免满屏密集小点。
- 点击节点后，以该节点为焦点展开一跳、二跳、三跳上下文。
- 聚焦节点的邻居和高权重关系优先保留，低优先级关系降级为背景。
- 路径搜索结果会额外绘制独立路径覆盖层，不依赖普通边是否已被 LOD 裁剪。
- 粒子动画只应用在高权重边、聚焦边和路径边上，避免全量动画导致卡顿。
- 大图中的普通边会合并为 `LineSegments` 批量渲染，减少 Three.js 对象数量。
- 聚合和视口裁剪逻辑优先在 Worker 中执行，降低主线程压力。

大规模图谱相关实现：

```text
frontend/src/hooks/useGraphViewport.ts
frontend/src/workers/graphViewport.worker.ts
frontend/src/graph/NebulaGraph.tsx
frontend/src/graph/createForceLayout.ts
```

## Excel 模板

示例模板位于：

```text
docs/graph_excel_template.xlsx
```

说明见：

```text
docs/excel_template.md
```

## CSV 模板

示例模板位于：

```text
docs/nodes_template.csv
docs/edges_template.csv
```

说明见：

```text
docs/csv_template.md
```

前端顶部支持导入 Excel，也支持一次选择一个或两个 CSV 文件。CSV 文件名包含 `nodes` / `edges` 时会自动识别；如果只上传关系 CSV，后端会根据 `source` / `target` 自动生成节点。

## 使用说明

- 后端未启动时，前端会自动使用 mock 数据。
- 上传 Excel 后，前端会调用 `/api/import/excel` 并刷新图谱。
- 上传 CSV 后，前端会调用 `/api/import/csv` 并刷新图谱。
- 点击节点会高亮一跳关系。
- 边上发光粒子从 source 流向 target，只对高权重边和高亮边播放，以控制性能。

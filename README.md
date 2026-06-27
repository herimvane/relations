# NebulaNet

星域洞察 · NebulaNet 是一个面向社交关系、企业关系和风控关系的图谱可视化系统。前端使用 React + TypeScript + Three.js，后端使用 FastAPI + PostgreSQL，支持 Excel/CSV 导入、社区识别、重要度计算、四级视图和路径搜索。

当前版本：`1.1.0`

## 快速启动

推荐使用 Docker Compose：

```bash
docker compose up --build
```

访问：

```text
前端：http://localhost:5173
后端：http://localhost:8000/api/health
PostgreSQL：localhost:5432
```

默认数据库账号：

```text
username: nebulanet
password: nebulanet
database: relations
```

停止服务：

```bash
docker compose down
```

删除数据库 volume：

```bash
docker compose down -v
```

## 本地开发

后端：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

前端：

```bash
cd frontend
npm install
npm run dev
```

访问：

```text
http://localhost:5173
```

## 核心能力

- 暗色星云关系图，基于 Three.js/WebGL 渲染。
- L0/L1/L2/L3 四级视图，适配大规模图谱。
- Excel/CSV 临时导入。
- Excel/CSV 数据库模式导入，支持预检报告和确认入库。
- 社区识别：Leiden、Louvain、Label Propagation、连通分量、已有字段。
- 节点重要度：默认结构公式 + 可添加数值属性字段。
- 搜索：节点搜索、路径搜索、数据库候选路径。
- Docker Compose 部署：frontend + backend + PostgreSQL。

## 项目结构

```text
frontend/   React + TypeScript + Vite + Three.js
backend/    FastAPI + PostgreSQL + pandas/openpyxl
docs/       模板和完整项目说明
docker/     PostgreSQL 初始化脚本
tmp/        本地临时脚本，不作为核心代码发布
```

## 数据导入

页面“导入数据”支持两种模式：

```text
临时模式：上传 Excel/CSV，只写入后端内存，适合快速查看。
数据库模式：上传 Excel/CSV，预检后写入 PostgreSQL，适合正式数据。
```

Excel 推荐包含两个 sheet：

```text
nodes
edges
```

CSV 推荐一次选择两个文件：

```text
nodes.csv
edges.csv
```

只上传一个 CSV 时，系统会倾向按关系表处理，并根据 `source` / `target` 自动补全节点。

## 常用接口

```text
GET    /api/health
GET    /api/views/universe
GET    /api/views/galaxy/{community_id}
GET    /api/views/backbone/{node_id}
GET    /api/views/local/{node_id}
GET    /api/search/nodes
GET    /api/search/path
POST   /api/import/excel
POST   /api/import/csv
POST   /api/import/database/preview-jobs
GET    /api/import/database/preview-jobs/{job_id}
DELETE /api/import/database/preview-jobs/{job_id}
POST   /api/import/database/commit
```

## 文档

完整说明见：

```text
docs/project_manual.md
```

模板说明：

```text
docs/excel_template.md
docs/csv_template.md
```

## 备注

- 根目录只保留 `README.md` 作为入口文档。
- 详细算法、部署、导入流程、路径搜索和性能策略统一维护在 `docs/project_manual.md`。
- `outputs/` 和 `tmp/` 用于本地测试数据与临时脚本，不建议提交到仓库。

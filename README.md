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

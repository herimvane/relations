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
uvicorn app.main:app --reload --port 8000
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

## Excel 模板

示例模板位于：

```text
docs/graph_excel_template.xlsx
```

说明见：

```text
docs/excel_template.md
```

## 使用说明

- 后端未启动时，前端会自动使用 mock 数据。
- 上传 Excel 后，前端会调用 `/api/import/excel` 并刷新图谱。
- 点击节点会高亮一跳关系。
- 边上发光粒子从 source 流向 target，只对高权重边和高亮边播放，以控制性能。

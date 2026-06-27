# NebulaNet 项目详细说明

本文档说明 NebulaNet 的项目结构、运行方式、数据模型、导入流程，以及当前系统中涉及的核心算法逻辑。

项目定位：面向社交关系、企业关系、风控关系、人物关系等图谱数据的暗色宇宙风格关系分析工具。

## 1. 系统概览

NebulaNet 由前后端分离实现：

```text
frontend/  React + TypeScript + Vite + Three.js
backend/   FastAPI + PostgreSQL + pandas/openpyxl/psycopg
docs/      模板、说明文档
tmp/       独立导入脚本，不属于项目核心代码
outputs/   测试数据与生成文件
```

核心数据流有两套：

```text
小中规模临时图谱：
Excel / CSV -> FastAPI import API -> 内存 graph_store -> 前端普通图谱

大规模数据库图谱：
Excel / CSV / 外部数据 -> 独立导入脚本 -> PostgreSQL -> View API -> 前端 L0/L1/L2/L3 视图
```

两套数据流的区别很重要：

| 能力 | Excel/CSV 临时模式 | PostgreSQL 数据库模式 |
|---|---|---|
| 保存位置 | 后端内存 | PostgreSQL |
| 后端重启后保留 | 否 | 是 |
| 适合规模 | 小中规模 | 中大规模 |
| L0/L1/L2/L3 视图 | 否 | 是 |
| 全局搜索 | 部分依赖当前视图 | 是 |
| 社区视图 | 否 | 是 |
| 自动社区识别 | 否 | 是，支持 Leiden/Louvain/Label/连通分量/已有字段 |

## 2. 运行方式

前端：

```bash
cd frontend
npm install
npm run dev
```

后端：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

或：

```bash
cd backend
./scripts/run_dev.sh
```

默认 API 地址：

```text
http://127.0.0.1:8000
```

前端开发服务器通常是：

```text
http://localhost:5173
```

## 3. 部署方式

本项目推荐部署形态：

```text
Nginx
  ├─ /                 -> frontend/dist 静态文件
  └─ /api/*            -> FastAPI backend:8000

PostgreSQL             -> relations 数据库
FastAPI                -> systemd / supervisor / pm2 / Docker 均可
Frontend               -> npm run build 后静态托管
```

### 3.1 Docker Compose 快速部署

项目根目录提供：

```text
docker-compose.yml
backend/Dockerfile
frontend/Dockerfile
frontend/nginx.conf
backend/datasources.docker.json
docker/postgres/init/01-create-databases.sql
```

启动：

```bash
docker compose up --build
```

访问：

```text
前端：http://localhost:5173
后端健康检查：http://localhost:8000/api/health
PostgreSQL：localhost:5432
```

Compose 服务：

| 服务 | 说明 |
|---|---|
| postgres | PostgreSQL 16，默认数据库 `relations` |
| backend | FastAPI，监听容器内 `0.0.0.0:8000` |
| frontend | Nginx 托管前端静态文件，并将 `/api` 反代到 backend |

默认数据库账号：

```text
username: nebulanet
password: nebulanet
database: relations
```

初始化脚本会额外创建：

```text
relations2
```

后端容器使用 `backend/datasources.docker.json`：

```json
{
  "active_dataset": "social",
  "postgres": {
    "host": "postgres",
    "port": 5432,
    "username": "nebulanet",
    "password": "nebulanet",
    "schema": "public",
    "node_table": "nodes",
    "edge_table": "edges"
  }
}
```

常用命令：

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
docker compose down -v
```

注意：`docker compose down -v` 会删除 PostgreSQL volume，正式环境谨慎使用。

### 3.2 服务器准备

建议环境：

```text
Ubuntu 22.04+ / Debian 12+ / macOS server 均可
Node.js 20+
Python 3.11+
PostgreSQL 14+
Nginx 1.20+
```

安装系统依赖示例：

```bash
sudo apt update
sudo apt install -y nginx postgresql postgresql-contrib python3.11 python3.11-venv
```

Node.js 可以使用 nvm 或发行版包管理器安装。

### 3.3 数据库准备

创建数据库和用户示例：

```bash
sudo -u postgres psql
```

```sql
create database relations;
create user nebulanet with password 'your_password';
grant all privileges on database relations to nebulanet;
\q
```

如果 PostgreSQL 15+ 对 public schema 权限较严格，进入数据库后再执行：

```bash
sudo -u postgres psql -d relations
```

```sql
grant usage, create on schema public to nebulanet;
alter schema public owner to nebulanet;
```

### 3.4 后端配置

复制或创建：

```text
backend/datasources.json
```

示例：

```json
{
  "active_dataset": "social",
  "postgres": {
    "host": "127.0.0.1",
    "port": 5432,
    "username": "nebulanet",
    "password": "your_password",
    "schema": "public",
    "node_table": "nodes",
    "edge_table": "edges"
  },
  "datasets": {
    "social": {
      "database": "relations",
      "title": "社交关系大图"
    }
  }
}
```

也可以通过环境变量指定配置文件路径：

```bash
export NEBULANET_DATASOURCES_CONFIG=/opt/nebulanet/backend/datasources.json
```

安装后端依赖：

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

启动后端：

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

生产环境建议使用 systemd 管理。

示例 `/etc/systemd/system/nebulanet-backend.service`：

```ini
[Unit]
Description=NebulaNet FastAPI backend
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/nebulanet/backend
Environment=NEBULANET_DATASOURCES_CONFIG=/opt/nebulanet/backend/datasources.json
ExecStart=/opt/nebulanet/backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable nebulanet-backend
sudo systemctl start nebulanet-backend
sudo systemctl status nebulanet-backend
```

### 3.5 前端构建

如果前端和后端同域部署，并通过 Nginx 将 `/api` 反代到后端，API 基址保持为空即可：

```bash
cd frontend
npm install
VITE_API_BASE_URL= npm run build
```

如果后端是独立域名：

```bash
VITE_API_BASE_URL=https://api.example.com npm run build
```

构建产物：

```text
frontend/dist/
```

部署到：

```text
/var/www/nebulanet
```

示例：

```bash
sudo mkdir -p /var/www/nebulanet
sudo rsync -av --delete frontend/dist/ /var/www/nebulanet/
```

### 3.6 Nginx 配置

同域部署示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/nebulanet;
    index index.html;

    client_max_body_size 200m;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

启用：

```bash
sudo ln -s /etc/nginx/sites-available/nebulanet /etc/nginx/sites-enabled/nebulanet
sudo nginx -t
sudo systemctl reload nginx
```

HTTPS 推荐使用 certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 3.7 导入正式数据

如果你已有 Excel：

```bash
backend/.venv/bin/python tmp/import_graph_to_postgres.py \
  --excel /path/to/graph.xlsx \
  --replace
```

如果你已有 CSV：

```bash
backend/.venv/bin/python tmp/import_graph_to_postgres.py \
  --nodes /path/to/nodes.csv \
  --edges /path/to/edges.csv \
  --replace
```

先 dry-run 检查社区识别和重要度：

```bash
backend/.venv/bin/python tmp/import_graph_to_postgres.py \
  --excel /path/to/graph.xlsx \
  --dry-run \
  --report /tmp/nebulanet_import_report.json
```

### 3.8 部署验证

后端健康检查：

```bash
curl http://127.0.0.1:8000/api/health
```

数据库视图：

```bash
curl http://127.0.0.1:8000/api/views/universe
```

Nginx 访问：

```text
http://your-domain.com
```

浏览器中应看到：

```text
星域洞察 · NebulaNet
L0 Universe 视图
社区节点和跨社区关系
```

### 3.9 常见部署问题

前端能打开但没有数据：

```text
检查 VITE_API_BASE_URL 是否正确
检查 Nginx /api 反代
检查 FastAPI 是否运行
```

后端能运行但 Universe 失败：

```text
检查 backend/datasources.json
检查 PostgreSQL 用户、密码、数据库名
检查 nodes/edges 表是否已导入数据
检查 community_id 和 importance_score 是否存在
```

上传 Excel 失败：

```text
检查 Nginx client_max_body_size
检查 proxy_read_timeout
检查后端日志
```

大图加载慢：

```text
确认 edges.source / edges.target / nodes.community_id / importance_score 索引存在
确认导入脚本完成 analyze
适当降低 /api/views/universe?limit=...&edge_limit=...
```

## 4. 数据模型

前后端统一图谱模型：

```ts
type GraphNode = {
  id: string;
  name: string;
  type: string;
  group?: string;
  weight?: number;
  properties?: Record<string, unknown>;
};

type GraphEdge = {
  id?: string;
  source: string;
  target: string;
  relation_type: string;
  weight?: number;
  properties?: Record<string, unknown>;
};
```

PostgreSQL 正式大图表结构：

```text
nodes(
  id text primary key,
  name text not null,
  type text not null,
  "group" text,
  weight double precision,
  properties jsonb,
  community_id text,
  importance_score double precision,
  computed_at timestamptz
)

edges(
  id text primary key,
  source text not null,
  target text not null,
  relation_type text not null,
  weight double precision,
  properties jsonb,
  importance_score double precision,
  computed_at timestamptz
)
```

关键字段说明：

| 字段 | 作用 |
|---|---|
| `nodes.id` | 节点唯一 ID，所有边通过它引用节点 |
| `nodes.name` | 前端显示名称 |
| `nodes.type` | 节点类型，用于颜色、筛选和层级判断 |
| `nodes.group` | 普通分组字段，Excel/CSV 和前端筛选会用到 |
| `nodes.weight` | 节点大小、排序和重要度参考 |
| `nodes.properties` | 扩展属性，右侧详情面板展示 |
| `nodes.community_id` | 社区 ID，L0/L1 视图依赖 |
| `nodes.importance_score` | 数据库视图排序、核心节点、搜索排序依赖 |
| `edges.source` | 起点 |
| `edges.target` | 终点 |
| `edges.relation_type` | 关系类型，用于筛选和显示 |
| `edges.weight` | 关系强度，用于排序、线条强弱、粒子优先级 |
| `edges.importance_score` | 边排序和路径/视图选择参考 |

## 5. 数据导入

### 5.1 页面 Excel/CSV 临时导入

页面顶部“导入数据”弹窗提供两种模式：

```text
临时模式：上传 Excel/CSV，只写入后端内存 graph_store
数据库模式：上传 Excel/CSV，先预检，再确认导入 PostgreSQL
```

临时模式调用：

```text
POST /api/import/excel
POST /api/import/csv
GET  /api/graph
```

这类导入只保存在后端内存中：

```text
backend/app/services/graph_store.py
```

适合：

- 快速测试 Excel 模板；
- 看小中规模图；
- 临时演示；
- 不需要 L0/L1/L2/L3 数据库视图的情况。

不适合：

- 需要持久保存；
- 需要社区识别；
- 需要数据库全局搜索；
- 需要大图 LOD 分层视图。

### 5.2 Excel 与 CSV 导入差异

上传一个 Excel 文件时，推荐在同一个 `.xlsx` 中包含两个 sheet：

```text
nodes
edges
```

上传 CSV 时，推荐一次选择两个文件：

```text
node.csv / nodes.csv
edge.csv / edges.csv
```

如果只上传一个 CSV，系统倾向将它当成关系表。后端会根据 `source` / `target` 自动补全节点，但节点名称、类型、分组、权重和扩展属性会比较粗。

| 方式 | 适合场景 | 优点 | 注意点 |
|---|---|---|---|
| 单个 Excel | 人工整理、测试、业务人员维护 | 一个文件同时包含节点和关系，易传递 | 大文件解析较慢，不适合超大规模 |
| nodes.csv + edges.csv | 程序生成、ETL、数据库导出、大规模导入 | 文件轻、解析快、适合自动化 | 需要管理两个文件，列名和编码要规范 |
| 单个 edge.csv | 只有关系数据 | 可以快速生成关系图 | 节点信息由端点自动补全，信息较少 |

Excel 模板：

```text
docs/graph_excel_template.xlsx
```

模板要求：

```text
nodes sheet:
id, name, type, group, weight, properties 或其他扩展列

edges sheet:
id, source, target, relation_type, weight, properties 或其他扩展列
```

额外列会自动进入 `properties`。

### 5.3 页面数据库模式导入

数据库模式用于将上传数据写入 PostgreSQL，并生成 L0/L1/L2/L3 视图依赖的社区和重要度字段。

流程：

```text
选择 Excel/CSV
-> 选择社区识别算法
-> 预检数据
-> 查看校验报告和重要度公式
-> 可添加数值属性字段参与重要度计算
-> 确认导入数据库
-> 自动刷新 L0 Universe
```

预检任务接口：

```text
POST   /api/import/database/preview-jobs
GET    /api/import/database/preview-jobs/{job_id}
DELETE /api/import/database/preview-jobs/{job_id}
```

确认导入接口：

```text
POST /api/import/database/commit
```

预检阶段显示的是后端真实阶段，而不是前端模拟百分比：

```text
1/5 等待处理
2/5 解析文件
3/5 校验结构
4/5 计算社区与重要度
5/5 完成
```

预检报告包含：

- 节点数、边数；
- 孤立节点；
- 缺失端点；
- 社区数量；
- Top 节点；
- Top 社区；
- 关系类型统计；
- 可加入重要度公式的数值属性字段；
- 字段覆盖率。

### 5.4 数据库导入脚本

通用独立脚本：

```text
tmp/import_graph_to_postgres.py
```

它不依赖项目模块，只读取文件、识别社区、计算重要度并写入 PostgreSQL。

Excel 导入数据库：

```bash
backend/.venv/bin/python tmp/import_graph_to_postgres.py \
  --excel outputs/sanguo_relationship_graph.xlsx \
  --replace
```

CSV 导入数据库：

```bash
backend/.venv/bin/python tmp/import_graph_to_postgres.py \
  --nodes nodes.csv \
  --edges edges.csv \
  --replace
```

只分析不写库：

```bash
backend/.venv/bin/python tmp/import_graph_to_postgres.py \
  --excel outputs/sanguo_relationship_graph.xlsx \
  --dry-run \
  --report tmp/import_report.json
```

脚本能力：

- 自动补全缺失节点；
- 跳过空 source/target 和自环边；
- 自动识别社区；
- 计算节点 degree、strength、importance_score；
- 计算边 importance_score；
- 写入 PostgreSQL `nodes/edges`；
- 输出 JSON 报告，便于导入前检查。

## 6. 社区识别算法

当前数据库导入支持多种社区识别方式：

```text
leiden     Leiden，推荐，社区质量和稳定性更好
louvain    Louvain，速度和质量平衡
label      加权 Label Propagation，轻量快速
connected 连接分量，最快但粒度粗
existing  使用输入文件已有 community_id / group
```

页面导入弹窗中默认选择 Leiden。如果后端环境缺少 `python-igraph` 或 `leidenalg`，需要重新安装 `backend/requirements.txt`。

### 6.1 Leiden / Louvain

Leiden 和 Louvain 都属于模块度优化类社区发现算法。

Leiden：

- 社区连通性更好；
- 结果通常比 Louvain 更稳定；
- 适合正式导入和大规模关系网络；
- 依赖 `python-igraph` 与 `leidenalg`。

Louvain：

- 经典模块度优化算法；
- 速度快，结果通常优于 Label Propagation；
- 可能产生局部最优；
- 依赖 `networkx` 或 `python-louvain`。

### 6.2 加权 Label Propagation

位置：

```text
tmp/import_graph_to_postgres.py
```

基本思路：

1. 初始时每个节点都是自己的社区；
2. 多轮迭代；
3. 每一轮遍历节点；
4. 对该节点的所有邻居社区按边权累加得分；
5. 节点选择得分最高的邻居社区作为自己的社区；
6. 若一轮没有变化，提前停止；
7. 最后按社区规模重新编号为 `community_0001`、`community_0002`。

伪代码：

```text
for node in nodes:
  label[node] = node.id

repeat max_iter:
  shuffle(nodes)
  changed = 0
  for node in nodes:
    score_by_label = {}
    for neighbor, weight in adjacency[node]:
      score_by_label[label[neighbor]] += weight
    best = argmax(score_by_label)
    if label[node] != best:
      label[node] = best
      changed += 1
  if changed == 0:
    break
```

特点：

- 无需额外依赖；
- 对边权敏感；
- 速度快，适合中大型图导入；
- 结果不如 Leiden/Louvain 稳定，但足够作为当前 MVP 的自动社区识别方案。

适用场景：

- 社交网络；
- 人物关系；
- 普通企业关联；
- 没有现成社区标签的数据。

如果数据本身有明确分组，例如公司集团、行业、阵营，可以直接提供 `community_id` 并使用：

```bash
--community-method existing
```

### 6.3 连接分量

连接分量会把所有连通的节点归为同一个社区。

适合：

- 数据天然由多个互不连接的子图组成；
- 想快速获得粗粒度社区；
- 不关心大连通图内部细分。

不适合：

- 一个巨大连通分量的社交网络；
- 需要细颗粒社区结构的情况。

## 7. 重要度算法

系统里有两套重要度逻辑：

1. 前端临时图谱 `core_score`；
2. 数据库导入/视图排序使用的 `importance_score`。

### 7.1 前端核心节点评分

位置：

```text
frontend/src/graph/NebulaGraph.tsx
```

公式：

```text
core_score =
  0.40 * degree_score
  + 0.35 * weight_score
  + 0.20 * strength_score
  + 0.05 * type_priority
```

指标解释：

| 指标 | 说明 |
|---|---|
| `degree_score` | 节点直接连接边数，按最大度数归一化 |
| `weight_score` | 节点 `weight`，按最大节点权重归一化 |
| `strength_score` | 相邻边权重总和，按最大强度归一化 |
| `type_priority` | 根据节点类型给轻量业务加权 |

类型优先级示例：

```text
核心 / 主体 / 集团 > 企业 / 公司 > 控制人 > 股东 > 人员 / 人物 > 其他
```

用途：

- 初始布局中心节点选择；
- 节点层级颜色；
- 大规模数据前端降采样；
- 概览视图核心节点优先显示；
- 临时 Excel/CSV 图谱没有数据库 `importance_score` 时的补充排序。

### 7.2 数据库导入重要度

位置：

```text
backend/app/services/importance.py
backend/app/services/database_importer.py
```

默认公式：

```text
importance_score =
  0.72 * degree_score
  + 0.16 * strength_score
  + 0.12 * business_score
```

其中：

```text
degree_score   = log1p(degree) / log1p(max_degree)
strength_score = log1p(strength) / log1p(max_strength)
business_score = sqrt(node.weight / max_weight)
```

当前产品不再让系统自动猜测“社交/股权/交易/风控”模板。默认始终使用通用结构公式，用户可以在导入预检后手动添加数值属性字段。

可添加字段来自预检阶段扫描：

```text
node.properties.*
edge.properties.*
```

只会进入候选字段列表的字段：

- 可解析为数值；
- 覆盖率不低于阈值；
- 可使用 `minmax`、`log` 或 `sqrt` 转换。

字段覆盖率含义：

```text
覆盖率 = 有有效数值的节点/边数量 ÷ 总节点/边数量
```

例如 `node.properties.risk_score` 覆盖率 100%，表示所有节点都有有效 `risk_score`；如果 `edge.properties.amount` 覆盖率 42%，表示只有 42% 的边有金额字段，缺失部分按 0 参与计算。

用户添加字段后，字段作为新的公式项加入，例如：

```text
importance_score =
  0.72 * degree_score
  + 0.16 * strength_score
  + 0.12 * business_score
  + 0.30 * field_score
```

这里的权重是相对比例，不要求合计 100%。后端会对所有启用且可用的公式项做归一化：

```text
实际权重 = 当前项权重 / 启用可用项权重总和
```

例如用户设置：

```text
72 / 16 / 12 / 30
```

总和为 130，实际计算为：

```text
72 / 130 = 55.38%
16 / 130 = 12.31%
12 / 130 = 9.23%
30 / 130 = 23.08%
```

如果所有启用项权重都为 0，后端会回退到默认结构公式：

```text
0.72 * degree_score
+ 0.16 * strength_score
+ 0.12 * business_score
```

默认三项可以关闭和调权重，但不能移除；用户添加的属性字段可以移除。

### 7.3 边重要度

数据库导入时边重要度：

```text
edge_importance =
  0.45 * relation_score
  + 0.275 * source_importance
  + 0.275 * target_importance
```

其中：

```text
relation_score = log1p(edge.weight) / log1p(100)
```

用途：

- 数据库视图中边排序；
- 搜索和路径扩展时优先保留高价值边；
- 视觉上优先渲染强关系。

## 8. 四级视图

正式数据库大图不直接一次性返回全部节点边，而是通过后端 View API 分层返回。

位置：

```text
backend/app/services/graph_view_service.py
```

### 8.1 L0 Universe

接口：

```text
GET /api/views/universe
```

目标：

展示社区级全局结构。

算法：

1. 按 `community_id` 聚合节点；
2. 统计每个社区的节点数；
3. 计算社区重要度：

```text
community_importance = max(nodes.importance_score)
```

4. 取 Top 社区；
5. 聚合跨社区边：

```text
source_community != target_community
group by source_community, target_community
edge_count = count(*)
avg_weight = avg(edge.weight)
```

6. 返回社区节点和跨社区聚合边。

默认规模：

```text
社区节点 limit = 220
跨社区边 edge_limit = 180
```

前端展示：

- 社区被渲染成聚合节点；
- `node_count` 影响社区体量；
- `importance_score` 影响亮度和权重；
- 点击社区进入 L1。

### 8.2 L1 Galaxy

接口：

```text
GET /api/views/galaxy/{community_id}
```

目标：

展示某个社区内部的高重要度骨架。

算法：

1. 查询该 `community_id` 下节点；
2. 按 `importance_score desc, weight desc` 排序；
3. 默认取 Top 1000；
4. 查询这些节点之间的内部边；
5. 按 `importance_score` 和 `weight` 排序，最多取 5000 条边。

点击普通节点进入 L2。

### 8.3 L2 Backbone

接口：

```text
GET /api/views/backbone/{node_id}
```

目标：

展示某个节点的核心邻域骨架。

算法：

1. 找到目标节点；
2. 找一跳邻居；
3. 目标节点优先；
4. 邻居按 `importance_score desc, weight desc` 排序；
5. 默认取 1000 个节点；
6. 查询这些节点之间的边；
7. 与目标节点直接相连的边优先。

点击节点进入 L3。

### 8.4 L3 Local

接口：

```text
GET /api/views/local/{node_id}
```

目标：

展示某个节点的局部上下文，并避免无限下钻。

算法分两步：

第一步，尝试取目标节点的一跳和二跳候选节点：

```text
candidate = target + one_hop + two_hop
```

如果候选节点数量：

```text
0 < candidate_count <= 1000
```

则认为局部视图完整：

```text
complete = true
can_drill = false
```

此时返回候选节点之间的边，最多 10000 条。

如果候选节点超过阈值：

```text
complete = false
can_drill = true
```

则只返回目标节点和一跳邻居，并且只返回与目标节点直接相连的边。

这个设计解决的问题：

- 避免 L3 无限下钻；
- 小局部图可以完整展示；
- 超大邻域不一次性炸开；
- 用户仍可继续选择其他节点深入探索。

## 9. 前端视口与 LOD

位置：

```text
frontend/src/hooks/useGraphViewport.ts
frontend/src/workers/graphViewport.worker.ts
```

前端不会把每份数据都完整渲染。即使后端返回了较多节点，前端也会按当前状态生成一个可视视口。

主要策略：

### 9.1 概览视口

没有聚焦节点时：

1. 计算核心节点排名；
2. 选择 Top 核心节点作为 anchors；
3. 每个 anchor 只保留一部分高权重一跳关系；
4. 超出阈值的邻居按：

```text
group + type
```

聚合成簇节点。

目的：

- 避免大图初始画面变成密集点云；
- 保持核心结构可见；
- 让用户先看到“哪里重要”。

### 9.2 聚焦视口

点击节点后：

1. 以该节点为中心；
2. 取该节点 Top 一跳边；
3. 根据展开深度补充二跳上下文；
4. 剩余大量邻居按 `group + type` 聚合；
5. 同时保留部分 overview 节点作为空间参照。

展开深度由连续点击同一节点逐步增加：

```text
depth 1 -> depth 2 -> depth 3
```

### 9.3 Worker

部分视口裁剪逻辑运行在 Web Worker 中，避免主线程卡顿。

好处：

- 数据筛选和聚合不阻塞 Three.js 渲染；
- 搜索/点击/缩放更稳定；
- 适合几万到十万级数据的前端可视窗口。

## 10. 布局算法

位置：

```text
frontend/src/graph/createForceLayout.ts
```

系统使用：

```text
d3-force + 自定义 3D 球体化
```

不是纯 2D 力导向。

### 10.1 d3-force 阶段

使用的力：

| 力 | 作用 |
|---|---|
| `forceLink` | 让有边的节点靠近 |
| `forceManyBody` | 节点互斥，避免重叠 |
| `forceCollide` | 节点碰撞半径 |
| `forceRadial` | 让不同重要度节点分布到不同半径 |
| `forceCenter` | 保持整体居中 |

社区视图中：

- 社区边越强，距离越近；
- 社区半径根据 `node_count` 和 `importance_score` 估算；
- 使用较强碰撞，避免社区重叠。

### 10.2 3D 球体化

d3-force 输出天然偏 2D，所以系统增加了 `inflateToSphereVolume`。

核心逻辑：

1. 找到高重要度 anchor；
2. 以 anchor 加权中心作为视觉中心；
3. 将 2D 坐标归一化到近似圆形；
4. 根据节点重要度决定其目标壳层；
5. 给每个节点分配稳定随机深度；
6. 重要节点更靠近中心和前景；
7. 外围节点分布到球体壳层。

效果目标：

- 避免所有节点像摊在一张饼上；
- 保持“在宇宙空间中”的纵深感；
- 重要节点不被甩到边缘；
- 每次同一份数据布局稳定，不随机跳变。

## 11. 自动最佳视角算法

位置：

```text
frontend/src/graph/NebulaGraph.tsx
```

核心方法：

```text
computeBestViewFrame
```

使用场景：

- 初始化；
- 聚焦节点；
- 路径搜索；
- 下钻后最终取景；
- 顶部重置视图。

基本过程：

1. 选择要纳入取景的节点集合；
2. 计算节点包围盒；
3. 根据模式选择 padding、最小/最大 cameraZ；
4. 在若干候选旋转角中选择一个视角；
5. 评分标准：

```text
画面占比尽量大
不能过多超出画布
深度感尽量明显
节点分布不要过扁
```

不同模式的取景偏好不同：

| 模式 | 说明 |
|---|---|
| `overview` | 初始化和总览，较保守 |
| `focus` | 聚焦节点，尽量放大当前邻域 |
| `path` | 路径搜索，路径节点必须完整可见 |
| `drill-view` | 下钻后视图，允许更明显推进 |

原则：

```text
尽量最大化显示目标节点集合，但不要严重超出画布。
```

## 12. 路径搜索

路径搜索支持输入：

```text
节点A::节点B
节点A->节点B
节点A到节点B
```

### 12.1 前端当前视图路径搜索

位置：

```text
frontend/src/graph/pathSearch.ts
```

算法：

1. 解析查询；
2. 在当前图里按 ID 或 name 查找节点；
3. 构建无向邻接表；
4. DFS 搜索简单路径；
5. 限制：

```text
maxDepth = 4
maxPaths = 20
maxBranching = 72 或更低
maxIterations = 18000
```

路径评分：

```text
score = average(edge.weight)
```

排序：

```text
score desc, path length asc
```

### 12.2 后端数据库路径搜索

位置：

```text
backend/app/services/search_service.py
```

算法：

1. 根据 ID/name 模糊解析 source 和 target；
2. 从 source 开始按深度逐层拉取边；
3. 每层边按 `importance_score` 和 `weight` 排序；
4. 构建局部 adjacency；
5. 在局部图中 DFS 搜索；
6. 返回 Top 路径。

默认限制：

```text
max_depth <= 5
max_paths <= 20
max_branching <= 96
```

注意：

这不是全库最短路径算法，而是“受限高价值候选路径搜索”。它优先保证交互速度和结果可解释性。

## 13. 右侧关系面板

当前右侧面板有两种状态：

### 13.1 一跳关联

当没有执行 `节点A::节点B` 路径搜索时，右侧显示的是当前选中节点的一跳关联：

```text
edge.source == selected.id || edge.target == selected.id
```

并按边权重排序，显示前 8 条。

因此它更准确的含义是：

```text
一跳关联 Top 8
```

页面标题会显示：

```text
一跳关联 Top N / 共 M
```

其中 `M` 是当前画布数据中与选中节点直接相连的关系总数，`N` 是当前面板实际展示数量，最多 8 条。

不是“所有路径”。

### 13.2 路径分析

当执行路径搜索时，右侧显示路径结果：

```text
path.nodes: 节点路径
path.edges: 边路径
path.score: 路径评分
```

画布会额外合并路径节点和路径边，保证路径即使被普通 LOD 裁剪，也能显示。

## 14. 渲染与视觉算法

位置：

```text
frontend/src/graph/NebulaGraph.tsx
frontend/src/graph/cosmicDust.ts
frontend/src/graph/graphTheme.ts
```

### 14.1 WebGL 渲染

图谱使用 Three.js 渲染：

- 节点：Sprite + hit mesh；
- 边：Line / LineSegments；
- 粒子：沿边曲线移动的 Sprite；
- 标签：CanvasTexture Sprite；
- 背景：远景星场、星尘、暗云、中心星云；
- 交互：raycaster 检测节点。

### 14.2 节点视觉层级

节点层级由 `core_score` 或数据特征决定：

```text
核心节点
一级重要节点
二级节点
三级节点
特殊节点
```

视觉规则来自：

```text
color.md
frontend/src/graph/graphTheme.ts
```

节点效果：

- 星体核心；
- 柔和星芒；
- 轻微呼吸；
- 聚焦时放大并提升亮度；
- 非聚焦节点降低透明度。

### 14.3 边和粒子

边颜色和宽度由 `weight` 决定：

```text
弱关系 -> 冷色低透明细线
强关系 -> 暖色更亮更粗
路径边 -> 偏红/暖色高亮
```

粒子方向：

```text
source -> target
```

但不是所有边都有粒子。为了性能，粒子只出现在：

- 路径边；
- 聚焦边；
- 高权重边；
- 数量阈值内的活跃边。

如果某条边没有粒子，通常不是因为单向，而是因为没有进入动画队列。

### 14.4 背景星尘

背景分层：

```text
远景星场
宽幅稀疏星尘
不规则暗云层
中心柔和星云
边/节点相关 cosmic dust
```

远景层挂在 `scene` 上，不跟随节点旋转。图谱相关 dust 挂在 `root` 下，会跟随图谱空间。

## 15. 性能策略

当前性能策略：

| 策略 | 目的 |
|---|---|
| L0/L1/L2/L3 后端分层 | 避免全量数据进入前端 |
| 前端 Viewport LOD | 保持当前画面可读 |
| Worker 裁剪 | 避免主线程阻塞 |
| LineSegments 合并边 | 减少 Three.js 对象数量 |
| 粒子数量限制 | 避免全量动画卡顿 |
| 标签按需显示 | 避免大量 CanvasTexture |
| 路径 overlay | 保证重要路径不被 LOD 裁剪 |

大图中普通边会批量合并；只有少量活跃边保留独立对象，用于高亮、粒子和交互。

## 16. 搜索逻辑

搜索框支持：

```text
普通节点搜索
路径搜索
```

普通搜索：

1. 先查当前视图；
2. 当前视图无结果时查数据库；
3. 如果结果在当前视图内，直接聚焦；
4. 如果结果不在当前视图内，加载该节点 L3 Local 视图并聚焦。

路径搜索：

1. 识别 `::`、`->`、`到`；
2. 优先调用数据库路径搜索；
3. 失败时回退当前视图路径搜索；
4. 搜索结果合并进画布并高亮。

## 17. 常见问题

### 17.1 Excel 导入后为什么数据库没变？

导入弹窗的“临时模式”只写入内存 `graph_store`，不会写 PostgreSQL。要写数据库，请使用“数据库模式”确认导入，或使用独立脚本：

```bash
backend/.venv/bin/python tmp/import_graph_to_postgres.py --excel your.xlsx --replace
```

### 17.2 社区会自动识别吗？

临时模式不会。数据库模式会在预检/确认导入时根据选择的算法识别社区；独立脚本也支持：

```bash
--community-method label
```

默认自动识别社区。

### 17.3 为什么 L0 只看到社区？

L0 是 Universe 视图，设计目标是看全局社区结构，不显示原始节点明细。点击社区进入 L1。

### 17.4 为什么某些边没有粒子？

粒子有性能限制，只给路径边、聚焦边和部分高权重边。

### 17.5 为什么右侧“关联路径”和路径搜索不一样？

没有路径查询时，右侧显示的是一跳关联 Top 8。输入 `节点A::节点B` 后，才显示真正的路径分析结果。

### 17.6 为什么 L3 有时不能继续下钻？

当 L3 的候选局部节点数不超过 1000 时，系统认为该局部视图已经完整：

```text
can_drill = false
complete = true
```

此时点击节点只聚焦，不继续下钻。

## 18. 主要文件索引

前端：

```text
frontend/src/App.tsx
frontend/src/graph/NebulaGraph.tsx
frontend/src/graph/createForceLayout.ts
frontend/src/graph/coreScore.ts
frontend/src/graph/cosmicDust.ts
frontend/src/graph/pathSearch.ts
frontend/src/hooks/useGraphViewport.ts
frontend/src/workers/graphViewport.worker.ts
frontend/src/components/PathQueryPanel.tsx
frontend/src/components/RightPanel.tsx
frontend/src/components/SearchBox.tsx
frontend/src/components/TopBar.tsx
```

后端：

```text
backend/app/main.py
backend/app/core/datasource_config.py
backend/app/services/graph_view_service.py
backend/app/services/search_service.py
backend/app/services/excel_parser.py
backend/app/services/csv_parser.py
backend/app/services/graph_store.py
backend/app/routers/views.py
backend/app/routers/search.py
backend/app/routers/import_data.py
```

数据与脚本：

```text
docs/graph_excel_template.xlsx
docs/excel_template.md
tmp/import_graph_to_postgres.py
tmp/import_ego_twitter_to_postgres.py
outputs/sanguo_relationship_graph.xlsx
```

## 19. 后续优化建议

推荐后续优先级：

1. 增加路径搜索的数据库索引优化、缓存和跨社区路径解释；
2. 增加社区命名规则，例如按 Top 节点、主要类型或业务标签自动命名；
3. 将重要度公式保存为可复用模板，并记录导入版本；
4. 增加导入任务历史，支持查看历史预检报告和回滚；
5. 增加节点/边详情中的证据链和备注能力；
6. 增加更细粒度的数据质量报告，例如重复边、异常权重、低覆盖率字段；
7. 增加部署环境的自动健康检查和数据库初始化向导。

# CSV 导入模板说明

CSV 导入接口：`POST /api/import/csv`

前端支持一次选择一个或两个 CSV 文件：

- `nodes_template.csv`：节点表
- `edges_template.csv`：关系表

如果只上传关系表，后端会根据 `source` / `target` 自动生成节点。

## nodes 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| id | 是 | 节点唯一 ID |
| name | 否 | 节点显示名称，缺省时使用 id |
| type | 否 | 节点类型 |
| group | 否 | 分组，用于前端颜色 |
| weight | 否 | 节点权重 |
| properties | 否 | JSON 字符串，会解析为扩展属性 |

## edges 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| id | 否 | 边 ID |
| source | 是 | 起点节点 ID |
| target | 是 | 终点节点 ID |
| relation_type | 否 | 关系类型 |
| weight | 否 | 关系强度 |
| properties | 否 | JSON 字符串，会解析为扩展属性 |

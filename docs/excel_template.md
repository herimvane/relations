# Excel 导入模板说明

模板文件：`docs/graph_excel_template.xlsx`

工作簿包含两个 sheet：

- `nodes`：节点表
- `edges`：关系表

## nodes 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| id | 是 | 节点唯一 ID |
| name | 是 | 节点显示名称 |
| type | 否 | 节点类型 |
| group | 否 | 分组，用于前端颜色 |
| weight | 否 | 节点权重，影响节点大小 |
| risk_score | 否 | 示例扩展属性 |
| note | 否 | 示例扩展属性 |

## edges 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| id | 否 | 边 ID |
| source | 是 | 起点节点 ID |
| target | 是 | 终点节点 ID |
| relation_type | 否 | 关系类型，用于筛选和颜色 |
| weight | 否 | 关系强度，影响排序和动态粒子 |
| confidence | 否 | 示例扩展属性 |
| evidence | 否 | 示例扩展属性 |

除标准字段外，其余字段会被放入 `properties`，前端右侧详情面板会展示。

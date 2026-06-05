import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const workbook = Workbook.create();
const nodes = workbook.worksheets.add('nodes');
const edges = workbook.worksheets.add('edges');

nodes.getRange('A1:G1').values = [['id', 'name', 'type', 'group', 'weight', 'risk_score', 'note']];
nodes.getRange('A2:G7').values = [
  ['n-0', '星云核心主体', '核心主体', 'omega', 100, 94, '中心节点'],
  ['n-1', '示例企业 A', '企业', 'alpha', 72, 68, '供应链关联'],
  ['n-2', '示例人员 B', '人员', 'beta', 56, 43, '高管'],
  ['n-3', '示例账户 C', '账户', 'gamma', 64, 77, '资金往来'],
  ['n-4', '示例项目 D', '项目', 'delta', 48, 35, '合作项目'],
  ['n-5', '示例事件 E', '事件', 'alpha', 40, 58, '舆情事件']
];

edges.getRange('A1:G1').values = [['id', 'source', 'target', 'relation_type', 'weight', 'confidence', 'evidence']];
edges.getRange('A2:G7').values = [
  ['e-0', 'n-0', 'n-1', '投资', 88, '96%', '工商记录'],
  ['e-1', 'n-0', 'n-2', '任职', 76, '91%', '年报'],
  ['e-2', 'n-1', 'n-3', '交易', 69, '84%', '流水'],
  ['e-3', 'n-1', 'n-4', '合作', 58, '82%', '合同'],
  ['e-4', 'n-2', 'n-5', '关联', 44, '79%', '公开信息'],
  ['e-5', 'n-3', 'n-0', '控制', 63, '88%', '规则推断']
];

for (const sheet of [nodes, edges]) {
  sheet.getRange('A1:G1').format.font.bold = true;
}

await fs.mkdir('docs', { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save('docs/graph_excel_template.xlsx');

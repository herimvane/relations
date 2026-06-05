export const graphTheme = {
  background: '#05070d',
  core: '#f6f7ff',
  palette: {
    alpha: '#6ee7f9',
    beta: '#9cffb8',
    gamma: '#ffcd6b',
    delta: '#d5a6ff',
    omega: '#ff8ba3',
    default: '#8fb8ff'
  },
  relation: {
    投资: '#6ee7f9',
    任职: '#9cffb8',
    交易: '#ffcd6b',
    合作: '#d5a6ff',
    控制: '#ff8ba3',
    关联: '#8fb8ff'
  }
};

export function colorForGroup(group?: string): string {
  return graphTheme.palette[group as keyof typeof graphTheme.palette] ?? graphTheme.palette.default;
}

export function colorForRelation(relation?: string): string {
  return graphTheme.relation[relation as keyof typeof graphTheme.relation] ?? graphTheme.palette.default;
}

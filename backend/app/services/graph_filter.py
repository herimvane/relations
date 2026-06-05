from app.models.graph import GraphData


def filter_graph(graph: GraphData, node_types: list[str], relation_types: list[str], min_weight: float) -> GraphData:
    allowed_nodes = {
        node.id
        for node in graph.nodes
        if (not node_types or node.type in node_types) and node.weight >= min_weight
    }
    edges = [
        edge
        for edge in graph.edges
        if edge.source in allowed_nodes
        and edge.target in allowed_nodes
        and (not relation_types or edge.relation_type in relation_types)
        and edge.weight >= min_weight
    ]
    connected = {edge.source for edge in edges} | {edge.target for edge in edges}
    nodes = [node for node in graph.nodes if node.id in allowed_nodes and (node.id in connected or not edges)]
    return GraphData(nodes=nodes, edges=edges)

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

from app.models.datasource import PostgresConfig, PostgresGraphRequest
from app.models.graph import GraphData
from app.services.mapping_service import map_edge, map_node


def _url(config: PostgresConfig) -> URL:
    return URL.create(
        "postgresql+psycopg",
        username=config.username,
        password=config.password,
        host=config.host,
        port=config.port,
        database=config.database,
    )


def test_connection(config: PostgresConfig) -> bool:
    engine = create_engine(_url(config), pool_pre_ping=True)
    with engine.connect() as conn:
      conn.execute(text("select 1"))
    return True


def _safe_table(schema_name: str, table: str) -> str:
    if not schema_name.replace("_", "").isalnum() or not table.replace("_", "").isalnum():
        raise ValueError("Only alphanumeric table and schema names are allowed")
    return f'"{schema_name}"."{table}"'


def load_graph(request: PostgresGraphRequest) -> GraphData:
    engine = create_engine(_url(request.config), pool_pre_ping=True)
    node_table = _safe_table(request.config.schema_name, request.node_table)
    edge_table = _safe_table(request.config.schema_name, request.edge_table)
    with engine.connect() as conn:
        node_rows = [dict(row._mapping) for row in conn.execute(text(f"select * from {node_table} limit 5000"))]
        edge_rows = [dict(row._mapping) for row in conn.execute(text(f"select * from {edge_table} limit 15000"))]

    nodes = [map_node(row, request.node_mapping) for row in node_rows]
    edges = [map_edge(row, request.edge_mapping, index) for index, row in enumerate(edge_rows)]
    valid_nodes = {node.id for node in nodes}
    return GraphData(nodes=nodes, edges=[edge for edge in edges if edge.source in valid_nodes and edge.target in valid_nodes])

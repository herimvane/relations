from pydantic import BaseModel, Field


class PostgresConfig(BaseModel):
    host: str
    port: int = 5432
    database: str
    username: str
    password: str
    schema_name: str = Field(default="public", alias="schema")


class PostgresGraphRequest(BaseModel):
    config: PostgresConfig
    node_table: str
    edge_table: str
    node_mapping: dict[str, str]
    edge_mapping: dict[str, str]

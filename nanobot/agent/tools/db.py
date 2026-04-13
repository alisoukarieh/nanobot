"""Database tool for structured data storage via PocketBase."""

import json
from typing import Any

from loguru import logger

from nanobot.agent.tools.base import Tool, tool_parameters
from nanobot.agent.tools.pocketbase import PocketBaseClient, PocketBaseError
from nanobot.agent.tools.schema import IntegerSchema, StringSchema, tool_parameters_schema


@tool_parameters(
    tool_parameters_schema(
        action=StringSchema(
            "Action to perform",
            enum=["create_collection", "list_collections", "insert", "query", "update", "delete"],
        ),
        collection=StringSchema(
            "Collection (table) name. Required for all actions except list_collections."
        ),
        schema=StringSchema(
            'JSON array of field definitions for create_collection. '
            'Each field: {"name": "field_name", "type": "text|number|bool|email|url|date|json|select", '
            '"required": true/false}. '
            'Example: [{"name": "calories", "type": "number", "required": true}]'
        ),
        data=StringSchema(
            "JSON object of record data for insert/update. "
            'Keys are field names. Example: {"meal_name": "chicken", "calories": 450}'
        ),
        record_id=StringSchema("Record ID (for update/delete)"),
        filter=StringSchema(
            "PocketBase filter expression for query. "
            "Example: \"calories > 500 && created >= '2026-04-12'\""
        ),
        sort=StringSchema(
            "Sort expression for query. Prefix with - for descending. "
            "Example: \"-created\" for newest first"
        ),
        page=IntegerSchema(1, description="Page number for query", minimum=1),
        per_page=IntegerSchema(
            20, description="Records per page for query", minimum=1, maximum=100
        ),
        required=["action"],
    )
)
class DbTool(Tool):
    """Database tool for structured data storage via PocketBase."""

    def __init__(self, client: PocketBaseClient):
        self._client = client

    @property
    def name(self) -> str:
        return "db"

    @property
    def description(self) -> str:
        return (
            "Database tool for structured data storage via PocketBase. "
            "Only use this tool when the user explicitly requests data to be stored in "
            "or read from the database. "
            "Actions: create_collection, list_collections, insert, query, update, delete."
        )

    async def execute(
        self,
        action: str,
        collection: str | None = None,
        schema: str | None = None,
        data: str | None = None,
        record_id: str | None = None,
        filter: str | None = None,
        sort: str | None = None,
        page: int = 1,
        per_page: int = 20,
        **kwargs: Any,
    ) -> str:
        try:
            if action == "create_collection":
                return await self._create_collection(collection, schema)
            elif action == "list_collections":
                return await self._list_collections()
            elif action == "insert":
                return await self._insert(collection, data)
            elif action == "query":
                return await self._query(collection, filter or "", sort or "", page, per_page)
            elif action == "update":
                return await self._update(collection, record_id, data)
            elif action == "delete":
                return await self._delete(collection, record_id)
            return f"Error: Unknown action '{action}'"
        except PocketBaseError as e:
            logger.warning("db tool error: {}", e)
            return f"Error: {e}"
        except Exception as e:
            logger.exception("db tool unexpected error")
            return f"Error: {e}"

    async def _create_collection(self, collection: str | None, schema_json: str | None) -> str:
        if not collection:
            return "Error: 'collection' is required for create_collection"
        if not schema_json:
            return "Error: 'schema' is required for create_collection"
        fields = _parse_json(schema_json, "schema")
        if isinstance(fields, str):
            return fields  # error message
        if not isinstance(fields, list):
            return "Error: 'schema' must be a JSON array of field definitions"
        result = await self._client.create_collection(collection, fields)
        field_count = len(result.get("fields", result.get("schema", [])))
        return f"Created collection '{collection}' with {field_count} fields."

    async def _list_collections(self) -> str:
        items = await self._client.list_collections()
        if not items:
            return "No collections found."
        lines = []
        for c in items:
            name = c.get("name", "?")
            ctype = c.get("type", "base")
            fields = c.get("fields", c.get("schema", []))
            field_names = [f.get("name", "?") for f in fields] if fields else []
            lines.append(f"- {name} ({ctype}): {', '.join(field_names) or 'no fields'}")
        return "Collections:\n" + "\n".join(lines)

    async def _insert(self, collection: str | None, data_json: str | None) -> str:
        if not collection:
            return "Error: 'collection' is required for insert"
        if not data_json:
            return "Error: 'data' is required for insert"
        data = _parse_json(data_json, "data")
        if isinstance(data, str):
            return data  # error message
        if not isinstance(data, dict):
            return "Error: 'data' must be a JSON object"
        result = await self._client.insert_record(collection, data)
        record_id = result.get("id", "?")
        return f"Inserted record (id: {record_id}) into '{collection}'."

    async def _query(
        self, collection: str | None, filter_expr: str, sort: str, page: int, per_page: int
    ) -> str:
        if not collection:
            return "Error: 'collection' is required for query"
        result = await self._client.query_records(collection, filter_expr, sort, page, per_page)
        items = result.get("items", [])
        total = result.get("totalItems", len(items))
        if not items:
            return f"No records found in '{collection}'."
        lines = [f"Found {total} record(s) in '{collection}' (page {page}):"]
        for item in items:
            display = {k: v for k, v in item.items() if not k.startswith("@")}
            lines.append(f"  {json.dumps(display, default=str)}")
        return "\n".join(lines)

    async def _update(
        self, collection: str | None, record_id: str | None, data_json: str | None
    ) -> str:
        if not collection:
            return "Error: 'collection' is required for update"
        if not record_id:
            return "Error: 'record_id' is required for update"
        if not data_json:
            return "Error: 'data' is required for update"
        data = _parse_json(data_json, "data")
        if isinstance(data, str):
            return data  # error message
        if not isinstance(data, dict):
            return "Error: 'data' must be a JSON object"
        await self._client.update_record(collection, record_id, data)
        return f"Updated record '{record_id}' in '{collection}'."

    async def _delete(self, collection: str | None, record_id: str | None) -> str:
        if not collection:
            return "Error: 'collection' is required for delete"
        if not record_id:
            return "Error: 'record_id' is required for delete"
        await self._client.delete_record(collection, record_id)
        return f"Deleted record '{record_id}' from '{collection}'."


def _parse_json(raw: str, field_name: str) -> Any:
    """Parse a JSON string, returning the parsed value or an error string."""
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError) as e:
        return f"Error: '{field_name}' is not valid JSON: {e}"

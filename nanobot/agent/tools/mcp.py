"""MCP client: connects to MCP servers and wraps their tools as native nanobot tools."""

import asyncio
from contextlib import AsyncExitStack
from typing import Any

import httpx
from loguru import logger

from nanobot.agent.tools.base import Tool
from nanobot.agent.tools.registry import ToolRegistry


def _extract_nullable_branch(options: Any) -> tuple[dict[str, Any], bool] | None:
    """Return the single non-null branch for nullable unions."""
    if not isinstance(options, list):
        return None

    non_null: list[dict[str, Any]] = []
    saw_null = False
    for option in options:
        if not isinstance(option, dict):
            return None
        if option.get("type") == "null":
            saw_null = True
            continue
        non_null.append(option)

    if saw_null and len(non_null) == 1:
        return non_null[0], True
    return None


def _normalize_schema_for_openai(schema: Any) -> dict[str, Any]:
    """Normalize only nullable JSON Schema patterns for tool definitions."""
    if not isinstance(schema, dict):
        return {"type": "object", "properties": {}}

    normalized = dict(schema)

    raw_type = normalized.get("type")
    if isinstance(raw_type, list):
        non_null = [item for item in raw_type if item != "null"]
        if "null" in raw_type and len(non_null) == 1:
            normalized["type"] = non_null[0]
            normalized["nullable"] = True

    for key in ("oneOf", "anyOf"):
        nullable_branch = _extract_nullable_branch(normalized.get(key))
        if nullable_branch is not None:
            branch, _ = nullable_branch
            merged = {k: v for k, v in normalized.items() if k != key}
            merged.update(branch)
            normalized = merged
            normalized["nullable"] = True
            break

    if "properties" in normalized and isinstance(normalized["properties"], dict):
        normalized["properties"] = {
            name: _normalize_schema_for_openai(prop) if isinstance(prop, dict) else prop
            for name, prop in normalized["properties"].items()
        }

    if "items" in normalized and isinstance(normalized["items"], dict):
        normalized["items"] = _normalize_schema_for_openai(normalized["items"])

    if normalized.get("type") != "object":
        return normalized

    normalized.setdefault("properties", {})
    normalized.setdefault("required", [])
    return normalized


class MCPToolWrapper(Tool):
    """Wraps a single MCP server tool as a nanobot Tool."""

    def __init__(self, session, server_name: str, tool_def, tool_timeout: int = 30):
        self._session = session
        self._original_name = tool_def.name
        self._name = f"mcp_{server_name}_{tool_def.name}"
        self._description = tool_def.description or tool_def.name
        raw_schema = tool_def.inputSchema or {"type": "object", "properties": {}}
        self._parameters = _normalize_schema_for_openai(raw_schema)
        self._tool_timeout = tool_timeout

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    @property
    def parameters(self) -> dict[str, Any]:
        return self._parameters

    async def execute(self, **kwargs: Any) -> str:
        from mcp import types

        try:
            result = await asyncio.wait_for(
                self._session.call_tool(self._original_name, arguments=kwargs),
                timeout=self._tool_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning("MCP tool '{}' timed out after {}s", self._name, self._tool_timeout)
            return f"(MCP tool call timed out after {self._tool_timeout}s)"
        except asyncio.CancelledError:
            # MCP SDK's anyio cancel scopes can leak CancelledError on timeout/failure.
            # Re-raise only if our task was externally cancelled (e.g. /stop).
            task = asyncio.current_task()
            if task is not None and task.cancelling() > 0:
                raise
            logger.warning("MCP tool '{}' was cancelled by server/SDK", self._name)
            return "(MCP tool call was cancelled)"
        except Exception as exc:
            logger.exception(
                "MCP tool '{}' failed: {}: {}",
                self._name,
                type(exc).__name__,
                exc,
            )
            return f"(MCP tool call failed: {type(exc).__name__})"

        parts = []
        for block in result.content:
            if isinstance(block, types.TextContent):
                parts.append(block.text)
            else:
                parts.append(str(block))
        return "\n".join(parts) or "(no output)"


class MCPResourceWrapper(Tool):
    """Wraps an MCP resource URI as a read-only nanobot Tool."""

    def __init__(self, session, server_name: str, resource_def, resource_timeout: int = 30):
        self._session = session
        self._uri = resource_def.uri
        self._name = f"mcp_{server_name}_resource_{resource_def.name}"
        desc = resource_def.description or resource_def.name
        self._description = f"[MCP Resource] {desc}\nURI: {self._uri}"
        self._parameters: dict[str, Any] = {
            "type": "object",
            "properties": {},
            "required": [],
        }
        self._resource_timeout = resource_timeout

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    @property
    def parameters(self) -> dict[str, Any]:
        return self._parameters

    @property
    def read_only(self) -> bool:
        return True

    async def execute(self, **kwargs: Any) -> str:
        from mcp import types

        try:
            result = await asyncio.wait_for(
                self._session.read_resource(self._uri),
                timeout=self._resource_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "MCP resource '{}' timed out after {}s", self._name, self._resource_timeout
            )
            return f"(MCP resource read timed out after {self._resource_timeout}s)"
        except asyncio.CancelledError:
            task = asyncio.current_task()
            if task is not None and task.cancelling() > 0:
                raise
            logger.warning("MCP resource '{}' was cancelled by server/SDK", self._name)
            return "(MCP resource read was cancelled)"
        except Exception as exc:
            logger.exception(
                "MCP resource '{}' failed: {}: {}",
                self._name,
                type(exc).__name__,
                exc,
            )
            return f"(MCP resource read failed: {type(exc).__name__})"

        parts: list[str] = []
        for block in result.contents:
            if isinstance(block, types.TextResourceContents):
                parts.append(block.text)
            elif isinstance(block, types.BlobResourceContents):
                parts.append(f"[Binary resource: {len(block.blob)} bytes]")
            else:
                parts.append(str(block))
        return "\n".join(parts) or "(no output)"


class MCPPromptWrapper(Tool):
    """Wraps an MCP prompt as a read-only nanobot Tool."""

    def __init__(self, session, server_name: str, prompt_def, prompt_timeout: int = 30):
        self._session = session
        self._prompt_name = prompt_def.name
        self._name = f"mcp_{server_name}_prompt_{prompt_def.name}"
        desc = prompt_def.description or prompt_def.name
        self._description = (
            f"[MCP Prompt] {desc}\n"
            "Returns a filled prompt template that can be used as a workflow guide."
        )
        self._prompt_timeout = prompt_timeout

        # Build parameters from prompt arguments
        properties: dict[str, Any] = {}
        required: list[str] = []
        for arg in prompt_def.arguments or []:
            prop: dict[str, Any] = {"type": "string"}
            if getattr(arg, "description", None):
                prop["description"] = arg.description
            properties[arg.name] = prop
            if arg.required:
                required.append(arg.name)
        self._parameters: dict[str, Any] = {
            "type": "object",
            "properties": properties,
            "required": required,
        }

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    @property
    def parameters(self) -> dict[str, Any]:
        return self._parameters

    @property
    def read_only(self) -> bool:
        return True

    async def execute(self, **kwargs: Any) -> str:
        from mcp import types
        from mcp.shared.exceptions import McpError

        try:
            result = await asyncio.wait_for(
                self._session.get_prompt(self._prompt_name, arguments=kwargs),
                timeout=self._prompt_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning("MCP prompt '{}' timed out after {}s", self._name, self._prompt_timeout)
            return f"(MCP prompt call timed out after {self._prompt_timeout}s)"
        except asyncio.CancelledError:
            task = asyncio.current_task()
            if task is not None and task.cancelling() > 0:
                raise
            logger.warning("MCP prompt '{}' was cancelled by server/SDK", self._name)
            return "(MCP prompt call was cancelled)"
        except McpError as exc:
            logger.error(
                "MCP prompt '{}' failed: code={} message={}",
                self._name,
                exc.error.code,
                exc.error.message,
            )
            return f"(MCP prompt call failed: {exc.error.message} [code {exc.error.code}])"
        except Exception as exc:
            logger.exception(
                "MCP prompt '{}' failed: {}: {}",
                self._name,
                type(exc).__name__,
                exc,
            )
            return f"(MCP prompt call failed: {type(exc).__name__})"

        parts: list[str] = []
        for message in result.messages:
            content = message.content
            # content is a single ContentBlock (not a list) in MCP SDK >= 1.x
            if isinstance(content, types.TextContent):
                parts.append(content.text)
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, types.TextContent):
                        parts.append(block.text)
                    else:
                        parts.append(str(block))
            else:
                parts.append(str(content))
        return "\n".join(parts) or "(no output)"


async def connect_mcp_servers(
    mcp_servers: dict, registry: ToolRegistry
) -> dict[str, AsyncExitStack]:
    """Connect to configured MCP servers and register their tools, resources, prompts.

    Uses mcp-use library for connection management with OAuth/bearer auth support.
    Returns a dict mapping server name -> its dedicated AsyncExitStack.
    """

    async def connect_single_server(name: str, cfg) -> tuple[str, AsyncExitStack | None]:
        server_stack = AsyncExitStack()
        await server_stack.__aenter__()

        try:
            # Build mcp-use config for this server
            server_config: dict[str, Any] = {}

            if cfg.command:
                server_config["command"] = cfg.command
                server_config["args"] = cfg.args or []
                if cfg.env:
                    server_config["env"] = cfg.env
            elif cfg.url:
                server_config["url"] = cfg.url
                if cfg.headers:
                    server_config["headers"] = cfg.headers
                if cfg.auth is not None:
                    server_config["auth"] = cfg.auth
            else:
                logger.warning("MCP server '{}': no command or url configured, skipping", name)
                await server_stack.aclose()
                return name, None

            # Use mcp-use MCPClient for connection (handles OAuth, bearer, stdio)
            try:
                from mcp_use.client import MCPClient

                client = MCPClient(config={"mcpServers": {name: server_config}})
                session = await server_stack.enter_async_context(client.create_session(name))
                await session.initialize()
            except ImportError:
                # Fallback to raw mcp SDK if mcp-use not installed
                logger.debug("mcp-use not available, falling back to raw mcp SDK for '{}'", name)
                from mcp import ClientSession, StdioServerParameters
                from mcp.client.sse import sse_client
                from mcp.client.stdio import stdio_client
                from mcp.client.streamable_http import streamable_http_client

                if cfg.command:
                    params = StdioServerParameters(
                        command=cfg.command, args=cfg.args, env=cfg.env or None
                    )
                    read, write = await server_stack.enter_async_context(stdio_client(params))
                elif cfg.url and cfg.url.rstrip("/").endswith("/sse"):
                    read, write = await server_stack.enter_async_context(sse_client(cfg.url))
                else:
                    http_client = await server_stack.enter_async_context(
                        httpx.AsyncClient(headers=cfg.headers or None, follow_redirects=True, timeout=None)
                    )
                    read, write, _ = await server_stack.enter_async_context(
                        streamable_http_client(cfg.url, http_client=http_client)
                    )
                session = await server_stack.enter_async_context(ClientSession(read, write))
                await session.initialize()

            # Register tools
            tools = await session.list_tools()
            tool_list = tools.tools if hasattr(tools, "tools") else tools
            enabled_tools = set(cfg.enabled_tools)
            allow_all_tools = "*" in enabled_tools
            registered_count = 0
            matched_enabled: set[str] = set()

            for tool_def in tool_list:
                wrapped_name = f"mcp_{name}_{tool_def.name}"
                if not allow_all_tools and tool_def.name not in enabled_tools and wrapped_name not in enabled_tools:
                    continue
                wrapper = MCPToolWrapper(session, name, tool_def, tool_timeout=cfg.tool_timeout)
                registry.register(wrapper)
                registered_count += 1
                if tool_def.name in enabled_tools:
                    matched_enabled.add(tool_def.name)
                if wrapped_name in enabled_tools:
                    matched_enabled.add(wrapped_name)

            if enabled_tools and not allow_all_tools:
                unmatched = sorted(enabled_tools - matched_enabled)
                if unmatched:
                    logger.warning(
                        "MCP server '{}': enabledTools entries not found: {}",
                        name, ", ".join(unmatched),
                    )

            # Register resources
            try:
                resources = await session.list_resources()
                resource_list = resources.resources if hasattr(resources, "resources") else resources
                for resource in resource_list:
                    wrapper = MCPResourceWrapper(session, name, resource, resource_timeout=cfg.tool_timeout)
                    registry.register(wrapper)
                    registered_count += 1
            except Exception as e:
                logger.debug("MCP server '{}': resources not supported: {}", name, e)

            # Register prompts
            try:
                prompts = await session.list_prompts()
                prompt_list = prompts.prompts if hasattr(prompts, "prompts") else prompts
                for prompt in prompt_list:
                    wrapper = MCPPromptWrapper(session, name, prompt, prompt_timeout=cfg.tool_timeout)
                    registry.register(wrapper)
                    registered_count += 1
            except Exception as e:
                logger.debug("MCP server '{}': prompts not supported: {}", name, e)

            logger.info("MCP server '{}': connected, {} capabilities registered", name, registered_count)
            return name, server_stack

        except Exception as e:
            logger.error("MCP server '{}': failed to connect: {}", name, e)
            try:
                await server_stack.aclose()
            except Exception:
                pass
            return name, None

    server_stacks: dict[str, AsyncExitStack] = {}
    tasks = [asyncio.create_task(connect_single_server(name, cfg)) for name, cfg in mcp_servers.items()]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for i, result in enumerate(results):
        name = list(mcp_servers.keys())[i]
        if isinstance(result, BaseException):
            if not isinstance(result, asyncio.CancelledError):
                logger.error("MCP server '{}' connection task failed: {}", name, result)
        elif result is not None and result[1] is not None:
            server_stacks[result[0]] = result[1]

    return server_stacks

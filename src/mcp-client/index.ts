import WebSocket from 'ws';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
    {
        name: "cocos-inspector-bridge",
        version: "0.1.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// 工具注册
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "ping",
                description: "Test the connection to the Cocos Inspector Bridge",
                inputSchema: {
                    type: "object",
                    properties: {},
                    required: [],
                },
            },
            {
                name: "get_selected_node",
                description: "Query the currently selected node's properties (name, active state, position, size, and components) from Cocos Creator.",
                inputSchema: {
                    type: "object",
                    properties: {},
                    required: [],
                },
            },
            {
                name: "capture_runtime_screenshot",
                description: "Capture the real-time screen of the game, including game UI and rendering elements. Return it as an image.",
                inputSchema: {
                    type: "object",
                    properties: {},
                    required: [],
                },
            }
        ],
    };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "ping") {
        return await handlePing();
    } else if (request.params.name === "get_selected_node") {
        return await handleGetSelectedNode();
    } else if (request.params.name === "capture_runtime_screenshot") {
        return await handleCaptureScreenshot();
    }
    throw new Error(`Tool not found: ${request.params.name}`);
});

// 通过短连接发送请求给 WebSocket (4456)
function sendRpcToCocos(methodName: string): Promise<any> {
    return new Promise((resolve, reject) => {
        let isDone = false;
        const reqId = Date.now().toString();
        const ws = new WebSocket('ws://localhost:4456');

        const timeout = setTimeout(() => {
            if (!isDone) {
                isDone = true;
                ws.close();
                reject(new Error("Timeout: Cocos Bridge does not respond in time."));
            }
        }, 3000);

        ws.on('open', () => {
            if (methodName === 'ping') {
                ws.send(JSON.stringify({ type: 'ping', id: reqId }));
            } else {
                ws.send(JSON.stringify({ 
                    jsonrpc: "2.0",
                    method: 'tools/call', 
                    params: { name: methodName }, 
                    id: reqId 
                }));
            }
        });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (methodName === 'ping') {
                    if (msg.type === 'pong') {
                        isDone = true;
                        clearTimeout(timeout);
                        ws.close();
                        resolve({ type: 'pong' });
                    }
                } else {
                    // For JSON-RPC response from main.ts
                    if (msg.id === reqId && msg.jsonrpc === "2.0") {
                        isDone = true;
                        clearTimeout(timeout);
                        ws.close();
                        resolve(msg.result);
                    }
                }
            } catch (e: any) {
                // Ignore parsing errors of other broadcasts
            }
        });

        ws.on('error', (err) => {
            if (!isDone) {
                isDone = true;
                clearTimeout(timeout);
                reject(err);
            }
        });
    });
}

async function handlePing() {
    try {
        await sendRpcToCocos('ping');
        return {
            content: [
                {
                    type: "text",
                    text: "来自 Cocos 插件的响应：pong (MCP 协议已打通)",
                },
            ],
        };
    } catch (e: any) {
        return {
            isError: true,
            content: [{ type: "text", text: `Ping failed: ${e.message}` }],
        };
    }
}

async function handleGetSelectedNode() {
    try {
        const result = await sendRpcToCocos('get_selected_node');
        // result.content is already properly populated by main.ts
        if (result && result.content) {
            return {
                content: result.content
            };
        }
        return {
            isError: true,
            content: [{ type: "text", text: "Invalid response from Cocos plugin." }],
        };
    } catch (e: any) {
        let msg = e.message;
        if (msg.includes('ECONNREFUSED')) {
            msg = "无法连接到 Cocos Plugin 的底层 4456 端口，请确保相关项目在 Cocos 编辑器内已打开并且插件已正确加载！";
        }
        return {
            isError: true,
            content: [{ type: "text", text: `get_selected_node failed: ${msg}` }],
        };
    }
}

async function handleCaptureScreenshot() {
    try {
        const result = await sendRpcToCocos('capture_runtime_screenshot');
        if (result && result.content) {
            return {
                content: result.content
            };
        }
        return {
            isError: true,
            content: [{ type: "text", text: "Invalid response from Cocos plugin." }],
        };
    } catch (e: any) {
        let msg = e.message;
        if (msg.includes('ECONNREFUSED')) {
            msg = "无法连接到 Cocos Plugin 的底层 4456 端口，请确保相关项目在 Cocos 编辑器内已打开并且插件已正确加载！";
        }
        return {
            isError: true,
            content: [{ type: "text", text: `capture_runtime_screenshot failed: ${msg}` }],
        };
    }
}

async function runServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

runServer().catch(console.error);

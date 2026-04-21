/**
 * WebSocket server for Python-Node.js bridge communication.
 * Security: binds to 127.0.0.1 only; requires BRIDGE_TOKEN auth; rejects browser Origin headers.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { WhatsAppClient, InboundMessage, MessageKey } from './whatsapp.js';

interface SendCommand {
  type: 'send';
  to: string;
  text: string;
  reqId?: string;
}

interface SendMediaCommand {
  type: 'send_media';
  to: string;
  filePath: string;
  mimetype: string;
  caption?: string;
  fileName?: string;
  reqId?: string;
}

interface EditCommand {
  type: 'edit';
  to: string;
  key: MessageKey;
  text: string;
  reqId?: string;
}

type BridgeCommand = SendCommand | SendMediaCommand | EditCommand;

interface BridgeMessage {
  type: 'message' | 'status' | 'qr' | 'error';
  [key: string]: unknown;
}

export class BridgeServer {
  private wss: WebSocketServer | null = null;
  private wa: WhatsAppClient | null = null;
  private clients: Set<WebSocket> = new Set();

  constructor(private port: number, private authDir: string, private token: string) {}

  async start(): Promise<void> {
    if (!this.token.trim()) {
      throw new Error('BRIDGE_TOKEN is required');
    }

    // Bind to localhost only — never expose to external network
    this.wss = new WebSocketServer({
      host: '127.0.0.1',
      port: this.port,
      verifyClient: (info, done) => {
        const origin = info.origin || info.req.headers.origin;
        if (origin) {
          console.warn(`Rejected WebSocket connection with Origin header: ${origin}`);
          done(false, 403, 'Browser-originated WebSocket connections are not allowed');
          return;
        }
        done(true);
      },
    });
    console.log(`🌉 Bridge server listening on ws://127.0.0.1:${this.port}`);
    console.log('🔒 Token authentication enabled');

    // Initialize WhatsApp client
    this.wa = new WhatsAppClient({
      authDir: this.authDir,
      onMessage: (msg) => this.broadcast({ type: 'message', ...msg }),
      onQR: (qr) => this.broadcast({ type: 'qr', qr }),
      onStatus: (status) => this.broadcast({ type: 'status', status }),
    });

    // Handle WebSocket connections
    this.wss.on('connection', (ws) => {
      // Require auth handshake as first message
      const timeout = setTimeout(() => ws.close(4001, 'Auth timeout'), 5000);
      ws.once('message', (data) => {
        clearTimeout(timeout);
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth' && msg.token === this.token) {
            console.log('🔗 Python client authenticated');
            this.setupClient(ws);
          } else {
            ws.close(4003, 'Invalid token');
          }
        } catch {
          ws.close(4003, 'Invalid auth message');
        }
      });
    });

    // Connect to WhatsApp
    await this.wa.connect();
  }

  private setupClient(ws: WebSocket): void {
    this.clients.add(ws);

    ws.on('message', async (data) => {
      let cmd: BridgeCommand | undefined;
      try {
        cmd = JSON.parse(data.toString()) as BridgeCommand;
        const key = await this.handleCommand(cmd);
        const ack: Record<string, unknown> = { type: 'sent', to: cmd.to };
        if (cmd.reqId) ack.reqId = cmd.reqId;
        if (key) ack.key = key;
        ws.send(JSON.stringify(ack));
      } catch (error) {
        console.error('Error handling command:', error);
        const err: Record<string, unknown> = { type: 'error', error: String(error) };
        if (cmd?.reqId) err.reqId = cmd.reqId;
        ws.send(JSON.stringify(err));
      }
    });

    ws.on('close', () => {
      console.log('🔌 Python client disconnected');
      this.clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.clients.delete(ws);
    });
  }

  private async handleCommand(cmd: BridgeCommand): Promise<MessageKey | null> {
    if (!this.wa) return null;

    if (cmd.type === 'send') {
      return await this.wa.sendMessage(cmd.to, cmd.text);
    } else if (cmd.type === 'send_media') {
      await this.wa.sendMedia(cmd.to, cmd.filePath, cmd.mimetype, cmd.caption, cmd.fileName);
      return null;
    } else if (cmd.type === 'edit') {
      await this.wa.editMessage(cmd.to, cmd.key, cmd.text);
      return null;
    }
    return null;
  }

  private broadcast(msg: BridgeMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  async stop(): Promise<void> {
    // Close all client connections
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Disconnect WhatsApp
    if (this.wa) {
      await this.wa.disconnect();
      this.wa = null;
    }
  }
}

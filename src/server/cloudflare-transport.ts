import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export class CloudflareSseTransport implements Transport {
  private _controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private _encoder = new TextEncoder();
  private _sessionId: string;
  
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(sessionId: string) {
    this._sessionId = sessionId;
  }

  /**
   * Called by the Worker when the SSE stream is established.
   * This connects the ReadableStream controller to the transport.
   */
  startStream(controller: ReadableStreamDefaultController<Uint8Array>) {
    this._controller = controller;
    // Send the endpoint event so the client knows where to POST
    // The endpoint is relative to the worker URL
    const endpoint = `/message?sessionId=${this._sessionId}`;
    this.sendEvent('endpoint', endpoint);
  }

  async start(): Promise<void> {
    // The transport is "started" when the server connects to it.
    // However, we can't send anything until startStream is called.
    // Since the server waits for client messages (via handlePostMessage), this is fine.
  }

  async close(): Promise<void> {
    try {
        this._controller?.close();
    } catch {
        // Ignore if already closed
    }
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.sendEvent('message', JSON.stringify(message));
  }

  private sendEvent(event: string, data: string) {
      if (!this._controller) return;
      const str = `event: ${event}\ndata: ${data}\n\n`;
      this._controller.enqueue(this._encoder.encode(str));
  }

  /**
   * Handle an incoming POST message from the client.
   */
  async handlePostMessage(request: Request) {
      const body = await request.json() as JSONRPCMessage;
      if (this.onmessage) {
        this.onmessage(body);
      }
  }
}

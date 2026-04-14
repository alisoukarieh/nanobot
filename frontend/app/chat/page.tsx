"use client";

import { ChatPanel } from "@/components/ChatPanel";

export default function ChatPage() {
  // The nanobot API uses session key "api:default" for all requests.
  // The backend SessionManager writes messages to PocketBase under this key.
  // The ChatPanel loads history from PB by this key and sends via the API.
  return <ChatPanel sessionKey="api:default" />;
}

import type {
  AgentTrace,
  CatalogMatch,
  PendingReservationIntent,
} from '../types/commerce.ts';

export interface StreamCallbacks {
  onTraceUpdate?: (payload: {
    trace: AgentTrace;
    matches: CatalogMatch[];
    pendingReservation: PendingReservationIntent | null;
  }) => void;
  onToken?: (text: string) => void;
  onDone?: (payload: {
    reply: string;
    matches: CatalogMatch[];
    pendingReservation: PendingReservationIntent | null;
    trace: AgentTrace;
  }) => void;
}

export async function streamAgentChat(
  prompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  callbacks: StreamCallbacks,
): Promise<void> {
  const response = await fetch('/api/agent/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, history }),
  });

  if (!response.ok || !response.body) {
    let message = 'Agent stream request failed.';
    try {
      const errJson = (await response.json()) as { error?: string };
      if (errJson.error) message = errJson.error;
    } catch {
      // Ignore parse error
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processBlock = (block: string) => {
    const lines = block.split('\n');
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;
    const rawData = dataLines.join('\n');
    const parsed = JSON.parse(rawData) as Record<string, unknown>;

    if (eventName === 'trace_update') {
      callbacks.onTraceUpdate?.(
        parsed as {
          trace: AgentTrace;
          matches: CatalogMatch[];
          pendingReservation: PendingReservationIntent | null;
        },
      );
    } else if (eventName === 'token') {
      callbacks.onToken?.(String(parsed.text ?? ''));
    } else if (eventName === 'done') {
      callbacks.onDone?.(
        parsed as {
          reply: string;
          matches: CatalogMatch[];
          pendingReservation: PendingReservationIntent | null;
          trace: AgentTrace;
        },
      );
    } else if (eventName === 'error') {
      throw new Error(String(parsed.error ?? 'Unexpected stream error.'));
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const block = buffer.slice(0, separatorIndex).trim();
      buffer = buffer.slice(separatorIndex + 2);
      if (block) {
        processBlock(block);
      }
      separatorIndex = buffer.indexOf('\n\n');
    }
  }

  if (buffer.trim()) {
    processBlock(buffer.trim());
  }
}

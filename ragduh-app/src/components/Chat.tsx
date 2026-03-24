import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../api/client";
import { sendMessage } from "../api/client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { ALL_LLM_MODELS, ALL_RERANKER_MODELS } from "../config";

interface ChatProps {
  namespaceId: string;
  onError: (error: string) => void;
}

export function Chat({ namespaceId, onError }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState<{ id: string; text: string; score: number }[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [topK, setTopK] = useState(10);
  const [rerank, setRerank] = useState(true);
  const [rerankModel, setRerankModel] = useState("");
  const [llmModel, setLlmModel] = useState("");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setSources([]);
    setStreamingMessage("");

    try {
      const stream = await sendMessage(namespaceId, newMessages, {
        mode: "normal",
        topK,
        rerank,
        rerankModel: rerank ? rerankModel || undefined : undefined,
        llmModel: llmModel || undefined,
      });

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete SSE messages (separated by \n\n)
        const messages = buffer.split("\n\n");
        buffer = messages.pop() || "";

        for (const message of messages) {
          const lines = message.split("\n").filter(line => line.trim());
          let eventType = "";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ")) {
              dataStr = line.slice(6);
            }
          }

          if (!dataStr || dataStr === "[DONE]") continue;

          try {
            const data = JSON.parse(dataStr);

            if (eventType === "data-sources" && data.results) {
              setSources(data.results);
            } else if (eventType === "text-delta" && data.delta) {
              assistantContent += data.delta;
              setStreamingMessage(assistantContent);
            }
          } catch (e) {
            console.error("Error parsing SSE data:", e);
          }
        }
      }

      if (assistantContent) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: assistantContent },
        ]);
      }
      setStreamingMessage("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to send message");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="h-[calc(100vh-200px)] min-h-[500px] flex flex-col overflow-hidden">
      <div className="border-b p-3 bg-muted/30 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">TopK:</span>
            <Input
              type="number"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              min={1}
              max={50}
              className="w-14 h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1">
            <Switch checked={rerank} onCheckedChange={setRerank} id="rerank" className="scale-75" />
            <label htmlFor="rerank" className="text-xs">重排序</label>
          </div>
          <Select value={rerankModel} onValueChange={(v) => setRerankModel(v || '')} disabled={!rerank}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="重排序模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">自动</SelectItem>
              {ALL_RERANKER_MODELS.map((m) => (
                <SelectItem key={m.model} value={m.model}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={llmModel} onValueChange={(v) => setLlmModel(v || '')}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="LLM 模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">自动</SelectItem>
              {ALL_LLM_MODELS.map((m) => (
                <SelectItem key={m.model} value={m.model}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">暂无消息</p>
            <p className="text-xs mt-2 text-muted-foreground">开始与您的文档对话</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={`${msg.role}-${idx}-${msg.content.slice(0, 20)}`} className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}>
            <div className="w-8 h-8 rounded-full bg-secondary border flex items-center justify-center flex-shrink-0 text-lg">
              {msg.role === "user" ? "👤" : "🤖"}
            </div>
            <div className={`p-3 rounded-lg max-w-full ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-lg rounded-bl-lg rounded-br-sm' : 'bg-secondary border rounded-tl-lg rounded-br-lg rounded-bl-sm'}`}>
              <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</div>
            </div>
          </div>
        ))}

        {streamingMessage && (
          <div className="flex gap-3 max-w-[85%] self-start">
            <div className="w-8 h-8 rounded-full bg-secondary border flex items-center justify-center flex-shrink-0 text-lg">🤖</div>
            <div className="p-3 rounded-lg bg-secondary border max-w-full rounded-tl-lg rounded-br-lg rounded-bl-sm">
              <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{streamingMessage}</div>
            </div>
          </div>
        )}

        {isLoading && !streamingMessage && (
          <div className="flex gap-3 max-w-[85%] self-start">
            <div className="w-8 h-8 rounded-full bg-secondary border flex items-center justify-center flex-shrink-0 text-lg">🤖</div>
            <div className="p-3 rounded-lg bg-secondary border rounded-tl-lg rounded-br-lg rounded-bl-sm">
              <div className="text-sm">思考中...</div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {sources.length > 0 && (
        <div className="border-t p-4 bg-muted/50">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">来源</h4>
          <div className="flex flex-col gap-2 max-h-36 overflow-y-auto">
            {sources.map((source) => (
              <div key={source.id} className="flex gap-2 p-2.5 bg-background border rounded-md text-xs">
                <span className="text-primary font-semibold flex-shrink-0">[{(source.score * 100).toFixed(0)}%]</span>
                <span className="text-muted-foreground leading-relaxed">{source.text.slice(0, 200)}{source.text.length > 200 ? "..." : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t p-4 flex gap-3 bg-background">
        <Input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="询问关于您的文档的问题..."
          disabled={isLoading}
          className="flex-1"
        />
        <Button type="submit" disabled={isLoading || !input.trim()}>
          {isLoading ? "发送中..." : "发送"}
        </Button>
      </form>
    </Card>
  );
}

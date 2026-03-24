"use client";

import * as React from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { getDocumentChunks, type DocumentChunk } from "@/api/client";

interface DocumentChunksProps {
  namespaceId: string;
  documentId: string;
  onClose: () => void;
}

export function DocumentChunks({
  namespaceId,
  documentId,
  onClose,
}: DocumentChunksProps) {
  const [chunks, setChunks] = React.useState<DocumentChunk[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedChunk, setExpandedChunk] = React.useState<number | null>(null);

  React.useEffect(() => {
    setIsLoading(true);
    setError(null);
    getDocumentChunks(namespaceId, documentId)
      .then((data) => {
        setChunks(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "加载分块失败");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [namespaceId, documentId]);

  const toggleChunk = (index: number) => {
    setExpandedChunk(expandedChunk === index ? null : index);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="border-b p-4 flex items-center justify-between bg-muted/50">
          <div>
            <h3 className="text-lg font-semibold">文档分块</h3>
            <p className="text-sm text-muted-foreground">
              共 {chunks.length} 个分块
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-muted-foreground">正在加载分块...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-destructive">{error}</div>
            </div>
          ) : chunks.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-muted-foreground">暂无分块</div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {chunks.map((chunk, idx) => (
                <div
                  key={chunk.id}
                  className="border rounded-md overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleChunk(idx)}
                    className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                        #{chunk.sequence_number}
                      </span>
                      <span className="text-sm font-medium">
                        分块 {chunk.sequence_number + 1}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {chunk.text.length} 字符
                    </span>
                  </button>
                  {expandedChunk === idx && (
                    <div className="p-3 border-t bg-background">
                      <pre className="text-sm text-muted-foreground whitespace-pre-wrap break-words font-sans">
                        {chunk.text}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

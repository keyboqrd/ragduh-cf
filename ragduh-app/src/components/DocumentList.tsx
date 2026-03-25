import { useEffect, useState } from "react";
import {
  listDocuments,
  deleteDocument,
  type Document,
  type PaginationResult,
} from "../api/client";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { DocumentChunks } from "./DocumentChunks";

interface DocumentListProps {
  namespaceId: string;
  onError: (error: string) => void;
}

export function DocumentList({ namespaceId, onError }: DocumentListProps) {
  const [documents, setDocuments] = useState<PaginationResult<Document> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [viewingChunksDocId, setViewingChunksDocId] = useState<string | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<{ id: string; name: string } | null>(null);

  const loadDocuments = async (cursor?: string) => {
    setIsLoading(true);
    try {
      const result = await listDocuments(namespaceId, {
        cursor,
        limit: 20,
        orderBy: "createdAt",
        order: "desc",
      });
      setDocuments(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : "加载文档失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [namespaceId]);

  const handleDelete = async (documentId: string, documentName: string) => {
    setDeletingDoc({ id: documentId, name: documentName });
  };

  const confirmDelete = async () => {
    if (!deletingDoc) return;

    setDeletingIds((prev) => new Set(prev).add(deletingDoc.id));
    try {
      await deleteDocument(namespaceId, deletingDoc.id);
      await loadDocuments();
      setDeletingDoc(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "删除文档失败");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(deletingDoc.id);
        return next;
      });
    }
  };

  const handleNext = () => {
    if (documents?.pagination.nextCursor) {
      loadDocuments(documents.pagination.nextCursor);
    }
  };

  const handlePrev = () => {
    if (documents?.pagination.prevCursor) {
      loadDocuments(documents.pagination.prevCursor);
    }
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "COMPLETED":
        return "default";
      case "FAILED":
        return "destructive";
      case "PROCESSING":
      case "QUEUED":
      case "PRE_PROCESSING":
      case "QUEUED_FOR_RESYNC":
        return "secondary";
      case "QUEUED_FOR_DELETE":
      case "DELETING":
        return "outline";
      default:
        return "outline";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">文档</h2>
        <Button variant="outline" size="sm" onClick={() => loadDocuments()} disabled={isLoading}>
          {isLoading ? '加载中...' : '刷新'}
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            正在加载文档...
          </CardContent>
        </Card>
      ) : documents?.data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>暂无文档</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-64">名称</TableHead>
                  <TableHead className="w-28">状态</TableHead>
                  <TableHead className="w-20">分块数</TableHead>
                  <TableHead className="w-24">令牌数</TableHead>
                  <TableHead className="w-20">页数</TableHead>
                  <TableHead className="w-28">创建时间</TableHead>
                  <TableHead className="w-48">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents?.data.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium truncate w-64">
                      <div className="flex flex-col gap-1">
                        <span className="truncate">{doc.name}</span>
                        {doc.source?.type === "R2" && (
                          <Badge variant="outline" className="w-fit text-[10px] py-0 px-1 border-primary/30 text-primary/70">
                            R2 Stored
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="w-28">
                      <Badge variant={getStatusVariant(doc.status)}>{doc.status}</Badge>
                    </TableCell>
                    <TableCell className="w-20">{doc.totalChunks}</TableCell>
                    <TableCell className="w-24">{doc.totalTokens.toLocaleString()}</TableCell>
                    <TableCell className="w-20">{doc.totalPages}</TableCell>
                    <TableCell className="w-28">{new Date(doc.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="w-48">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewingChunksDocId(doc.id)}
                          disabled={doc.totalChunks === 0}
                        >
                          {doc.totalChunks === 0 ? "无分块" : "查看分块"}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(doc.id, doc.name || "此文档")}
                          disabled={deletingIds.has(doc.id)}
                        >
                          {deletingIds.has(doc.id) ? "删除中..." : "删除"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={!documents?.pagination.prevCursor}
            >
              上一页
            </Button>
            <span className="text-sm text-muted-foreground">
              {documents?.data.length || 0} 个文档
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={!documents?.pagination.hasMore}
            >
              下一页
            </Button>
          </div>
        </>
      )}

      {viewingChunksDocId && (
        <DocumentChunks
          namespaceId={namespaceId}
          documentId={viewingChunksDocId}
          onClose={() => setViewingChunksDocId(null)}
        />
      )}

      {deletingDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardContent className="p-6 flex flex-col gap-4">
              <h3 className="text-lg font-semibold">删除文档</h3>
              <p className="text-sm text-muted-foreground">
                确定要删除 "<span className="font-medium">{deletingDoc.name}</span>" 吗？
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setDeletingDoc(null)}>
                  取消
                </Button>
                <Button variant="destructive" size="sm" onClick={confirmDelete}>
                  删除
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

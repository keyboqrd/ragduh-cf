import { useEffect, useState } from "react";
import {
  listIngestJobs,
  deleteIngestJob,
  type IngestJobWithNamespace,
  type PaginationResult,
} from "../api/client";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

interface JobListProps {
  namespaceId: string;
  onViewDocuments: () => void;
  onError: (error: string) => void;
}

export function JobList({
  namespaceId,
  onViewDocuments,
  onError,
}: JobListProps) {
  const [jobs, setJobs] = useState<PaginationResult<IngestJobWithNamespace> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [deletingJob, setDeletingJob] = useState<{ id: string; name: string } | null>(null);

  const loadJobs = async (cursor?: string) => {
    setIsLoading(true);
    try {
      const result = await listIngestJobs(namespaceId, {
        cursor,
        limit: 20,
        orderBy: "createdAt",
        order: "desc",
      });
      setJobs(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : "加载任务失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [namespaceId]);

  const handleDelete = async (jobId: string, jobName: string) => {
    setDeletingJob({ id: jobId, name: jobName });
  };

  const confirmDelete = async () => {
    if (!deletingJob) return;

    setDeletingIds((prev) => new Set(prev).add(deletingJob.id));
    try {
      await deleteIngestJob(namespaceId, deletingJob.id);
      await loadJobs();
      setDeletingJob(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "删除任务失败");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(deletingJob.id);
        return next;
      });
    }
  };

  const handleNext = () => {
    if (jobs?.pagination.nextCursor) {
      loadJobs(jobs.pagination.nextCursor);
    }
  };

  const handlePrev = () => {
    if (jobs?.pagination.prevCursor) {
      loadJobs(jobs.pagination.prevCursor);
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
      case "QUEUED_FOR_DELETE":
      case "DELETING":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-semibold">导入任务</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadJobs()} disabled={isLoading}>
            {isLoading ? '加载中...' : '刷新'}
          </Button>
          <Button variant="outline" size="sm" onClick={onViewDocuments}>
            查看文档
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            正在加载任务...
          </CardContent>
        </Card>
      ) : jobs?.data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>暂无导入任务</p>
            <p className="text-xs mt-2 text-muted-foreground">创建一个任务以开始</p>
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
                  <TableHead className="w-28">创建时间</TableHead>
                  <TableHead className="w-28">完成时间</TableHead>
                  <TableHead className="w-48">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs?.data.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium w-64">{job.name || "未命名任务"}</TableCell>
                    <TableCell className="w-28">
                      <Badge variant={getStatusVariant(job.status)}>{job.status}</Badge>
                    </TableCell>
                    <TableCell className="w-28">{new Date(job.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="w-28">
                      {job.completedAt
                        ? new Date(job.completedAt).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell className="w-48">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(job.id, job.name || "此任务")}
                        disabled={deletingIds.has(job.id)}
                      >
                        {deletingIds.has(job.id) ? "删除中..." : "删除"}
                      </Button>
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
              disabled={!jobs?.pagination.prevCursor}
            >
              上一页
            </Button>
            <span className="text-sm text-muted-foreground">
              {jobs?.data.length || 0} 个任务
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={!jobs?.pagination.hasMore}
            >
              下一页
            </Button>
          </div>
        </>
      )}

      {deletingJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardContent className="p-6 flex flex-col gap-4">
              <h3 className="text-lg font-semibold">删除任务</h3>
              <p className="text-sm text-muted-foreground">
                确定要删除 "<span className="font-medium">{deletingJob.name}</span>" 及其所有文档吗？
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setDeletingJob(null)}>
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

import { useEffect, useState } from "react";
import { getIngestJob, type IngestJob } from "../api/client";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

interface JobStatusProps {
  job: IngestJob;
  onBack: () => void;
}

export function JobStatus({ job: initialJob, onBack }: JobStatusProps) {
  const [job, setJob] = useState<IngestJob>(initialJob);

  useEffect(() => {
    // Poll for job status updates
    const interval = setInterval(async () => {
      if (job.status === "COMPLETED" || job.status === "FAILED") {
        return;
      }

      try {
        const updated = await getIngestJob(job.id);
        setJob(updated);
      } catch (err) {
        console.error("Failed to fetch job status:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [job.id, job.status]);

  const getStatusColor = () => {
    switch (job.status) {
      case "COMPLETED":
        return "bg-success/10 text-success border-success/30";
      case "FAILED":
        return "bg-destructive/10 text-destructive border-destructive/30";
      case "PROCESSING":
      case "QUEUED":
      case "PRE_PROCESSING":
        return "bg-warning/10 text-warning border-warning/30";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="flex flex-col gap-6 items-center">
      <h2 className="text-xl font-semibold">任务状态</h2>

      <Card className="w-full">
        <CardContent className="p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full animate-pulse ${job.status === "COMPLETED" ? "bg-success" : job.status === "FAILED" ? "bg-destructive" : "bg-warning"}`} />
            <Badge variant="outline" className={getStatusColor()}>
              {job.status}
            </Badge>
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <p>
              <strong className="text-muted-foreground">任务 ID:</strong>{" "}
              <code className="bg-muted px-2 py-1 rounded ml-2">{job.id}</code>
            </p>
            <p>
              <strong className="text-muted-foreground">创建时间:</strong>{" "}
              <span className="ml-2">{new Date(job.createdAt).toLocaleString()}</span>
            </p>
            {job.completedAt && (
              <p>
                <strong className="text-muted-foreground">完成时间:</strong>{" "}
                <span className="ml-2">{new Date(job.completedAt).toLocaleString()}</span>
              </p>
            )}
            {job.failedAt && (
              <p>
                <strong className="text-muted-foreground">失败时间:</strong>{" "}
                <span className="ml-2">{new Date(job.failedAt).toLocaleString()}</span>
              </p>
            )}
            {job.error && (
              <p className="text-destructive bg-destructive/10 p-3 rounded-md mt-2">
                <strong>错误:</strong> {job.error}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={onBack}>
        导入另一个文件
      </Button>
    </div>
  );
}

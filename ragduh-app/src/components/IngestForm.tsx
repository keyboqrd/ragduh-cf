import { useState } from "react";
import { createBatchIngestJob, type IngestJob } from "../api/client";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface IngestFormProps {
  namespaceId: string;
  onJobCreated: (job: IngestJob) => void;
  onError: (error: string) => void;
}

export function IngestForm({ namespaceId, onJobCreated, onError }: IngestFormProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [jobName, setJobName] = useState("");
  const [chunkSize, setChunkSize] = useState(2048);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedFiles.length === 0) {
      onError("请至少选择一个文件");
      return;
    }

    if (selectedFiles.length > 100) {
      onError("每批次最多允许 100 个文件");
      return;
    }

    setIsSubmitting(true);

    try {
      const job = await createBatchIngestJob(namespaceId, selectedFiles, chunkSize, jobName || undefined);
      onJobCreated(job);
      setSelectedFiles([]);
      setJobName("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "创建任务失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(Array.from(files));
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardContent className="p-6 flex flex-col gap-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="jobName">任务名称（可选）</Label>
            <Input
              id="jobName"
              type="text"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="我的任务"
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="file">代码和文本文件（最多 100 个）</Label>
            <input
              type="file"
              id="file"
              accept=".txt,.md,.ts,.tsx,.js,.jsx,.html,.css,.json,.py,.java,.cs,.cpp,.hpp,.c,.h,.go,.rs,.rb,.php,.swift,.kt,.vue,.svelte,.yaml,.yml,.toml,.xml,.sql,.sh,.bash,.zsh,.fish,.ps1,.bat,.cmd,.ini,.cfg,.conf,.env,.gitignore,.dockerignore,.makefile,.cmake,.gradle,.maven,.pubspec,.cargo,.npmrc,.editorconfig,.eslintignore,.prettierignore,.tsconfig,.jsconfig"
              onChange={handleFileChange}
              multiple
              required
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-white hover:file:bg-accent-hover cursor-pointer"
            />
            {selectedFiles.length > 0 && (
              <div className="flex flex-col gap-1 mt-2">
                <p className="text-xs text-muted-foreground">
                  已选择 {selectedFiles.length} 个文件
                </p>
                <div className="max-h-32 overflow-y-auto flex flex-col gap-1">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-2 text-xs bg-muted px-2 py-1 rounded"
                    >
                      <span className="truncate flex-1">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(index)}
                        className="text-muted-foreground hover:text-destructive flex-shrink-0"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="chunkSize">分块大小（令牌数）</Label>
            <Input
              id="chunkSize"
              type="number"
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
              min={256}
              max={8192}
              step={256}
              className="w-32"
            />
          </div>

          <Button type="submit" disabled={isSubmitting || selectedFiles.length === 0}>
            {isSubmitting ? "处理中..." : `导入 ${selectedFiles.length > 1 ? `${selectedFiles.length} 个文件` : "文件"}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

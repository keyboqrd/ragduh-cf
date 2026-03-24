import { StorageService } from "../services/storage";
import { createAppServices } from "../services/app";
import type { Env } from "../config";

export interface DeleteJobMessage {
  type: "DELETE_INGEST_JOB" | "DELETE_DOCUMENT";
  jobId?: string;
  documentId?: string;
  namespaceId: string;
}

export async function processDeleteJob(
  message: DeleteJobMessage,
  env: Env
): Promise<void> {
  const { storage } = createAppServices(env);

  try {
    if (message.type === "DELETE_INGEST_JOB" && message.jobId) {
      console.log(`[Delete Job ${message.jobId}] Starting deletion...`);

      const result = await storage.executeDeleteIngestJob(
        message.jobId,
        message.namespaceId
      );

      if (result) {
        console.log(`[Delete Job ${message.jobId}] Completed successfully`);
      } else {
        console.warn(`[Delete Job ${message.jobId}] Job not found`);
      }
    } else if (message.type === "DELETE_DOCUMENT" && message.documentId) {
      console.log(`[Delete Document ${message.documentId}] Starting deletion...`);

      const result = await storage.executeDeleteDocument(
        message.documentId,
        message.namespaceId
      );

      if (result) {
        console.log(`[Delete Document ${message.documentId}] Completed successfully`);
      } else {
        console.warn(`[Delete Document ${message.documentId}] Document not found`);
      }
    } else {
      throw new Error("Invalid delete message");
    }
  } catch (error) {
    console.error(`[Delete] Failed:`, error);
    throw error;
  } finally {
    await storage.cleanup();
  }
}

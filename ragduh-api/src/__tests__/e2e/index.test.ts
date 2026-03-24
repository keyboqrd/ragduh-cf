// E2E Ragduh API Tests - Main Entry Point

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  API_BASE_URL,
  TEST_DOCUMENT_ID,
  clearAllE2EResources,
  purgeQueue,
} from "./setup";
import { testCreateNamespace, testGetNamespace } from "./namespace.test";
import {
  createIngestJob,
  waitForJobCompletion,
  verifyDocumentsCreated,
  verifyDocumentInD1,
  verifyDocumentChunksInD1,
} from "./ingest.test";
import { testVerifyVectorsInVectorize } from "./vectorize.test";
import { testChatQuery, testGetDocumentChunks } from "./chat.test";
import {
  testDeleteIngestJob,
  testVerifyDocumentsDeleted,
  testVerifyVectorsDeleted,
  testVerifyDocumentDeletedFromD1,
  testVerifyChunksDeletedFromD1,
  testDeleteNamespace,
  testVerifyNamespaceNotFound,
} from "./cleanup.test";

describe("E2E Ragduh API Tests", () => {
  let createdNamespaceId: string;
  let createdJobId: string;
  let createdDocumentId: string;

  beforeAll(async () => {
    console.log(`Running E2E tests against: ${API_BASE_URL}`);
    console.log(`Test Document ID: ${TEST_DOCUMENT_ID}`);

    // Clear all E2E resources before tests
    console.log("Clearing all E2E test resources before tests...");
    await clearAllE2EResources();
    await purgeQueue();
  });

  afterAll(async () => {
    console.log("Cleaning up E2E test resources...");
    console.log("E2E tests completed");
  });

  describe("Namespace Management", () => {
    it("should create a new namespace", async () => {
      createdNamespaceId = await testCreateNamespace();
      expect(createdNamespaceId).toBeDefined();
    });

    it("should retrieve the created namespace", async () => {
      await testGetNamespace(createdNamespaceId);
    });
  });

  describe("Document Ingestion", () => {
    it("should create an ingest job with TEXT payload", async () => {
      createdJobId = await createIngestJob(createdNamespaceId);
      expect(createdJobId).toBeDefined();
    });

    it("should process the ingest job and complete successfully", async () => {
      await waitForJobCompletion(createdJobId);
    });

    it("should have created documents with chunks", async () => {
      createdDocumentId = await verifyDocumentsCreated(createdNamespaceId, createdJobId);
      expect(createdDocumentId).toBeDefined();
    });

    it("should verify document in D1 database", async () => {
      await verifyDocumentInD1(createdDocumentId);
    });

    it("should verify document chunks in D1", async () => {
      await verifyDocumentChunksInD1(createdDocumentId);
    });
  });

  describe("Vectorize", () => {
    it("should verify vectors in Vectorize", async () => {
      await testVerifyVectorsInVectorize(createdNamespaceId, createdDocumentId);
    });
  });

  describe("Chat with Context", () => {
    it("should answer questions based on ingested content", async () => {
      await testChatQuery(createdNamespaceId, createdDocumentId);
    });

    it("should retrieve correct document chunks", async () => {
      await testGetDocumentChunks(createdNamespaceId, createdDocumentId);
    });
  });

  describe("Cleanup - Delete Ingest Job", () => {
    it("should delete the ingest job and all its documents", async () => {
      await testDeleteIngestJob(createdNamespaceId, createdJobId);
    });

    it("should have removed documents after deletion completes", async () => {
      await testVerifyDocumentsDeleted(createdNamespaceId, createdJobId);
    });

    it("should verify vectors are deleted from Vectorize", async () => {
      await testVerifyVectorsDeleted(createdDocumentId);
    });

    it("should verify document is deleted from D1", async () => {
      await testVerifyDocumentDeletedFromD1(createdDocumentId);
    });

    it("should verify chunks are deleted from D1", async () => {
      await testVerifyChunksDeletedFromD1(createdDocumentId);
    });
  });

  describe("Cleanup - Delete Namespace", () => {
    it("should delete the namespace", async () => {
      await testDeleteNamespace(createdNamespaceId);
    });

    it("should not find the deleted namespace", async () => {
      await testVerifyNamespaceNotFound(createdNamespaceId);
    });
  });
});

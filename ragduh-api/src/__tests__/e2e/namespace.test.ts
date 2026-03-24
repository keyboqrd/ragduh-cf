// Namespace Management Tests

import { API_BASE_URL, E2E_API_KEY, E2E_NAMESPACE_NAME, E2E_NAMESPACE_SLUG } from "./setup";

export interface NamespaceTestResult {
  createdNamespaceId: string;
}

/**
 * Test: Create namespace
 */
export async function testCreateNamespace(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/namespaces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${E2E_API_KEY}`,
    },
    body: JSON.stringify({
      name: E2E_NAMESPACE_NAME,
      slug: E2E_NAMESPACE_SLUG,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create namespace: ${response.statusText}`);
  }

  const data = await response.json() as any;

  if (!data.data) {
    throw new Error("Response data should exist");
  }
  if (data.data.name !== E2E_NAMESPACE_NAME) {
    throw new Error("Namespace name mismatch");
  }
  if (data.data.slug !== E2E_NAMESPACE_SLUG) {
    throw new Error("Namespace slug mismatch");
  }
  if (!data.data.id) {
    throw new Error("Namespace ID should be defined");
  }

  console.log(`Created namespace: ${data.data.id}`);
  return data.data.id;
}

/**
 * Test: Retrieve namespace
 */
export async function testGetNamespace(createdNamespaceId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/namespaces/${createdNamespaceId}`, {
    headers: {
      "Authorization": `Bearer ${E2E_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get namespace: ${response.statusText}`);
  }

  const data = await response.json() as any;

  if (data.data.id !== createdNamespaceId) {
    throw new Error("Namespace ID mismatch");
  }
  if (data.data.name !== E2E_NAMESPACE_NAME) {
    throw new Error("Namespace name mismatch");
  }

  console.log(`Retrieved namespace: ${createdNamespaceId}`);
}

/**
 * Run all namespace tests (for backward compatibility)
 */
export async function runNamespaceTests(): Promise<NamespaceTestResult> {
  const createdNamespaceId = await testCreateNamespace();
  await testGetNamespace(createdNamespaceId);
  return { createdNamespaceId };
}

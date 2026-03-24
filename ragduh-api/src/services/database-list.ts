import { DatabaseService } from "./database";

interface ListParams {
  namespaceId: string;
  cursor?: string;
  limit: number;
  ingestJobId?: string;
  statuses?: string[];
  orderBy: "createdAt" | "updatedAt";
  order: "asc" | "desc";
}

interface ListResult {
  data: any[];
  pagination: {
    limit: number;
    hasMore: boolean;
    startCursor: string | null;
    endCursor: string | null;
    nextCursor: string | null;
    prevCursor: string | null;
  };
}

/**
 * List ingest jobs with pagination
 */
export async function listIngestJobs(
  db: DatabaseService,
  params: ListParams
): Promise<ListResult> {
  const {
    namespaceId,
    cursor,
    limit,
    ingestJobId,
    statuses,
    orderBy,
    order,
  } = params;

  const isBackward = cursor?.startsWith("before_");
  const actualCursor = cursor?.replace(/^before_/, "").replace(/^after_/, "") || undefined;
  const actualOrder = isBackward ? (order === "asc" ? "desc" : "asc") : order;
  const actualLimit = limit + 1;

  // Build SQL query
  let sql = "SELECT * FROM ingest_job WHERE namespaceId = ?";
  const binds: any[] = [namespaceId];

  if (ingestJobId) {
    sql += " AND id = ?";
    binds.push(ingestJobId);
  }

  if (statuses && statuses.length > 0) {
    sql += ` AND status IN (${statuses.map(() => "?").join(", ")})`;
    binds.push(...statuses);
  }

  if (actualCursor) {
    const operator = actualOrder === "asc" ? ">" : "<";
    sql += ` AND ${orderBy} ${operator} ?`;
    binds.push(actualCursor);
  }

  sql += ` ORDER BY ${orderBy} ${actualOrder === "asc" ? "ASC" : "DESC"} LIMIT ?`;
  binds.push(actualLimit);

  const { results } = await db.db.prepare(sql).bind(...binds).all<any>();

  let hasMore = (results?.length || 0) > limit;
  let data = hasMore ? results!.slice(0, limit) : results || [];

  if (isBackward) {
    data = data.reverse();
  }

  const startCursor = data.length > 0 ? (data[0] as any)[orderBy] : null;
  const endCursor = data.length > 0 ? (data[data.length - 1] as any)[orderBy] : null;

  // Parse JSON fields
  data = data.map((row: any) => ({
    ...row,
    payload: row.payload ? JSON.parse(row.payload) : null,
    config: row.config ? JSON.parse(row.config) : null,
  }));

  return {
    data,
    pagination: {
      limit,
      hasMore,
      startCursor,
      endCursor,
      nextCursor: hasMore && !isBackward ? endCursor : null,
      prevCursor: hasMore && isBackward ? startCursor : null,
    },
  };
}

/**
 * List documents with pagination
 */
export async function listDocuments(
  db: DatabaseService,
  params: ListParams
): Promise<ListResult> {
  const {
    namespaceId,
    cursor,
    limit,
    ingestJobId,
    statuses,
    orderBy,
    order,
  } = params;

  const isBackward = cursor?.startsWith("before_");
  const actualCursor = cursor?.replace(/^before_/, "").replace(/^after_/, "") || undefined;
  const actualOrder = isBackward ? (order === "asc" ? "desc" : "asc") : order;
  const actualLimit = limit + 1;

  // Build SQL query
  let sql = "SELECT * FROM document WHERE namespaceId = ?";
  const binds: any[] = [namespaceId];

  if (ingestJobId) {
    sql += " AND ingestJobId = ?";
    binds.push(ingestJobId);
  }

  if (statuses && statuses.length > 0) {
    sql += ` AND status IN (${statuses.map(() => "?").join(", ")})`;
    binds.push(...statuses);
  }

  if (actualCursor) {
    const operator = actualOrder === "asc" ? ">" : "<";
    sql += ` AND ${orderBy} ${operator} ?`;
    binds.push(actualCursor);
  }

  sql += ` ORDER BY ${orderBy} ${actualOrder === "asc" ? "ASC" : "DESC"} LIMIT ?`;
  binds.push(actualLimit);

  const { results } = await db.db.prepare(sql).bind(...binds).all<any>();

  let hasMore = (results?.length || 0) > limit;
  let data = hasMore ? results!.slice(0, limit) : results || [];

  if (isBackward) {
    data = data.reverse();
  }

  const startCursor = data.length > 0 ? (data[0] as any)[orderBy] : null;
  const endCursor = data.length > 0 ? (data[data.length - 1] as any)[orderBy] : null;

  // Parse JSON fields
  data = data.map((row: any) => ({
    ...row,
    source: row.source ? JSON.parse(row.source) : null,
    config: row.config ? JSON.parse(row.config) : null,
    documentProperties: row.documentProperties ? JSON.parse(row.documentProperties) : null,
  }));

  return {
    data,
    pagination: {
      limit,
      hasMore,
      startCursor,
      endCursor,
      nextCursor: hasMore && !isBackward ? endCursor : null,
      prevCursor: hasMore && isBackward ? startCursor : null,
    },
  };
}

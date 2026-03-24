"use client";

import * as React from "react";
import { listNamespaces, createNamespace, updateNamespace, deleteNamespace, type Namespace } from "@/api/client";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface NamespaceListProps {
  onSelect: (namespaceId: string, namespaceName: string | null) => void;
  onError: (error: string) => void;
}

export function NamespaceList({ onSelect, onError }: NamespaceListProps) {
  const [namespaces, setNamespaces] = React.useState<Namespace[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isCreating, setIsCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editSlug, setEditSlug] = React.useState("");

  // Create form state
  const [createName, setCreateName] = React.useState("");
  const [createSlug, setCreateSlug] = React.useState("");

  React.useEffect(() => {
    loadNamespaces();
  }, []);

  const loadNamespaces = async () => {
    setIsLoading(true);
    try {
      const data = await listNamespaces();
      setNamespaces(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "加载命名空间失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createSlug.trim()) {
      onError("名称和标识不能为空");
      return;
    }

    try {
      await createNamespace(createName.trim(), createSlug.trim());
      setCreateName("");
      setCreateSlug("");
      setIsCreating(false);
      loadNamespaces();
    } catch (err) {
      onError(err instanceof Error ? err.message : "创建命名空间失败");
    }
  };

  const handleStartEdit = (namespace: Namespace) => {
    setEditingId(namespace.id);
    setEditName(namespace.name || "");
    setEditSlug(namespace.slug || "");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditSlug("");
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await updateNamespace(id, editName.trim() || undefined, editSlug.trim() || undefined);
      setEditingId(null);
      setEditName("");
      setEditSlug("");
      loadNamespaces();
    } catch (err) {
      onError(err instanceof Error ? err.message : "更新命名空间失败");
    }
  };

  const handleDelete = async (id: string, name: string | null) => {
    const confirmName = name || id;
    if (!confirm(`确定要删除 "${confirmName}" 吗？`)) {
      return;
    }

    try {
      await deleteNamespace(id);
      loadNamespaces();
    } catch (err) {
      onError(err instanceof Error ? err.message : "删除命名空间失败");
    }
  };

  const handleSelect = (namespace: Namespace) => {
    onSelect(namespace.id, namespace.name);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">正在加载命名空间...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">命名空间</h2>
        <Button onClick={() => setIsCreating(!isCreating)}>
          {isCreating ? '取消' : '创建命名空间'}
        </Button>
      </div>

      {isCreating && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="create-name">名称</Label>
                  <Input
                    id="create-name"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="我的命名空间"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="create-slug">标识</Label>
                  <Input
                    id="create-slug"
                    value={createSlug}
                    onChange={(e) => setCreateSlug(e.target.value)}
                    placeholder="my-namespace"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="submit">创建</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {namespaces.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              暂无命名空间。创建一个以开始使用。
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {namespaces.map((namespace) => (
            <Card key={namespace.id}>
              <CardContent className="p-4">
                {editingId === namespace.id ? (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`edit-name-${namespace.id}`}>名称</Label>
                        <Input
                          id={`edit-name-${namespace.id}`}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="名称"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`edit-slug-${namespace.id}`}>标识</Label>
                        <Input
                          id={`edit-slug-${namespace.id}`}
                          value={editSlug}
                          onChange={(e) => setEditSlug(e.target.value)}
                          placeholder="标识"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                        取消
                      </Button>
                      <Button size="sm" onClick={() => handleSaveEdit(namespace.id)}>
                        保存
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => handleSelect(namespace)}
                    >
                      <div className="font-medium">
                        {namespace.name || <span className="text-muted-foreground">未命名</span>}
                      </div>
                      {namespace.slug && (
                        <div className="text-sm text-muted-foreground">{namespace.slug}</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        ID: {namespace.id}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStartEdit(namespace)}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(namespace.id, namespace.name)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

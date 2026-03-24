"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { listNamespaces, type Namespace } from "@/api/client";

interface NamespaceItem {
  id: string;
  name?: string | null;
  slug?: string | null;
}

interface NamespaceSelectorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onNameChange?: (name: string | null) => void;
  className?: string;
}

export function NamespaceSelector({
  value,
  onChange,
  onSubmit,
  onNameChange,
  className,
}: NamespaceSelectorProps) {
  const [recentNamespaces, setRecentNamespaces] = React.useState<NamespaceItem[]>([]);
  const [availableNamespaces, setAvailableNamespaces] = React.useState<Namespace[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Compute displayName from value - this is the source of truth for the input display
  const displayName = React.useMemo(() => {
    if (!value) return "";
    const matched = availableNamespaces.find(ns => ns.id === value);
    if (matched) {
      return matched.name || matched.id;
    }
    const recentMatch = recentNamespaces.find(ns => ns.id === value);
    return recentMatch?.name || value;
  }, [value, availableNamespaces, recentNamespaces]);

  // Load recent namespaces from localStorage and fetch available namespaces on mount
  React.useEffect(() => {
    const stored = localStorage.getItem("recentNamespaces");
    if (stored) {
      try {
        const namespaces = JSON.parse(stored);
        setRecentNamespaces(namespaces);
      } catch (e) {
        console.error("Failed to parse recent namespaces", e);
      }
    }

    // Fetch available namespaces from API immediately on mount
    setIsLoading(true);
    listNamespaces()
      .then((namespaces) => {
        setAvailableNamespaces(namespaces);
      })
      .catch((err) => {
        console.warn("Failed to fetch namespaces:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Save to recent namespaces when value is submitted
  const handleSubmit = () => {
    if (value.trim()) {
      // Use displayName which is already computed from availableNamespaces or recentNamespaces
      // If displayName equals value, it means no match was found, so name is null
      const name = displayName === value ? null : displayName;
      console.log('handleSubmit called:', value, displayName, name);

      const newNamespace = { id: value, name: displayName };
      const updated = [
        newNamespace,
        ...recentNamespaces.filter((ns) => ns.id !== value),
      ].slice(0, 10);
      localStorage.setItem("recentNamespaces", JSON.stringify(updated));
      setRecentNamespaces(updated);
      onNameChange?.(name);
      onSubmit();
    }
    setIsOpen(false);
  };

  const handleSelect = (namespaceId: string, name: string | null) => {
    console.log('handleSelect called:', namespaceId, name);
    onChange(namespaceId);
    onNameChange?.(name);
    setIsOpen(false);
  };

  const handleClearHistory = () => {
    localStorage.removeItem("recentNamespaces");
    setRecentNamespaces([]);
  };

  // Calculate dropdown position
  const [dropdownPosition, setDropdownPosition] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [isOpen]);

  // Close dropdown on click outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="namespace"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Namespace
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              id="namespace"
              value={displayName}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setIsOpen(true)}
              placeholder="Select or enter namespace ID"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pr-8"
            />
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <ChevronDownIcon
                className={cn(
                  "h-4 w-4 transition-transform",
                  isOpen && "rotate-180"
                )}
              />
            </button>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>

      {isOpen && dropdownPosition && (
        <div
          className="fixed z-50 max-h-64 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
          }}
        >
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground text-center">
              Loading namespaces...
            </div>
          ) : availableNamespaces.length > 0 ? (
            <>
              <div className="p-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Available Namespaces
                </div>
                {availableNamespaces.map((namespace) => (
                  <button
                    key={namespace.id}
                    type="button"
                    onClick={() => handleSelect(namespace.id, namespace.name || null)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-sm text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between",
                      value === namespace.id && "bg-accent"
                    )}
                  >
                    <span className="truncate">{namespace.name || namespace.id}</span>
                    {value === namespace.id && (
                      <CheckIcon className="h-4 w-4" />
                    )}
                  </button>
                ))}
              </div>
              {recentNamespaces.length > 0 && (
                <>
                  <div className="border-t my-1" />
                  <div className="p-2">
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Recent Namespaces
                    </div>
                    {recentNamespaces.map((namespace) => (
                      <button
                        key={namespace.id}
                        type="button"
                        onClick={() => handleSelect(namespace.id, namespace.name || null)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-sm text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between",
                          value === namespace.id && "bg-accent"
                        )}
                      >
                        <span className="truncate">{namespace.name || namespace.id}</span>
                        {value === namespace.id && (
                          <CheckIcon className="h-4 w-4" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="border-t p-2">
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  Clear history
                </button>
              </div>
            </>
          ) : recentNamespaces.length > 0 ? (
            <>
              <div className="p-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Recent Namespaces
                </div>
                {recentNamespaces.map((namespace) => (
                  <button
                    key={namespace.id}
                    type="button"
                    onClick={() => handleSelect(namespace.id, namespace.name || null)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-sm text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between",
                      value === namespace.id && "bg-accent"
                    )}
                  >
                    <span className="truncate">{namespace.name || namespace.id}</span>
                    {value === namespace.id && (
                      <CheckIcon className="h-4 w-4" />
                    )}
                  </button>
                ))}
              </div>
              <div className="border-t p-2">
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  Clear history
                </button>
              </div>
            </>
          ) : (
            <div className="p-3 text-sm text-muted-foreground text-center">
              No namespaces available
            </div>
          )}
        </div>
      )}
    </div>
  );
}

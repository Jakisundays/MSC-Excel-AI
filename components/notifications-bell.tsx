"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NotificationType } from "@/lib/pocketbase/types";

const POLL_MS = 25_000;

const TYPE_LABEL: Record<NotificationType, string> = {
  submission_completed: "Tu solicitud está lista",
  submission_failed: "Tu solicitud falló",
  submission_timeout: "Tu solicitud tardó demasiado",
};

type NotificationItem = {
  id: string;
  type: NotificationType;
  read: boolean;
  submissionId: string;
  created: string;
  fileLabel?: string;
};

/**
 * Centro de notificaciones in-app (Fase 1, docs/notificaciones-push-plan.md
 * §2.1). Poll cada 25s a /api/notifications, pausado con la Page Visibility
 * API mientras el tab no está visible (mismo patrón que
 * components/submission-realtime.tsx).
 */
export function NotificationsBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch {
      // Silencioso: el próximo poll reintenta.
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (interval) return;
      interval = setInterval(fetchNotifications, POLL_MS);
    }

    function stop() {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stop();
      } else {
        fetchNotifications();
        start();
      }
    }

    fetchNotifications();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stop();
    };
  }, [fetchNotifications]);

  function markRead(id: string) {
    // Fire-and-forget: la navegación no debe esperar esta respuesta.
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  function markAllRead() {
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    }).catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell />
          {unreadCount > 0 && (
            <span className="bg-primary text-primary-foreground absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-1.5 py-1">
          <DropdownMenuLabel className="p-0 font-normal">Notificaciones</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              Marcar todo como leído
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="text-muted-foreground px-2 py-4 text-center text-sm">
            Sin notificaciones
          </div>
        ) : (
          items.map((n) => (
            <DropdownMenuItem key={n.id} asChild className="flex-col items-start gap-0.5 py-1.5">
              <Link
                href={`/historial/${n.submissionId}`}
                onClick={() => {
                  if (!n.read) markRead(n.id);
                }}
              >
                <span className="flex w-full items-center gap-1.5 text-sm font-medium">
                  {!n.read && (
                    <span className="bg-primary size-1.5 shrink-0 rounded-full" aria-hidden />
                  )}
                  {TYPE_LABEL[n.type]}
                </span>
                <span className="text-muted-foreground text-xs">
                  {new Date(n.created).toLocaleString()}
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

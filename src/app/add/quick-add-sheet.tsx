"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { currencyExponent } from "@/core/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Capture-first (PRD §7): amount → category → save, ~3s. Entries that can't
// reach the server are queued in localStorage and replayed on reconnect;
// clientId keeps replays idempotent server-side.

interface AccountOpt {
  id: string;
  name: string;
  currency: string;
}
interface CategoryOpt {
  id: string;
  name: string;
  uses: number;
}
interface QueueEntry {
  clientId: string;
  accountId: string;
  amount: number;
  categoryId?: string;
  categoryName?: string;
  note?: string;
  occurredAt: string;
}

const QUEUE_KEY = "kanto-capture-queue";
const LAST_ACCOUNT_KEY = "kanto-last-account";
const SUGGESTED = ["Food", "Coffee", "Transport", "Groceries", "Bills", "Shopping"];

function readQueue(): QueueEntry[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeQueue(q: QueueEntry[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

async function postEntry(entry: QueueEntry): Promise<boolean> {
  const res = await fetch("/api/quick-expense", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entry),
  });
  return res.ok;
}

export function QuickAddSheet({
  accounts,
  categories,
  prefill,
}: {
  accounts: AccountOpt[];
  categories: CategoryOpt[];
  prefill?: { amountMajor: number; note?: string };
}) {
  const [amountStr, setAmountStr] = useState(
    prefill ? String(prefill.amountMajor) : "",
  );
  const [note, setNote] = useState(prefill?.note ?? "");
  const [accountId, setAccountId] = useState(accounts[0].id);
  const [category, setCategory] = useState<{ id?: string; name?: string }>();
  const [newCat, setNewCat] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saved" | "queued">("idle");
  const [queuedCount, setQueuedCount] = useState(0);
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const allowDecimal = currencyExponent(account.currency) > 0;

  const flushQueue = useCallback(async () => {
    const queue = readQueue();
    if (queue.length === 0) {
      setQueuedCount(0);
      return;
    }
    const remaining: QueueEntry[] = [];
    for (const entry of queue) {
      try {
        if (!(await postEntry(entry))) remaining.push(entry);
      } catch {
        remaining.push(entry);
      }
    }
    writeQueue(remaining);
    setQueuedCount(remaining.length);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve(); // defer past hydration before touching state
      if (cancelled) return;
      const last = localStorage.getItem(LAST_ACCOUNT_KEY);
      if (last && accounts.some((a) => a.id === last)) setAccountId(last);
      await flushQueue();
    })();
    window.addEventListener("online", flushQueue);
    return () => {
      cancelled = true;
      window.removeEventListener("online", flushQueue);
    };
  }, [accounts, flushQueue]);

  function press(key: string) {
    setStatus("idle");
    setAmountStr((prev) => {
      if (key === "⌫") return prev.slice(0, -1);
      if (key === ".")
        return !allowDecimal || prev.includes(".") ? prev : (prev || "0") + ".";
      if (prev.length > 12) return prev;
      if (key === "000") return prev === "" ? prev : prev + "000";
      return prev === "0" ? key : prev + key;
    });
  }

  const amount = parseFloat(amountStr);
  const displayAmount = amountStr
    ? (() => {
        const [int, frac] = amountStr.split(".");
        const formatted = Number(int || 0).toLocaleString("id-ID");
        return frac !== undefined ? `${formatted},${frac}` : formatted;
      })()
    : "0";

  async function save() {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const entry: QueueEntry = {
      clientId: crypto.randomUUID(),
      accountId,
      amount,
      categoryId: category?.id,
      categoryName: category?.name,
      note: note || undefined,
      occurredAt: new Date().toISOString(),
    };
    localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
    let ok = false;
    try {
      ok = await postEntry(entry);
    } catch {
      ok = false;
    }
    if (ok) {
      setStatus("saved");
    } else {
      writeQueue([...readQueue(), entry]);
      setQueuedCount((n) => n + 1);
      setStatus("queued");
    }
    setAmountStr("");
    setNote("");
    setCategory(undefined);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus("idle"), 2000);
  }

  const showSuggested = categories.length === 0;
  const chips: { key: string; label: string; selected: boolean; pick: () => void }[] =
    [
      ...categories.map((c) => ({
        key: c.id,
        label: c.name,
        selected: category?.id === c.id,
        pick: () => setCategory(category?.id === c.id ? undefined : { id: c.id }),
      })),
      ...(showSuggested
        ? SUGGESTED.map((name) => ({
            key: name,
            label: name,
            selected: category?.name === name,
            pick: () =>
              setCategory(category?.name === name ? undefined : { name }),
          }))
        : []),
    ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col p-6">
      <div className="flex items-center justify-between">
        <p className="label-caps">Log expense</p>
        <Link
          href="/"
          aria-label="Close"
          className="text-xl text-muted-foreground hover:text-foreground"
        >
          ✕
        </Link>
      </div>

      {/* Amount */}
      <div className="mt-10 text-center">
        <p className="font-heading text-6xl font-bold tracking-tight tabular-nums">
          <span className="mr-2 text-2xl align-super text-muted-foreground">
            {account.currency === "IDR" ? "Rp" : account.currency}
          </span>
          {displayAmount}
        </p>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="mt-3 rounded-md border-0 bg-transparent text-center text-sm text-muted-foreground outline-none"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              from {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Category chips */}
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={chip.pick}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              chip.selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {chip.label}
          </button>
        ))}
        {newCat === null ? (
          <button
            type="button"
            onClick={() => setNewCat("")}
            className="rounded-full border border-dashed px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            +
          </button>
        ) : (
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (newCat.trim()) setCategory({ name: newCat.trim() });
              setNewCat(null);
            }}
          >
            <Input
              autoFocus
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="New category"
              className="h-9 w-36 rounded-full"
            />
          </form>
        )}
      </div>

      {/* Note */}
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="mt-6 border-0 border-b rounded-none bg-transparent px-1 text-center shadow-none focus-visible:ring-0"
      />

      {/* Numpad */}
      <div className="mt-auto grid grid-cols-3 gap-2 pt-8">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", allowDecimal ? "." : "000", "0", "⌫"].map(
          (key) => (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              className="rounded-lg py-4 font-heading text-2xl font-bold transition-colors hover:bg-secondary active:bg-accent"
            >
              {key}
            </button>
          ),
        )}
      </div>

      <Button
        onClick={save}
        disabled={!Number.isFinite(amount) || amount <= 0}
        className="mt-4 h-12 w-full text-base"
      >
        {status === "saved"
          ? "Saved ✓"
          : status === "queued"
            ? "Queued — will sync"
            : "Save"}
      </Button>
      <p className="mt-3 h-4 text-center text-xs text-muted-foreground">
        {queuedCount > 0 && `${queuedCount} entr${queuedCount === 1 ? "y" : "ies"} waiting to sync`}
      </p>
    </main>
  );
}

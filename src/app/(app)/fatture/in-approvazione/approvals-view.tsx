"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Loader2,
  Eye,
  Link2,
  RefreshCcw,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  approveBatchAction,
  approveGroupAction,
  approveMatchAction,
  type PendingApproval,
} from "./approval-actions";
import { ApprovalDetailOverlay } from "./approval-detail-overlay";
import { SwapMovementOverlay } from "./swap-movement-overlay";

const PAGE_SIZE = 50;

export function ApprovalsView({ pending }: { pending: PendingApproval[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(pending.map((p) => p.matchId)),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [examined, setExamined] = useState<PendingApproval | null>(null);
  const [swapping, setSwapping] = useState<PendingApproval | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [pendingBulk, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(pending.map((p) => p.matchId)));
  }
  function selectNone() {
    setSelected(new Set());
  }

  function handleApproveSelected() {
    if (selected.size === 0) return;
    startTransition(async () => {
      const res = await approveBatchAction(Array.from(selected));
      toast.success(
        res.approved === 1
          ? "1 abbinamento approvato"
          : `${res.approved} abbinamenti approvati`,
        {
          description: res.failed > 0 ? `${res.failed} falliti` : undefined,
        },
      );
      router.refresh();
    });
  }

  async function handleApproveSingle(matchId: string) {
    setBusyId(matchId);
    try {
      const res = await approveMatchAction(matchId);
      if (res.ok) {
        toast.success("Match approvato");
        router.refresh();
      } else toast.error(res.error);
    } finally {
      setBusyId(null);
    }
  }

  async function handleApproveGroup(movementId: string, anchorMatchId: string) {
    setBusyId(anchorMatchId);
    try {
      const res = await approveGroupAction(movementId);
      if (res.approved > 0) {
        toast.success(
          `${res.approved} fatture approvate (pagamento aggregato)`,
          res.failed > 0 ? { description: `${res.failed} falliti` } : undefined,
        );
        router.refresh();
      } else if (res.failed > 0) {
        toast.error("Approvazione gruppo fallita");
      }
    } finally {
      setBusyId(null);
    }
  }

  const visible = pending.slice(0, visibleCount);
  const hasMore = visibleCount < pending.length;

  return (
    <>
      <div className="rounded-lg border border-border bg-background p-3 flex items-center gap-3 flex-wrap sticky top-0 z-10">
        <div className="flex items-center gap-2 text-sm">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">
            {pending.length} in attesa di approvazione
          </span>
          <Badge tone="neutral">{selected.size} selezionati</Badge>
        </div>
        <div className="flex items-center gap-2 text-xs ml-auto">
          <button
            type="button"
            onClick={selectAll}
            className="text-muted-foreground hover:text-foreground"
          >
            Tutti
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={selectNone}
            className="text-muted-foreground hover:text-foreground"
          >
            Nessuno
          </button>
          <Button
            onClick={handleApproveSelected}
            disabled={pendingBulk || selected.size === 0}
            className="ml-2 gap-1.5"
          >
            {pendingBulk ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Approva {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {visible.map((p) => (
          <ApprovalCard
            key={p.matchId}
            pending={p}
            checked={selected.has(p.matchId)}
            busy={busyId === p.matchId}
            onToggle={() => toggle(p.matchId)}
            onApprove={() => handleApproveSingle(p.matchId)}
            onApproveGroup={() => handleApproveGroup(p.movement.id, p.matchId)}
            onExamine={() => setExamined(p)}
            onRebind={() => setSwapping(p)}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex items-center justify-center">
          <Button
            variant="secondary"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            Mostra altri {Math.min(PAGE_SIZE, pending.length - visibleCount)}
            <span className="text-muted-foreground ml-1">
              ({visibleCount} / {pending.length})
            </span>
          </Button>
        </div>
      )}

      {examined && (
        <ApprovalDetailOverlay
          pending={examined}
          onClose={() => setExamined(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {swapping && (
        <SwapMovementOverlay
          matchId={swapping.matchId}
          invoice={{
            id: swapping.invoice.id,
            type: swapping.invoice.type,
            number: swapping.invoice.number,
            counterpartyName: swapping.invoice.counterpartyName,
            counterpartyVat: swapping.invoice.counterpartyVat,
            issueDate: swapping.invoice.issueDate,
            totalAmount: swapping.invoice.totalAmount,
          }}
          onClose={() => setSwapping(null)}
          onSwapped={() => {
            setSwapping(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ApprovalCard({
  pending,
  checked,
  busy,
  onToggle,
  onApprove,
  onApproveGroup,
  onExamine,
  onRebind,
}: {
  pending: PendingApproval;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onApproveGroup: () => void;
  onExamine: () => void;
  onRebind: () => void;
}) {
  const { invoice, movement } = pending;
  const isIncome = movement.type === "income";
  const isAggregate = pending.aggregateGroupSize > 1;

  return (
    <div
      className={
        "rounded-lg border bg-background p-3 flex flex-col gap-3 " +
        (isAggregate ? "border-foreground/30" : "border-border")
      }
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={busy}
          className="h-4 w-4 rounded border-input shrink-0"
        />
        {invoice.type === "sale" ? (
          <ArrowUpRight className="h-3.5 w-3.5 text-success shrink-0" />
        ) : (
          <ArrowDownLeft className="h-3.5 w-3.5 text-danger shrink-0" />
        )}
        <Link
          href={`/fatture/${invoice.id}`}
          className="font-mono text-xs font-medium text-foreground hover:underline"
        >
          {invoice.number}
        </Link>
        {isAggregate && (
          <Badge tone="primary" className="gap-1">
            <Layers className="h-2.5 w-2.5" />
            Aggregato · {pending.aggregateGroupSize}
          </Badge>
        )}
        <Badge tone="neutral" className="ml-auto">
          {pending.matchType === "auto" ? "Auto" : pending.matchType}
        </Badge>
      </div>

      <div className="flex flex-col gap-2 text-xs">
        <div className="border border-border rounded-md p-2 flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Fattura
          </span>
          <span className="text-foreground font-medium break-words" title={invoice.counterpartyName}>
            {invoice.counterpartyName}
          </span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground tabular-nums">
              {formatDate(invoice.issueDate)}
            </span>
            <span className="text-foreground font-medium tabular-nums">
              {formatCurrency(parseFloat(invoice.totalAmount))}
            </span>
          </div>
        </div>

        <div className="border border-border rounded-md p-2 flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Movimento
          </span>
          <span className="text-foreground break-words line-clamp-2">
            {movement.description}
          </span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground tabular-nums">
              {formatDate(movement.date)}
            </span>
            <span
              className={
                "font-medium tabular-nums " +
                (isIncome ? "text-success" : "text-danger")
              }
            >
              {isIncome ? "+" : "−"}
              {formatCurrency(Math.abs(parseFloat(movement.amount)))}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm"
          variant="ghost"
          onClick={onExamine}
          disabled={busy}
          className="gap-1 text-xs h-7"
        >
          <Eye className="h-3 w-3" />
          Esamina
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRebind}
          disabled={busy}
          className="gap-1 text-xs h-7"
        >
          <RefreshCcw className="h-3 w-3" />
          Riabbina
        </Button>
        {isAggregate && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onApproveGroup}
            disabled={busy}
            className="gap-1 ml-auto text-xs h-7"
            title={`Approva tutte le ${pending.aggregateGroupSize} fatture del gruppo`}
          >
            <Layers className="h-3 w-3" />
            Approva gruppo
          </Button>
        )}
        <Button
          size="sm"
          onClick={onApprove}
          disabled={busy}
          className={
            "gap-1 text-xs h-7 " + (isAggregate ? "" : "ml-auto")
          }
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3 w-3" />
          )}
          Approva
        </Button>
      </div>
    </div>
  );
}

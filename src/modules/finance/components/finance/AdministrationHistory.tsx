import { useState } from "react";
import { ApplicationDetails } from "@/modules/finance/components/finance/ApplicationDetails";
import { SerialNumberLabel } from "@/modules/finance/components/finance/common";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/finance/components/ui/dialog";
import { Button } from "@/modules/finance/components/ui/button";
import {
  ADMISSION_NO_RECEIVED_TEXT,
  ADMINISTRATION_DETAILS_SENT_TEXT,
  ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
} from "@/modules/finance/finance/feeWorkflowConfig";
import { formatDate } from "@/modules/finance/finance/logic";
import type { Handoff, HandoffHistoryEntry } from "@/modules/finance/finance/types";

export function AdministrationHistory({
  personId,
  handoffs,
}: {
  personId: string;
  handoffs: Handoff[];
}) {
  const [selectedSnapshot, setSelectedSnapshot] = useState<HandoffHistoryEntry | null>(null);
  const events = handoffs
    .filter((handoff) => handoff.personId === personId && handoff.target === "Administration")
    .flatMap((handoff) =>
      handoff.history.map((entry) => ({
        entry,
        eventType:
          entry.text === ADMINISTRATION_DETAILS_SENT_TEXT ||
          entry.text === "Application handoff prepared (simulation only; not delivered)"
            ? "Application handoff prepared"
            : entry.text === ADMISSION_NO_RECEIVED_TEXT
              ? "Admission No. recorded"
              : entry.text === ADMINISTRATION_PAYMENT_NOTIFIED_TEXT
                ? "Payment notification prepared"
                : "Administration event",
      })),
    )
    .sort((left, right) => right.entry.date.localeCompare(left.entry.date));

  return (
    <>
      <section className="space-y-2">
        <h3 className="font-semibold">Administration history</h3>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No administration history yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.map(({ entry, eventType }, index) => (
              <li
                key={`${entry.date}-${entry.referenceId ?? ""}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs"
              >
                <div className="flex items-start">
                  <SerialNumberLabel index={index} />
                  <div>
                    <p className="font-medium">
                      {formatDate(entry.date.slice(0, 10))} · {eventType}
                    </p>
                  </div>
                </div>
                {eventType === "Application handoff prepared" && entry.snapshot && (
                  <Button size="sm" variant="outline" onClick={() => setSelectedSnapshot(entry)}>
                    View handoff details
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Dialog open={!!selectedSnapshot} onOpenChange={(open) => !open && setSelectedSnapshot(null)}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="shrink-0 border-b px-4 py-4 pr-14 text-left sm:px-6">
            <DialogTitle>Application handoff details</DialogTitle>
            {selectedSnapshot && (
              <p className="text-sm text-muted-foreground">
                {selectedSnapshot.snapshot?.name} · {formatDate(selectedSnapshot.date.slice(0, 10))}
              </p>
            )}
          </DialogHeader>
          {selectedSnapshot?.snapshot && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <ApplicationDetails snapshot={selectedSnapshot.snapshot} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

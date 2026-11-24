"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";

export function ReviewActions({ facilityId, status }: { facilityId: string; status: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: "approve" | "reject" | "suspend") {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/super-admin/facilities/${facilityId}/${action}`, "POST", action === "approve" ? {} : { reason });
      setReason("");
      router.refresh();
    } catch (x) {
      const e = x as ApiError;
      setErr(e.details?.blockers ? `Not ready: ${e.details.blockers.join("; ")}` : e.message);
    } finally {
      setBusy(false);
    }
  }

  const canApprove = status === "PENDING_APPROVAL" || status === "SUSPENDED";
  return (
    <div className="space-y-2">
      {status !== "REJECTED" && (
        <Input aria-label="Reason (required to reject or suspend)" placeholder="Reason (required to reject or suspend)" value={reason} onChange={(e) => setReason(e.target.value)} />
      )}
      <div className="flex flex-wrap gap-2">
        {canApprove && <Button disabled={busy} onClick={() => act("approve")}>{status === "SUSPENDED" ? "Reinstate" : "Approve"}</Button>}
        {status === "PENDING_APPROVAL" && <Button variant="outline" disabled={busy || reason.length < 5} onClick={() => act("reject")}>Reject</Button>}
        {status === "APPROVED" && <Button variant="outline" disabled={busy || reason.length < 5} onClick={() => act("suspend")}>Suspend</Button>}
      </div>
      <FormMessage error={err} />
    </div>
  );
}

import { useMemo, useState } from "react";
import { formatCollectiblePrice } from "../../appUtils";
import { allInAcquisition } from "../collection/ownershipModel";
import { readDecisionSnapshot } from "../decision/decisionSession";

export function LogPurchaseScreen({ navigateToPage, onSubmitPurchase, busy = false }) {
  const snapshot = readDecisionSnapshot();
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(() => ({
    price: snapshot?.currentValue ? String(Math.round(snapshot.currentValue)) : "",
    date: new Date().toISOString().slice(0, 10),
    retailer: "",
    quantity: String(snapshot?.verdict?.quantity || 1),
    condition: "sealed",
    shipping: "",
    vatReclaim: "",
    rewards: "",
    cashback: "",
    vouchers: "",
    notes: "",
  }));
  const allIn = useMemo(() => allInAcquisition(form), [form]);

  if (!snapshot) {
    return (
      <div className="v3WorkflowScreen" data-page="log-purchase">
        <header className="v3WorkflowHero">
          <h1>Log Purchase</h1>
          <p>Scan a set and open the verdict before recording a purchase.</p>
          <button type="button" className="primaryButton" onClick={() => navigateToPage("scan")}>
            Scan a set
          </button>
        </header>
      </div>
    );
  }

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  return (
    <div className="v3WorkflowScreen" data-page="log-purchase">
      <header className="v3WorkflowHero">
        <h1>Log Purchase</h1>
        <p>
          {snapshot.name} · #{snapshot.setNumber}. This records the acquisition. It does not recalculate
          the verdict.
        </p>
      </header>

      <form
        className="v3PurchaseForm"
        onSubmit={async (event) => {
          event.preventDefault();
          setStatus("");
          try {
            await onSubmitPurchase?.({
              collectibleId: snapshot.collectibleId,
              price: Number(form.price),
              unitCost: allIn.unitCost,
              shipping: form.shipping,
              vatReclaim: form.vatReclaim,
              rewards: form.rewards,
              cashback: form.cashback,
              vouchers: form.vouchers,
              date: form.date,
              retailer: form.retailer,
              quantity: allIn.quantity,
              condition: form.condition,
              notes: form.notes,
              setName: snapshot.name,
            });
            setStatus("Purchase saved to your collection. The set analysis is unchanged.");
          } catch (error) {
            setStatus(String(error.message || "Purchase could not be saved."));
          }
        }}
      >
        <label>
          Cash paid per unit (ZAR)
          <input type="number" min="0" step="0.01" required value={form.price} onChange={update("price")} />
        </label>
        <label>
          Shipping for this purchase
          <input type="number" min="0" step="0.01" value={form.shipping} onChange={update("shipping")} placeholder="0 if none" />
        </label>
        <p>All-in cost {formatCollectiblePrice(allIn.allInTotal)} · {formatCollectiblePrice(allIn.unitCost)} per unit. Leave adjustments blank when they do not apply.</p>
        <details>
          <summary>VAT, rewards, cashback, vouchers</summary>
          <label>
            VAT reclaim
            <input type="number" min="0" step="0.01" value={form.vatReclaim} onChange={update("vatReclaim")} />
          </label>
          <label>
            Rewards
            <input type="number" min="0" step="0.01" value={form.rewards} onChange={update("rewards")} />
          </label>
          <label>
            Cashback
            <input type="number" min="0" step="0.01" value={form.cashback} onChange={update("cashback")} />
          </label>
          <label>
            Vouchers
            <input type="number" min="0" step="0.01" value={form.vouchers} onChange={update("vouchers")} />
          </label>
        </details>
        <label>
          Purchase date
          <input type="date" required value={form.date} onChange={update("date")} />
        </label>
        <label>
          Retailer or source
          <input type="text" required value={form.retailer} onChange={update("retailer")} placeholder="LEGO store, marketplace, private" />
        </label>
        <label>
          Quantity
          <input type="number" min="1" required value={form.quantity} onChange={update("quantity")} />
        </label>
        <label>
          Condition
          <select value={form.condition} onChange={update("condition")}>
            <option value="sealed">Sealed</option>
            <option value="opened">Opened</option>
          </select>
        </label>
        <label>
          Notes
          <textarea value={form.notes} onChange={update("notes")} rows={3} />
        </label>
        {status ? <div className="statusBanner subtleBanner">{status}</div> : null}
        <div className="v3WorkflowActions">
          <button type="button" className="ghostButton" onClick={() => navigateToPage("verdict")}>
            Back to Verdict
          </button>
          <button type="submit" className="primaryButton" disabled={busy}>
            {busy ? "Saving..." : "Save to Collection"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Input, Button, Card, CardBody } from "@nextui-org/react";

export default function AmountModal({ food, onClose }) {
  const [amount, setAmount] = useState("");

  const multiplier = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    const base = Number(food.baseAmount) || 1;
    if (base <= 0) return null;
    return n / base;
  }, [amount, food.baseAmount]);

  const totalCalories = useMemo(() => {
    if (multiplier == null) return null;
    return (Number(food.calories) * multiplier).toFixed(1);
  }, [multiplier, food.calories]);

  const totalProtein = useMemo(() => {
    if (multiplier == null || food.protein == null) return null;
    return (Number(food.protein) * multiplier).toFixed(1);
  }, [multiplier, food.protein]);

  return (
    <Card className="card">
      <CardBody className="card-pad">
        <div className="text-sm text-muted" style={{ marginBottom: 12 }}>
          Base: {Number(food.baseAmount)} {food.baseUnit} · {Number(food.calories)} kcal{food.protein != null ? ` · ${Number(food.protein)} g protein` : ''}
        </div>
        
        <div className="flex gap-2" style={{ marginBottom: 12 }}>
          <Input
            autoFocus
            placeholder={`Amount in ${food.baseUnit}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            inputMode="decimal"
            step="any"
            size="sm"
            className="flex-1"
          />
          <Button className="btn btn-primary" onClick={onClose} size="sm">
            Done
          </Button>
        </div>
        
        <div className="text-center">
          {multiplier == null ? (
            <span className="text-muted">Enter an amount to calculate</span>
          ) : (
            <div className="space-y-1">
              <div className="text-sm text-muted">
                {amount} {food.baseUnit} equals ×{multiplier.toFixed(2)} of base
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--accent)' }}>
                {totalCalories} kcal {totalProtein != null ? `· ${totalProtein} g protein` : ''}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex justify-end" style={{ marginTop: 12 }}>
          <Button variant="ghost" onClick={onClose} size="sm">
            Close
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
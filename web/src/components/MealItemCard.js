"use client";

import { useState, useEffect } from "react";
import { Input, Button, Card, CardBody } from "@nextui-org/react";

export default function MealItemCard({ item, onUpdateServings, onRemove, onEdit }) {
  // Convert stored multiplier to displayed amount
  const getDisplayAmount = () => {
    const multiplier = Number(item.servings);
    if (item.food.baseUnit === 'servings') {
      return multiplier;
    }
    // For grams/ml, convert multiplier to actual amount
    return multiplier * Number(item.food.baseAmount);
  };

  const [amount, setAmount] = useState(getDisplayAmount());

  // Update amount when item changes
  useEffect(() => {
    setAmount(getDisplayAmount());
  }, [item.servings, item.food.baseUnit, item.food.baseAmount]);

  function handleAmountChange(newAmount) {
    setAmount(newAmount);
    // Convert input amount to multiplier
    let multiplier;
    if (item.food.baseUnit === 'servings') {
      multiplier = Number(newAmount);
    } else {
      // For grams/ml, convert amount to multiplier
      const baseAmount = Number(item.food.baseAmount) || 1;
      multiplier = Number(newAmount) / baseAmount;
    }
    onUpdateServings(item.id, multiplier);
  }

  // Use the stored multiplier for calculations
  const multiplier = Number(item.servings);
  const totalCalories = Number(item.food.calories) * multiplier;
  const totalProtein = (item.food.protein != null ? Number(item.food.protein) : 0) * multiplier;

  // Get display label for unit
  const getUnitLabel = () => {
    const unit = item.food.baseUnit?.toLowerCase();
    if (unit === 'grams' || unit === 'g') return 'Grams';
    if (unit === 'ml') return 'Ml';
    if (unit === 'servings') return 'Servings';
    // Fallback: capitalize first letter
    return item.food.baseUnit?.charAt(0).toUpperCase() + item.food.baseUnit?.slice(1) || '';
  };

  return (
    <Card className="card">
      <CardBody className="card-pad" style={{ padding: '16px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="flex-1">
            <h3 className="font-semibold">{item.food.name}</h3>
            <p className="text-sm text-muted">
              {Number(item.food.calories)} cal per {item.food.baseAmount} {item.food.baseUnit}
              {item.food.protein != null ? ` · ${Number(item.food.protein)} g protein` : ''}
            </p>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => onEdit(item.id)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" color="danger" onClick={() => onRemove(item.id)}>
              Remove
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            size="sm"
            className="w-32"
            min="0.1"
            step="0.1"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            label={getUnitLabel()}
          />
          <div className="text-sm text-muted">
            = {totalCalories.toFixed(0)} calories{item.food.protein != null ? ` · ${totalProtein.toFixed(1)} g protein` : ''}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

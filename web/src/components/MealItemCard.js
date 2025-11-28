"use client";

import { useState, useEffect, useRef } from "react";
import { Input, Button, Card, CardBody } from "@nextui-org/react";

export default function MealItemCard({ item, onUpdateServings, onRemove, onEdit }) {
  // Convert stored multiplier to displayed amount
  const getDisplayAmount = () => {
    const multiplier = Number(item.servings);
    if (multiplier === 0) return '';
    if (item.food.baseUnit === 'servings') {
      return multiplier.toString();
    }
    // For grams/ml, convert multiplier to actual amount
    return (multiplier * Number(item.food.baseAmount)).toString();
  };

  const [amount, setAmount] = useState(getDisplayAmount());
  const isFocusedRef = useRef(false);

  // Update amount when item changes from external source (Socket.IO)
  useEffect(() => {
    const currentValue = getDisplayAmount();
    
    // Always update when item changes, unless user is actively typing in the field
    if (!isFocusedRef.current) {
      setAmount(currentValue);
    }
  }, [item.servings, item.food.baseUnit, item.food.baseAmount]);

  function handleAmountChange(newAmount) {
    setAmount(newAmount);
    
    // If field is cleared, don't update the multiplier
    if (newAmount === '' || newAmount === null || newAmount === undefined) {
      return;
    }
    
    // Convert input amount to multiplier
    const numAmount = Number(newAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return;
    }
    
    let multiplier;
    if (item.food.baseUnit === 'servings') {
      multiplier = numAmount;
    } else {
      // For grams/ml, convert amount to multiplier
      const baseAmount = Number(item.food.baseAmount) || 1;
      multiplier = numAmount / baseAmount;
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
            <div className="text-sm text-muted">
              <div>{Number(item.food.calories)} cal per {item.food.baseAmount} {item.food.baseUnit}</div>
              {item.food.protein != null && (
                <div>{Number(item.food.protein)} g protein</div>
              )}
            </div>
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
            onFocus={() => {
              isFocusedRef.current = true;
            }}
            onBlur={() => {
              isFocusedRef.current = false;
              // Update amount when user leaves field to ensure it matches the item
              const currentValue = getDisplayAmount();
              setAmount(currentValue);
            }}
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

"use client";

import { useState } from "react";
import { Input, Button, Card, CardBody } from "@nextui-org/react";

export default function MealItemCard({ item, onUpdateServings, onRemove, onEdit }) {
  const [servings, setServings] = useState(item.servings);

  function handleServingsChange(newServings) {
    setServings(newServings);
    onUpdateServings(item.id, newServings);
  }

  const totalCalories = Number(item.food.calories) * Number(servings);
  const totalProtein = (item.food.protein != null ? Number(item.food.protein) : 0) * Number(servings);

  return (
    <Card className="card">
      <CardBody className="card-pad">
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
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
            value={servings}
            onChange={(e) => handleServingsChange(e.target.value)}
            size="sm"
            className="w-20"
            min="0.1"
            step="0.1"
            label="Servings"
          />
          <div className="text-sm text-muted">
            = {totalCalories.toFixed(0)} calories{item.food.protein != null ? ` · ${totalProtein.toFixed(1)} g protein` : ''}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

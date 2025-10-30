"use client";

import { useState } from "react";
import { Button, Input } from "@nextui-org/react";

export default function AddFoodButton({ food, onAdd }) {
  const [servings, setServings] = useState(1);
  const [showInput, setShowInput] = useState(false);

  function handleAdd() {
    if (servings > 0) {
      onAdd(food, servings);
      setServings(1);
      setShowInput(false);
    }
  }

  if (!showInput) {
    return (
      <Button 
        size="sm" 
        color="success" 
        onClick={() => setShowInput(true)}
      >
        Add
      </Button>
    );
  }

  return (
    <div className="flex gap-1 items-center">
      <div className="text-xs text-gray-400">
        {Number(food.calories)} cal/serve
      </div>
      <Input
        type="number"
        value={servings}
        onChange={(e) => setServings(e.target.value)}
        size="sm"
        className="w-16"
        min="0.1"
        step="0.1"
      />
      <Button 
        size="sm" 
        color="success" 
        onClick={handleAdd}
      >
        ✓
      </Button>
      <Button 
        size="sm" 
        variant="ghost" 
        onClick={() => setShowInput(false)}
      >
        ✕
      </Button>
    </div>
  );
}

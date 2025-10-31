"use client";

import { useState } from "react";
import { API } from "../lib/api";
import { 
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input
} from "@nextui-org/react";

export default function SaveMealModal({ isOpen, onClose, mealItems, onSaved }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) {
      setError("Please enter a meal name");
      return;
    }

    if (mealItems.length === 0) {
      setError("No items in meal to save");
      return;
    }

    try {
      setSaving(true);
      setError("");
      
      const items = mealItems.map(item => ({
        foodId: item.food.id,
        servings: Number(item.servings)
      }));

      const res = await fetch(`${API}/api/saved-meals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), items }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save meal');
      }

      const savedMeal = await res.json();
      setName("");
      onSaved?.(savedMeal);
      onClose();
    } catch (e) {
      setError(e.message || "Failed to save meal");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (!saving) {
      setName("");
      setError("");
      onClose();
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="sm">
      <ModalContent>
        <ModalHeader>Save Meal</ModalHeader>
        <ModalBody>
          <Input
            label="Meal Name"
            placeholder="Enter meal name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            autoFocus
            size="sm"
          />
          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}
          <div className="text-sm text-muted">
            This meal contains {mealItems.length} item{mealItems.length !== 1 ? 's' : ''}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={handleClose} disabled={saving} size="sm">
            Cancel
          </Button>
          <Button 
            className="btn btn-primary" 
            onClick={handleSave} 
            disabled={saving || !name.trim()} 
            size="sm"
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}


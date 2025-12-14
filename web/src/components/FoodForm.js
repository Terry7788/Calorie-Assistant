"use client";

import { useEffect, useState } from "react";
import { API } from "../lib/api";
import { 
  Input, 
  Button, 
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  SelectItem,
  Card,
  CardBody
} from "@nextui-org/react";

export default function FoodForm({ initial, onCancel, onSaved, onDelete, onSaveAndAdd }) {
  const [name, setName] = useState("");
  const [baseAmount, setBaseAmount] = useState(100);
  const [baseUnit, setBaseUnit] = useState("grams");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const units = [
    { key: "grams", label: "grams" },
    { key: "servings", label: "servings" },
    { key: "ml", label: "ml" }
  ];

  useEffect(() => {
    if (initial) {
      setName(initial.name ?? "");
      setBaseAmount(Number(initial.baseAmount) ?? 100);
      setBaseUnit(initial.baseUnit ?? "grams");
      setCalories(initial.calories != null ? Number(initial.calories) : "");
      setProtein(initial.protein != null ? Number(initial.protein) : "");
    } else {
      setName("");
      setBaseAmount(100);
      setBaseUnit("grams");
      setCalories("");
      setProtein("");
    }
  }, [initial]);

  async function handleDelete() {
    if (!initial?.id) return;
    if (!confirm("Are you sure you want to delete this food from the database?")) return;
    
    try {
      setDeleting(true);
      setError("");
      const res = await fetch(`${API}/api/foods/${initial.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      onDelete?.(initial.id);
    } catch (e) {
      setError("Failed to delete food");
    } finally {
      setDeleting(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");
      const payload = { name, baseAmount: Number(baseAmount), baseUnit, calories: Number(calories), protein: Number(protein) };
      // Only treat as edit if initial has an id
      const isEdit = initial?.id != null;
      const res = await fetch(isEdit ? `${API}/api/foods/${initial.id}` : `${API}/api/foods`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      onSaved?.(data);
    } catch (e) {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndAdd(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");
      const payload = { name, baseAmount: Number(baseAmount), baseUnit, calories: Number(calories), protein: Number(protein) };
      // Only treat as edit if initial has an id
      const isEdit = initial?.id != null;
      const res = await fetch(isEdit ? `${API}/api/foods/${initial.id}` : `${API}/api/foods`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      onSaved?.(data);
      // Add to meal after saving
      if (onSaveAndAdd) {
        onSaveAndAdd(data);
      }
    } catch (e) {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }


  return (
    <Card className="card mt-4">
      <CardBody className="card-pad">
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <h3 className="heading-2" style={{ margin: 0 }}>
            {initial ? 'Edit Food' : 'Add Food'}
          </h3>
        </div>
        {error && <div className="text-red-500 text-sm" style={{ marginBottom: 12 }}>{error}</div>}
        
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Name"
            labelPlacement="outside"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="sm"
          />
          
          <div className="flex gap-2">
            <Input
              label="Base amount"
              labelPlacement="outside"
              placeholder="Base amount"
              type="number"
              value={baseAmount}
              onChange={(e) => setBaseAmount(e.target.value)}
              size="sm"
              className="flex-1"
              classNames={{ input: "text-sm" }}
              inputMode="decimal"
            />
            <Select
              label="Unit"
              labelPlacement="outside"
              placeholder="Unit"
              selectedKeys={[baseUnit]}
              onSelectionChange={(keys) => {
                const newUnit = Array.from(keys)[0];
                setBaseUnit(newUnit);
                // When changing to servings, default base amount to 1
                if (newUnit === "servings") {
                  setBaseAmount(1);
                } else if (newUnit === "grams" || newUnit === "ml") {
                  // When changing to grams or ml, default base amount to 100
                  setBaseAmount(100);
                }
              }}
              size="sm"
              className="w-[140px]"
              classNames={{ trigger: "text-sm" }}
            >
              {units.map((unit) => (
                <SelectItem key={unit.key} value={unit.key}>
                  {unit.label}
                </SelectItem>
              ))}
            </Select>
          </div>
          
          <div className="flex gap-2">
            <Input
              label="Calories"
              labelPlacement="outside"
              placeholder="Calories"
              type="number"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              size="sm"
              className="flex-1"
              classNames={{ input: "text-sm" }}
              inputMode="decimal"
            />
            <Input
              label="Protein (g)"
              labelPlacement="outside"
              placeholder="Protein (g)"
              type="number"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              size="sm"
              className="flex-1"
              classNames={{ input: "text-sm" }}
              inputMode="decimal"
            />
          </div>
          
          <div className="flex gap-2 justify-between">
            {initial && (
              <Button 
                type="button" 
                color="danger" 
                variant="ghost"
                onClick={handleDelete}
                disabled={deleting}
                size="sm"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onCancel} size="sm">
                Cancel
              </Button>
              <Button type="submit" className="btn btn-primary" disabled={saving} size="sm">
                {saving ? 'Saving...' : 'Save'}
              </Button>
              {!initial && onSaveAndAdd && (
                <Button 
                  type="button" 
                  className="btn btn-primary" 
                  disabled={saving} 
                  size="sm"
                  onClick={handleSaveAndAdd}
                >
                  {saving ? 'Saving...' : 'Save and Add Food'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
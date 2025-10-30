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

export default function FoodForm({ initial, onCancel, onSaved, onDelete }) {
  const [name, setName] = useState("");
  const [baseAmount, setBaseAmount] = useState(100);
  const [baseUnit, setBaseUnit] = useState("grams");
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
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
      setCalories(Number(initial.calories) ?? 0);
      setProtein(initial.protein != null ? Number(initial.protein) : 0);
    } else {
      setName("");
      setBaseAmount(100);
      setBaseUnit("grams");
      setCalories(0);
      setProtein(0);
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
      const res = await fetch(initial ? `${API}/api/foods/${initial.id}` : `${API}/api/foods`, {
        method: initial ? 'PUT' : 'POST',
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

  return (
    <Card className="card mt-4">
      <CardBody className="card-pad">
        <h3 className="heading-2" style={{ marginBottom: 12 }}>
          {initial ? 'Edit Food' : 'Add Food'}
        </h3>
        {error && <div className="text-red-500 text-sm" style={{ marginBottom: 12 }}>{error}</div>}
        
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Name"
            labelPlacement="outside"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
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
              required
              size="sm"
              className="flex-1"
              classNames={{ input: "text-sm" }}
            />
            <Select
              label="Unit"
              labelPlacement="outside"
              placeholder="Unit"
              selectedKeys={[baseUnit]}
              onSelectionChange={(keys) => setBaseUnit(Array.from(keys)[0])}
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
              required
              size="sm"
              className="flex-1"
              classNames={{ input: "text-sm" }}
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
            </div>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
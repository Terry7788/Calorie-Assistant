"use client";

import { useEffect, useMemo, useState } from "react";
import { API } from "../lib/api";
import { Input, Button } from "@nextui-org/react";
import FoodForm from "../components/FoodForm";
import MealItemCard from "../components/MealItemCard";
import HamburgerButton from "../components/HamburgerButton";
import SaveMealModal from "../components/SaveMealModal";

export default function HomePage() {
  const [foods, setFoods] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingFood, setEditingFood] = useState(null);
  const [totalCalories, setTotalCalories] = useState(0);
  const [totalProtein, setTotalProtein] = useState(0);
  const [mealItems, setMealItems] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);

  async function loadFoods(q = "") {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API}/api/foods${q ? `?search=${encodeURIComponent(q)}` : ""}`);
      const data = await res.json();
      setFoods(Array.isArray(data) ? data : []);
    } catch (e) {
      setError("Failed to load foods");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFoods("");
  }, []);

  const filteredFoods = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return foods;
    return foods.filter((f) => f.name.toLowerCase().includes(q));
  }, [foods, search]);

  function onAddedOrUpdated(food) {
    setShowForm(false);
    setEditingFood(null);
    loadFoods(search);
  }


  function addCalories(food, servings) {
    const caloriesPerServing = Number(food.calories);
    const totalCaloriesToAdd = caloriesPerServing * Number(servings);
    setTotalCalories(prev => prev + totalCaloriesToAdd);
  }

  function addToMeal(food) {
    const exists = mealItems.some(item => item.food.id === food.id);
    if (exists) return; // do not increment or change totals if already present
    setMealItems(prev => [...prev, { food, servings: 1, id: Date.now() }]);
  }

  function updateMealItem(itemId, newServings) {
    setMealItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, servings: newServings }
        : item
    ));
  }

  function removeFromMeal(itemId) {
    setMealItems(prev => prev.filter(item => item.id !== itemId));
  }

  // Recompute totals automatically
  useEffect(() => {
    const totals = mealItems.reduce(
      (acc, item) => {
        acc.cal += Number(item.food.calories) * Number(item.servings);
        const proteinPerBase = item.food.protein != null ? Number(item.food.protein) : 0;
        acc.pro += proteinPerBase * Number(item.servings);
        return acc;
      },
      { cal: 0, pro: 0 }
    );
    setTotalCalories(totals.cal);
    setTotalProtein(totals.pro);
  }, [mealItems]);

  function editFoodInMeal(itemId) {
    const item = mealItems.find(item => item.id === itemId);
    if (item) {
      setEditingFood(item.food);
      setShowForm(true);
    }
  }

  function handleDeleteFood(foodId) {
    // Remove from meal items if it exists
    setMealItems(prev => prev.filter(item => item.food.id !== foodId));
    // Refresh the foods list
    loadFoods(search);
    // Close the form
    setShowForm(false);
    setEditingFood(null);
  }

  return (
    <div className="container-mobile">
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-3">
          <HamburgerButton />
          <h1 className="heading-1" style={{ margin: 0 }}>Food Database</h1>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="flex gap-2 flex-wrap">
          <div className="summary-pill">Total calories: {totalCalories.toFixed(0)}</div>
          <div className="summary-pill">Total protein: {totalProtein.toFixed(1)} g</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="flex gap-2 items-center" style={{ marginBottom: 12 }}>
          <Input
            placeholder="Search foods"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            isClearable
            onClear={() => setSearch("")}
            size="sm"
            className="flex-1"
            aria-label="Search foods"
          />
          <Button 
            className="btn btn-soft"
            size="sm"
            onClick={() => { setEditingFood(null); setShowForm(true); }}
            aria-label="Add food"
          >
            + Add
          </Button>
        </div>

        {showForm && (
          <FoodForm
            initial={editingFood}
            onCancel={() => { setShowForm(false); setEditingFood(null); }}
            onSaved={onAddedOrUpdated}
            onDelete={handleDeleteFood}
          />
        )}

        {error && <div className="text-red-500 text-sm" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      {mealItems.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <h2 className="heading-2" style={{ margin: 0 }}>Current meal</h2>
            <Button 
              className="btn btn-primary"
              size="sm"
              onClick={() => setShowSaveModal(true)}
              aria-label="Save meal"
            >
              Save Meal
            </Button>
          </div>
          <div className="space-y-3">
            {mealItems.map((item) => (
              <MealItemCard
                key={item.id}
                item={item}
                onUpdateServings={updateMealItem}
                onRemove={removeFromMeal}
                onEdit={editFoodInMeal}
              />
            ))}
          </div>
        </div>
      )}

      <SaveMealModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        mealItems={mealItems}
        onSaved={() => {
          setShowSaveModal(false);
          // Optionally show success message or refresh saved meals
        }}
      />

      <div className="card card-pad">
        {loading ? (
          <div className="text-center text-muted">Loading...</div>
        ) : filteredFoods.length === 0 ? (
          <div className="text-center text-muted">No foods yet</div>
        ) : (
          <div>
            {filteredFoods.map((f, idx) => {
              const isInMeal = mealItems.some(item => item.food.id === f.id);
              return (
              <div key={f.id} className={`flex items-center justify-between py-3 ${idx !== filteredFoods.length - 1 ? 'border-b' : ''}`} style={{ borderColor: 'var(--border)' }}>
                <div className="flex-1">
                  <div className="font-medium">{f.name}</div>
                  <div className="text-muted text-sm">
                    {Number(f.baseAmount)} {f.baseUnit} · {Number(f.calories)} kcal
                    {f.protein != null ? ` · ${Number(f.protein)} g protein` : ''}
                  </div>
                </div>
                <Button 
                  className="btn btn-soft"
                  size="sm"
                  onClick={() => addToMeal(f)}
                  aria-label={`Add ${f.name} to meal`}
                  disabled={isInMeal}
                >
                  {isInMeal ? 'Added' : 'Add'}
                </Button>
              </div>
            );})}
          </div>
        )}
      </div>
    </div>
  );
}
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { API } from "../lib/api";
import { getSocket } from "../lib/socket";
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
  const [loadingMeal, setLoadingMeal] = useState(true);
  const searchTimeoutRef = useRef(null);

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
    loadCurrentMeal();
    
    // Set up Socket.IO listener for real-time updates
    const socket = getSocket();
    
    const handleMealUpdate = (items) => {
      // Transform API format to component format
      const transformed = items.map((item) => ({
        id: item.id,
        food: {
          id: item.foodId,
          name: item.name,
          baseAmount: item.baseAmount,
          baseUnit: item.baseUnit,
          calories: item.calories,
          protein: item.protein,
        },
        servings: item.servings,
      }));
      setMealItems(transformed);
    };
    
    const handleFoodCreated = (food) => {
      // Add new food to the list
      // Note: If there's an active search, the food will be filtered by the search query
      setFoods((prev) => {
        // Check if food already exists (shouldn't happen, but just in case)
        if (prev.some(f => f.id === food.id)) {
          return prev;
        }
        // Add the new food and sort by name
        const updated = [...prev, food];
        return updated.sort((a, b) => a.name.localeCompare(b.name));
      });
    };
    
    const handleFoodUpdated = (food) => {
      // Update the food in the list
      setFoods((prev) => {
        const updated = prev.map((f) => (f.id === food.id ? food : f));
        // Re-sort to maintain alphabetical order
        return updated.sort((a, b) => a.name.localeCompare(b.name));
      });
      
      // Also update in meal items if present
      setMealItems((prev) =>
        prev.map((item) =>
          item.food.id === food.id
            ? { ...item, food }
            : item
        )
      );
    };
    
    const handleFoodDeleted = ({ id }) => {
      // Remove the food from the list
      setFoods((prev) => prev.filter((f) => f.id !== id));
      
      // Also remove from meal items if present
      setMealItems((prev) => prev.filter((item) => item.food.id !== id));
    };
    
    socket.on("meal-updated", handleMealUpdate);
    socket.on("food-created", handleFoodCreated);
    socket.on("food-updated", handleFoodUpdated);
    socket.on("food-deleted", handleFoodDeleted);

    return () => {
      socket.off("meal-updated", handleMealUpdate);
      socket.off("food-created", handleFoodCreated);
      socket.off("food-updated", handleFoodUpdated);
      socket.off("food-deleted", handleFoodDeleted);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Debounced search - refetch on each keystroke with debounce
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout to fetch after user stops typing
    searchTimeoutRef.current = setTimeout(() => {
      loadFoods(search);
    }, 300); // 300ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  async function loadCurrentMeal() {
    try {
      setLoadingMeal(true);
      const res = await fetch(`${API}/api/current-meal`);
      const data = await res.json();
      if (Array.isArray(data)) {
        // Transform API format to component format
        const transformed = data.map((item) => ({
          id: item.id,
          food: {
            id: item.foodId,
            name: item.name,
            baseAmount: item.baseAmount,
            baseUnit: item.baseUnit,
            calories: item.calories,
            protein: item.protein,
          },
          servings: item.servings,
        }));
        setMealItems(transformed);
      }
    } catch (e) {
      console.error("Failed to load current meal", e);
    } finally {
      setLoadingMeal(false);
    }
  }

  // No client-side filtering needed - server handles it
  const filteredFoods = foods;

  function onAddedOrUpdated(food) {
    setShowForm(false);
    setEditingFood(null);
    // Don't reload foods - Socket.IO will update them automatically
  }


  function addCalories(food, servings) {
    const caloriesPerServing = Number(food.calories);
    const totalCaloriesToAdd = caloriesPerServing * Number(servings);
    setTotalCalories(prev => prev + totalCaloriesToAdd);
  }

  async function addToMeal(food) {
    try {
      const res = await fetch(`${API}/api/current-meal/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodId: food.id, servings: 1 }),
      });
      if (!res.ok) {
        console.error("Failed to add item to meal");
      }
      // Socket.IO will update the UI automatically
    } catch (e) {
      console.error("Failed to add item to meal", e);
    }
  }

  async function updateMealItem(itemId, newServings) {
    try {
      const res = await fetch(`${API}/api/current-meal/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servings: newServings }),
      });
      if (!res.ok) {
        console.error("Failed to update item");
      }
      // Socket.IO will update the UI automatically
    } catch (e) {
      console.error("Failed to update item", e);
    }
  }

  async function removeFromMeal(itemId) {
    try {
      const res = await fetch(`${API}/api/current-meal/items/${itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        console.error("Failed to remove item");
      }
      // Socket.IO will update the UI automatically
    } catch (e) {
      console.error("Failed to remove item", e);
    }
  }

  async function clearCurrentMeal() {
    try {
      const res = await fetch(`${API}/api/current-meal`, {
        method: "DELETE",
      });
      if (!res.ok) {
        console.error("Failed to clear meal");
      }
      // Socket.IO will update the UI automatically
    } catch (e) {
      console.error("Failed to clear meal", e);
    }
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

  async function handleDeleteFood(foodId) {
    // Remove from meal items if it exists
    const mealItem = mealItems.find(item => item.food.id === foodId);
    if (mealItem) {
      await removeFromMeal(mealItem.id);
    }
    // Don't reload foods - Socket.IO will update them automatically
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
            onClear={() => {
              setSearch("");
              loadFoods("");
            }}
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
            <div className="flex gap-2">
              <Button 
                className="btn btn-ghost"
                size="sm"
                onClick={clearCurrentMeal}
                aria-label="Clear meal"
              >
                Clear
              </Button>
              <Button 
                className="btn btn-primary"
                size="sm"
                onClick={() => setShowSaveModal(true)}
                aria-label="Save meal"
              >
                Save Meal
              </Button>
            </div>
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
              const mealItem = mealItems.find(item => item.food.id === f.id);
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
                >
                  {mealItem ? 'Update' : 'Add'}
                </Button>
              </div>
            );})}
          </div>
        )}
      </div>
    </div>
  );
}
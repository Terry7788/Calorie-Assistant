"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { API } from "../lib/api";
import { getSocket } from "../lib/socket";
import { Input, Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@nextui-org/react";
import FoodForm from "../components/FoodForm";
import MealItemCard from "../components/MealItemCard";
import HamburgerButton from "../components/HamburgerButton";
import SaveMealModal from "../components/SaveMealModal";
import dynamic from "next/dynamic";

const VoiceInputButton = dynamic(() => import("../components/VoiceInputButton"), {
  ssr: false,
});

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
  const [showClearModal, setShowClearModal] = useState(false);
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
      console.log('[DEBUG] handleMealUpdate received items:', JSON.stringify(items));
      // Transform API format to component format
      const transformed = items.map((item) => {
        const foodObj = {
          id: item.foodId,
          name: item.name,
          baseAmount: item.baseAmount,
          baseUnit: item.baseUnit,
          calories: item.calories,
          protein: item.protein,
        };
        
        return {
          id: item.id,
          food: foodObj,
          servings: item.servings,
        };
      });
      console.log('[DEBUG] handleMealUpdate transformed to:', JSON.stringify(transformed));
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
          isTemporary: item.isTemporary || false,
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

  async function addToMeal(food, servings = 1) {
    try {
      // For database foods, send foodId
      const res = await fetch(`${API}/api/current-meal/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodId: food.id, servings }),
      });
      if (!res.ok) {
        console.error("Failed to add item to meal");
      }
      // Socket.IO will update the UI automatically
    } catch (e) {
      console.error("Failed to add item to meal", e);
    }
  }

  async function handleChangeCommand(fromFoodName, toFoodName) {
    // Find the food item in the current meal that matches "from"
    const mealItem = mealItems.find(item => 
      item.food.name.toLowerCase().includes(fromFoodName.toLowerCase()) ||
      fromFoodName.toLowerCase().includes(item.food.name.toLowerCase())
    );

    if (!mealItem) {
      setError(`"${fromFoodName}" not found in current meal`);
      return;
    }

    // Search for the replacement food in the database
    try {
      const searchRes = await fetch(`${API}/api/foods?search=${encodeURIComponent(toFoodName)}`);
      const searchResults = await searchRes.json();
      
      // Try to find an exact or close match
      const exactMatch = searchResults.find(f => 
        f.name.toLowerCase() === toFoodName.toLowerCase()
      );
      
      const closeMatch = searchResults.find(f => 
        f.name.toLowerCase().includes(toFoodName.toLowerCase()) ||
        toFoodName.toLowerCase().includes(f.name.toLowerCase())
      );

      const replacementFood = exactMatch || closeMatch;

      if (!replacementFood) {
        setError(`"${toFoodName}" not found in database`);
        return;
      }

      // Remove the old food from meal
      await removeFromMeal(mealItem.id);

      // Add the new food with the same servings
      await addToMeal(replacementFood, mealItem.servings);
      
      setError(""); // Clear any errors on success
    } catch (e) {
      console.error("Error changing food:", e);
      setError("Failed to change food");
    }
  }

  async function handleVoiceInputFromMainPage(parsedFoods) {
    console.log('[DEBUG] handleVoiceInputFromMainPage called with:', JSON.stringify(parsedFoods));
    
    // Check if it's a change command
    if (parsedFoods && parsedFoods.command === 'change') {
      console.log('[DEBUG] Detected change command');
      await handleChangeCommand(parsedFoods.from, parsedFoods.to);
      return;
    }

    // Database search mode - proceed with database search
    console.log('[DEBUG] Processing database food - WILL SEARCH DATABASE');
    console.log('[DEBUG] Food to search for:', JSON.stringify(parsedFoods));

    // Handle both single food and array of foods (from database)
    const foods = Array.isArray(parsedFoods) ? parsedFoods : [parsedFoods];
    
    if (foods.length === 0 || !foods[0].name) {
      setError("Could not identify food name from voice input");
      return;
    }

    let foundCount = 0;
    let notFoundCount = 0;

    // Process each food item
    for (const parsed of foods) {
      if (!parsed.name) continue;
      
      // Search for the food in the database
      try {
        console.log('[DEBUG] Searching database for:', parsed.name);
        const searchRes = await fetch(`${API}/api/foods?search=${encodeURIComponent(parsed.name)}`);
        const searchResults = await searchRes.json();
        console.log('[DEBUG] Database search results:', searchResults.length, 'items found');
        
        // Try to find an exact or close match
        const exactMatch = searchResults.find(f => 
          f.name.toLowerCase() === parsed.name.toLowerCase()
        );
        
        const closeMatch = searchResults.find(f => 
          f.name.toLowerCase().includes(parsed.name.toLowerCase()) ||
          parsed.name.toLowerCase().includes(f.name.toLowerCase())
        );

        const matchedFood = exactMatch || closeMatch;

        if (matchedFood) {
          // Food found - add it to the meal
          foundCount++;
          // Calculate servings based on parsed amount
          let servings = 1;
          
          if (parsed.baseAmount !== null && parsed.baseAmount !== undefined) {
            if (parsed.baseUnit === "servings") {
              // When user specifies servings (e.g., "2 apples"), use that number directly
              servings = parsed.baseAmount;
            } else if (parsed.baseUnit === matchedFood.baseUnit) {
              // Same unit (grams or ml) - calculate servings
              if (matchedFood.baseAmount) {
                servings = parsed.baseAmount / matchedFood.baseAmount;
              } else {
                // If no baseAmount in DB, default to 100
                const defaultBase = parsed.baseUnit === "ml" ? 100 : 100;
                servings = parsed.baseAmount / defaultBase;
              }
            } else if (parsed.baseUnit === "grams" && matchedFood.baseUnit === "servings") {
              // User said grams but food is in servings - can't convert, default to 1 serving
              // The parsed amount (e.g., 100g) doesn't make sense as servings
              servings = 1;
            } else if (parsed.baseUnit === "ml" && matchedFood.baseUnit === "servings") {
              // User said ml but food is in servings - can't convert, default to 1 serving
              servings = 1;
            } else if (parsed.baseUnit === "grams" && matchedFood.baseUnit === "ml") {
              // Can't convert grams to ml - default to 1 serving
              servings = 1;
            } else if (parsed.baseUnit === "ml" && matchedFood.baseUnit === "grams") {
              // Can't convert ml to grams - default to 1 serving
              servings = 1;
            } else {
              // Units don't match and no conversion possible - default to 1 serving
              servings = 1;
            }
          }
          
          await addToMeal(matchedFood, servings);
        } else {
          // Food not found - show error message
          console.log('[DEBUG] Food not found in database:', parsed.name);
          notFoundCount++;
          if (notFoundCount === 1) {
            setError(`"${parsed.name}" not found in database`);
          } else {
            setError(`${notFoundCount} food(s) not found in database`);
          }
        }
      } catch (e) {
        console.error("Error searching for food:", e);
        setError("Failed to search for food");
      }
    }

    // Clear errors if all foods found
    if (notFoundCount === 0) {
      setError("");
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
        setError("Failed to clear meal");
      } else {
        setShowClearModal(false);
      }
      // Socket.IO will update the UI automatically
    } catch (e) {
      console.error("Failed to clear meal", e);
      setError("Failed to clear meal");
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
          <VoiceInputButton 
            onFoodParsed={handleVoiceInputFromMainPage}
            disabled={loading}
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
            onSaveAndAdd={(food) => {
              onAddedOrUpdated(food);
              addToMeal(food);
            }}
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
                className="btn btn-soft"
                size="sm"
                onClick={() => setShowClearModal(true)}
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

      <Modal isOpen={showClearModal} onClose={() => setShowClearModal(false)} size="sm">
        <ModalContent>
          <ModalHeader>Clear Current Meal</ModalHeader>
          <ModalBody>
            <p>Are you sure you want to clear all items from the current meal? This action cannot be undone.</p>
          </ModalBody>
          <ModalFooter>
            <Button 
              className="btn btn-soft" 
              onClick={() => setShowClearModal(false)}
              size="sm"
            >
              Cancel
            </Button>
            <Button 
              className="btn btn-primary" 
              onClick={clearCurrentMeal}
              size="sm"
            >
              Clear
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

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
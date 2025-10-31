"use client";

import { useState, useEffect, useMemo } from "react";
import { API } from "../../lib/api";
import { Card, CardBody, Input, Button } from "@nextui-org/react";
import HamburgerButton from "../../components/HamburgerButton";

export default function SavedMealsPage() {
  const [savedMeals, setSavedMeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [mealDetail, setMealDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function loadSavedMeals(q = "") {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/saved-meals${q ? `?search=${encodeURIComponent(q)}` : ""}`);
      if (!res.ok) throw new Error("Failed to load saved meals");
      const data = await res.json();
      setSavedMeals(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load saved meals", e);
      setSavedMeals([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSavedMeals("");
  }, []);

  const filteredMeals = useMemo(() => {
    if (!search.trim()) return savedMeals;
    const q = search.trim().toLowerCase();
    return savedMeals.filter((meal) => meal.name?.toLowerCase().includes(q));
  }, [savedMeals, search]);

  async function loadMealDetail(mealId) {
    if (selectedMeal === mealId && mealDetail) {
      // Already loaded and selected, just toggle
      setSelectedMeal(null);
      setMealDetail(null);
      return;
    }

    try {
      setLoadingDetail(true);
      setSelectedMeal(mealId);
      const res = await fetch(`${API}/api/saved-meals/${mealId}`);
      if (!res.ok) throw new Error("Failed to load meal details");
      const data = await res.json();
      setMealDetail(data);
    } catch (e) {
      console.error("Failed to load meal detail", e);
      setSelectedMeal(null);
      setMealDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleDeleteMeal(mealId, e) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this meal?")) return;

    try {
      const res = await fetch(`${API}/api/saved-meals/${mealId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete meal");
      loadSavedMeals(search);
      if (selectedMeal === mealId) {
        setSelectedMeal(null);
        setMealDetail(null);
      }
    } catch (e) {
      console.error("Failed to delete meal", e);
      alert("Failed to delete meal");
    }
  }

  return (
    <div className="container-mobile">
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-3">
          <HamburgerButton />
          <h1 className="heading-1" style={{ margin: 0 }}>Saved Meals</h1>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <Input
          placeholder="Search meals"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          isClearable
          onClear={() => setSearch("")}
          size="sm"
          className="flex-1"
          aria-label="Search meals"
        />
      </div>

      {loading ? (
        <div className="card card-pad">
          <div className="text-center text-muted">Loading...</div>
        </div>
      ) : filteredMeals.length === 0 ? (
        <div className="card card-pad">
          <div className="text-center text-muted" style={{ padding: "40px 20px" }}>
            <p>No saved meals yet.</p>
            <p className="text-sm" style={{ marginTop: 8 }}>
              {search ? "No meals match your search." : "Save meals from the Food Database page to see them here."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMeals.map((meal) => {
            const isSelected = selectedMeal === meal.id;
            return (
              <Card key={meal.id} className="card">
                <CardBody className="card-pad">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => loadMealDetail(meal.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="font-semibold" style={{ marginBottom: 8 }}>
                        {meal.name}
                      </div>
                      <div className="text-sm text-muted">
                        {meal.itemCount || 0} items · {meal.totalCalories?.toFixed(0) || 0} calories
                        {meal.totalProtein ? ` · ${meal.totalProtein.toFixed(1)} g protein` : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => loadMealDetail(meal.id)}
                        disabled={loadingDetail}
                      >
                        {isSelected ? "Hide" : "View"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        color="danger"
                        onClick={(e) => handleDeleteMeal(meal.id, e)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {isSelected && mealDetail && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border, #e5e7eb)" }}>
                      {loadingDetail ? (
                        <div className="text-center text-muted">Loading details...</div>
                      ) : mealDetail.items && mealDetail.items.length > 0 ? (
                        <div className="space-y-2">
                          {mealDetail.items.map((item) => {
                            const totalCalories = (Number(item.calories) * Number(item.servings)).toFixed(1);
                            const totalProtein = item.protein != null 
                              ? (Number(item.protein) * Number(item.servings)).toFixed(1)
                              : null;
                            
                            // Calculate display amount
                            let displayAmount;
                            if (item.baseUnit === 'servings') {
                              displayAmount = Number(item.servings).toFixed(2);
                            } else {
                              displayAmount = (Number(item.servings) * Number(item.baseAmount)).toFixed(1);
                            }

                            return (
                              <div
                                key={item.id}
                                className="flex items-center justify-between py-2 border-b"
                                style={{ borderColor: "var(--border, #e5e7eb)" }}
                              >
                                <div className="flex-1">
                                  <div className="font-medium">{item.name}</div>
                                  <div className="text-sm text-muted">
                                    {displayAmount} {item.baseUnit} · {totalCalories} calories
                                    {totalProtein ? ` · ${totalProtein} g protein` : ""}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border, #e5e7eb)" }}>
                            <div className="text-sm font-semibold">
                              Total: {meal.totalCalories?.toFixed(0) || 0} calories
                              {meal.totalProtein ? ` · ${meal.totalProtein.toFixed(1)} g protein` : ""}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-muted">No items in this meal</div>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

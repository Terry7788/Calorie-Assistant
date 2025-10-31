"use client";

import { useState, useEffect } from "react";
import { Card, CardBody } from "@nextui-org/react";
import HamburgerButton from "../../components/HamburgerButton";

export default function SavedMealsPage() {
  const [savedMeals, setSavedMeals] = useState([]);

  useEffect(() => {
    // Load saved meals from localStorage or API in the future
    const saved = localStorage.getItem("savedMeals");
    if (saved) {
      try {
        setSavedMeals(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved meals", e);
      }
    }
  }, []);

  return (
    <div className="container-mobile">
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-3">
          <HamburgerButton />
          <h1 className="heading-1" style={{ margin: 0 }}>Saved Meals</h1>
        </div>
      </div>

      {savedMeals.length === 0 ? (
        <div className="card card-pad">
          <div className="text-center text-muted" style={{ padding: "40px 20px" }}>
            <p>No saved meals yet.</p>
            <p className="text-sm" style={{ marginTop: 8 }}>
              Save meals from the Food Database page to see them here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {savedMeals.map((meal, idx) => (
            <Card key={idx} className="card">
              <CardBody className="card-pad">
                <div className="font-semibold" style={{ marginBottom: 8 }}>
                  {meal.name || `Meal ${idx + 1}`}
                </div>
                <div className="text-sm text-muted">
                  {meal.items?.length || 0} items · {meal.totalCalories?.toFixed(0) || 0} calories
                  {meal.totalProtein ? ` · ${meal.totalProtein.toFixed(1)} g protein` : ""}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


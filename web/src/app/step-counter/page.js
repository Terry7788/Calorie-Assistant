"use client";

import { useState, useEffect } from "react";
import { Input, Button } from "@nextui-org/react";
import HamburgerButton from "../../components/HamburgerButton";

export default function StepCounterPage() {
  const [time, setTime] = useState("");
  const [speed, setSpeed] = useState("5.0");
  const [height, setHeight] = useState("183");
  const [steps, setSteps] = useState(0);

  // Calculate steps whenever inputs change
  useEffect(() => {
    const timeNum = parseFloat(time);
    const speedNum = parseFloat(speed);
    const heightNum = parseFloat(height);

    if (timeNum > 0 && speedNum > 0 && heightNum > 0) {
      // Formula breakdown:
      // 1. Convert time to hours
      const timeInHours = timeNum / 60;
      // 2. Calculate distance in km
      const distanceKm = speedNum * timeInHours;
      // 3. Convert distance to meters
      const distanceM = distanceKm * 1000;
      // 4. Calculate step length in meters (0.415 × height in cm, then divide by 100 to get meters)
      const stepLengthCm = 0.415 * heightNum;
      const stepLengthM = stepLengthCm / 100;
      // 5. Calculate steps
      const calculatedSteps = distanceM / stepLengthM;
      setSteps(calculatedSteps);
    } else {
      setSteps(0);
    }
  }, [time, speed, height]);

  function handleReset() {
    setTime("");
    setSpeed("5.0");
    setHeight("183");
  }

  return (
    <div className="container-mobile">
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-3">
          <HamburgerButton />
          <h1 className="heading-1" style={{ margin: 0 }}>Step Counter</h1>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="text-sm font-medium" style={{ marginBottom: 8 }}>
          Quick Time
        </div>
        <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
          {[10, 15, 20, 25, 30, 35, 45, 50, 55, 60].map((minutes) => (
            <Button
              key={minutes}
              className="btn btn-primary"
              size="sm"
              onClick={() => setTime(String(minutes))}
              aria-label={`Set time to ${minutes} minutes`}
            >
              {minutes} min
            </Button>
          ))}
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 16 }}>
          <label className="text-sm font-medium" style={{ display: "block", marginBottom: 8 }}>
            Walking Time (minutes)
          </label>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="Enter time in minutes"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            min="0"
            step="1"
            size="sm"
            className="flex-1"
            aria-label="Walking time in minutes"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="text-sm font-medium" style={{ display: "block", marginBottom: 8 }}>
            Walking Speed (km/h)
          </label>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Enter speed"
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
            min="0"
            step="0.1"
            size="sm"
            className="flex-1"
            aria-label="Walking speed in km/h"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="text-sm font-medium" style={{ display: "block", marginBottom: 8 }}>
            Height (cm)
          </label>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="Enter height"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            min="0"
            step="1"
            size="sm"
            className="flex-1"
            aria-label="Height in centimeters"
          />
        </div>

        <Button
          className="btn btn-ghost"
          size="sm"
          onClick={handleReset}
          aria-label="Reset to defaults"
        >
          Reset to Defaults
        </Button>
      </div>

      <div className="card card-pad">
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div className="text-muted text-sm" style={{ marginBottom: 8 }}>
            Estimated Steps
          </div>
          <div className="heading-1" style={{ fontSize: "32px", fontWeight: "700", color: "var(--accent)" }}>
            {steps > 0 ? Math.round(steps).toLocaleString() : "0"}
          </div>
          {time && speed && height && steps > 0 && (
            <div className="text-muted text-sm" style={{ marginTop: 8 }}>
              Walking {time} min at {speed} km/h
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


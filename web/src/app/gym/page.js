"use client";

import { useEffect, useMemo, useState } from "react";
import { API } from "../../lib/api";
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@nextui-org/react";
import HamburgerButton from "../../components/HamburgerButton";

function formatSetResult(setRow) {
  if (!setRow) return "—";
  const w = setRow.weightKg ?? "-";
  const r = setRow.reps ?? "-";
  return `${w}kg × ${r}`;
}

function formatLastSessionDate(lastBySet) {
  if (!lastBySet) return null;
  const rows = Object.values(lastBySet).filter(Boolean);
  if (!rows.length) return null;

  const latest = rows
    .map((row) => new Date(row.startedAt))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b - a)[0];

  return latest ? latest.toLocaleDateString() : null;
}

export default function GymPage() {
  const [sessions, setSessions] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startingWorkout, setStartingWorkout] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [deletingSession, setDeletingSession] = useState(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [completingSession, setCompletingSession] = useState(null);
  const [isCompletingSession, setIsCompletingSession] = useState(false);
  const [savingSetId, setSavingSetId] = useState(null);

  async function loadSessions() {
    const res = await fetch(`${API}/api/gym/sessions`);
    const data = await res.json();
    setSessions(Array.isArray(data) ? data : []);
  }

  async function loadExercises() {
    const res = await fetch(`${API}/api/gym/exercises`);
    const data = await res.json();
    setExercises(Array.isArray(data) ? data : []);
  }

  async function loadSessionDetail(id) {
    if (!id) {
      setActiveSession(null);
      return;
    }
    const res = await fetch(`${API}/api/gym/sessions/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setActiveSession(data);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await Promise.all([loadSessions(), loadExercises()]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function startWorkout() {
    try {
      setStartingWorkout(true);
      const res = await fetch(`${API}/api/gym/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Workout ${new Date().toLocaleDateString()}` }),
      });
      const created = await res.json();
      await loadSessions();
      await loadSessionDetail(created.id);
    } finally {
      setStartingWorkout(false);
    }
  }

  async function addExerciseToSession() {
    if (!activeSession?.id || !selectedExerciseId) return;
    await fetch(`${API}/api/gym/sessions/${activeSession.id}/exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId: Number(selectedExerciseId) }),
    });
    setSelectedExerciseId("");
    await loadSessionDetail(activeSession.id);
    await loadSessions();
  }

  async function updateSet(setId, weightKg, reps) {
    try {
      setSavingSetId(setId);
      await fetch(`${API}/api/gym/sets/${setId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weightKg: weightKg === "" ? null : Number(weightKg),
          reps: reps === "" ? null : Number(reps),
        }),
      });
      await loadSessionDetail(activeSession.id);
    } finally {
      setSavingSetId(null);
    }
  }

  async function deleteSession(sessionId) {
    try {
      setIsDeletingSession(true);
      await fetch(`${API}/api/gym/sessions/${sessionId}`, { method: "DELETE" });
      setDeletingSession(null);
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      await loadSessions();
    } finally {
      setIsDeletingSession(false);
    }
  }

  async function completeSession(sessionId) {
    try {
      setIsCompletingSession(true);
      console.log("Completing session:", sessionId);
      const res = await fetch(`${API}/api/gym/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });

      console.log("Response:", res.status);
      if (!res.ok) {
        const err = await res.text();
        console.error("Error:", err);
        alert("Failed to complete workout: " + err);
        return;
      }

      setCompletingSession(null);
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
      }
      await loadSessions();
    } catch (e) {
      console.error("Complete session error:", e);
    } finally {
      setIsCompletingSession(false);
    }
  }

  const availableExercises = useMemo(() => {
    if (!activeSession?.exercises) return exercises;
    const used = new Set(activeSession.exercises.map((e) => e.exerciseId));
    return exercises.filter((e) => !used.has(e.id));
  }, [exercises, activeSession]);

  return (
    <div className="container-mobile">
      <div className="card card-glass card-pad" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-3">
          <HamburgerButton />
          <h1 className="heading-1" style={{ margin: 0 }}>Gym Tracker</h1>
        </div>
      </div>

      <div
        className="card card-pad"
        style={{
          marginBottom: 12,
          background: "linear-gradient(135deg, rgba(255,255,255,0.62), rgba(212,234,247,0.42))",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.35)",
          transition: "all .25s ease",
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <h2 className="heading-2" style={{ margin: 0 }}>Workout Sessions</h2>
          <Button
            className="btn btn-primary"
            size="sm"
            onClick={startWorkout}
            isLoading={startingWorkout}
          >
            Start Workout
          </Button>
        </div>

        {loading ? (
          <div className="text-muted">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="text-muted">No sessions yet. Start your first workout.</div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="card card-pad"
                style={{
                  cursor: "pointer",
                  background: activeSession?.id === s.id ? "rgba(113,196,239,0.22)" : "rgba(255,255,255,0.45)",
                  border: "1px solid rgba(255,255,255,0.38)",
                  transition: "all .2s ease",
                }}
                onClick={() => loadSessionDetail(s.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{s.name || `Session #${s.id}`}</div>
                    <div className="text-sm text-muted">
                      {new Date(s.startedAt).toLocaleString()} · {s.exerciseCount} exercises
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="light"
                    color="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingSession(s);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeSession && (
        <div
          className="card card-pad"
          style={{
            background: "linear-gradient(160deg, rgba(255,255,255,.65), rgba(182,204,216,.28))",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.42)",
            animation: "fadeSlideIn .25s ease",
          }}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <h2 className="heading-2" style={{ margin: 0 }}>
              {activeSession.name || `Session #${activeSession.id}`}
            </h2>
            <Button
              color="success"
              size="sm"
              onClick={() => setCompletingSession(activeSession)}
              isDisabled={isCompletingSession}
            >
              Complete Workout
            </Button>
          </div>

          <div className="flex gap-2 items-center" style={{ marginBottom: 12 }}>
            <select
              className="input"
              style={{ flex: 1, height: 40, paddingTop: 0, paddingBottom: 0 }}
              value={selectedExerciseId}
              onChange={(e) => setSelectedExerciseId(e.target.value)}
            >
              <option value="">Add exercise...</option>
              {availableExercises.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
            <Button className="btn btn-soft" size="sm" onClick={addExerciseToSession}>
              Add
            </Button>
          </div>

          {activeSession.exercises?.length === 0 ? (
            <div className="text-muted">No exercises yet. Add one to begin.</div>
          ) : (
            <div className="space-y-3">
              {activeSession.exercises?.map((exercise) => {
                const sortedSets = [...(exercise.sets ?? [])].sort(
                  (a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0)
                );
                const lastSessionDate = formatLastSessionDate(exercise.lastBySet);

                return (
                  <div key={exercise.id} className="card card-pad" style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.4)" }}>
                    <div className="font-semibold" style={{ marginBottom: 10 }}>
                      {exercise.exerciseName}
                    </div>

                    <div className="flex gap-3" style={{ alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div className="text-xs text-muted" style={{ marginBottom: 6, letterSpacing: 0.2 }}>Current Session</div>
                        <div className="space-y-2">
                          {sortedSets.map((setRow) => (
                            <div
                              key={setRow.id}
                              className="flex items-center gap-2"
                              style={{
                                borderRadius: 10,
                                padding: "8px 10px",
                                background: "rgba(255,255,255,0.45)",
                                border: "1px solid rgba(255,255,255,0.4)",
                              }}
                            >
                              <div className="text-sm font-medium" style={{ width: 44 }}>Set {setRow.setNumber}</div>
                              <Input
                                type="number"
                                size="sm"
                                className="w-14"
                                label="Kg"
                                style={{ marginRight: 2 }}
                                value={setRow.weightKg ?? ""}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  setActiveSession((prev) => ({
                                    ...prev,
                                    exercises: prev.exercises.map((ex) =>
                                      ex.id !== exercise.id
                                        ? ex
                                        : {
                                            ...ex,
                                            sets: ex.sets.map((s) =>
                                              s.id === setRow.id ? { ...s, weightKg: next } : s
                                            ),
                                          }
                                    ),
                                  }));
                                }}
                                onBlur={(e) => updateSet(setRow.id, e.target.value, setRow.reps ?? "")}
                              />
                              <Input
                                type="number"
                                size="sm"
                                className="w-14"
                                label="Reps"
                                value={setRow.reps ?? ""}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  setActiveSession((prev) => ({
                                    ...prev,
                                    exercises: prev.exercises.map((ex) =>
                                      ex.id !== exercise.id
                                        ? ex
                                        : {
                                            ...ex,
                                            sets: ex.sets.map((s) =>
                                              s.id === setRow.id ? { ...s, reps: next } : s
                                            ),
                                          }
                                    ),
                                  }));
                                }}
                                onBlur={(e) => updateSet(setRow.id, setRow.weightKg ?? "", e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div
                        style={{
                          minWidth: 190,
                          borderRadius: 14,
                          padding: "10px 12px",
                          background: "linear-gradient(145deg, rgba(255,255,255,0.5), rgba(180,215,232,0.28))",
                          border: "1px solid rgba(255,255,255,0.45)",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45)",
                        }}
                      >
                        <div className="text-xs text-muted" style={{ marginBottom: 6, letterSpacing: 0.2 }}>
                          Past Session
                        </div>
                        <div className="text-sm" style={{ marginBottom: 8 }}>
                          Last session: {lastSessionDate || "—"}
                        </div>
                        <div className="space-y-1">
                          {sortedSets.map((setRow) => {
                            const last = exercise.lastBySet?.[setRow.setNumber];
                            return (
                              <div key={`past-${setRow.id}`} className="text-sm text-muted">
                                Set {setRow.setNumber}: {formatSetResult(last)}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {savingSetId && <div className="text-xs text-muted" style={{ marginTop: 8 }}>Saving set #{savingSetId}...</div>}
        </div>
      )}

      <Modal
        isOpen={!!completingSession}
        onClose={() => {
          if (!isCompletingSession) setCompletingSession(null);
        }}
        isDismissable={!isCompletingSession}
        isKeyboardDismissDisabled={isCompletingSession}
        size="sm"
      >
        <ModalContent>
          <ModalHeader>Finish this workout?</ModalHeader>
          <ModalBody>
            <p>
              This will mark{" "}
              <strong>{completingSession?.name || `Session #${completingSession?.id}`}</strong>
              {" "}as completed.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              className="btn btn-soft"
              size="sm"
              onClick={() => setCompletingSession(null)}
              isDisabled={isCompletingSession}
            >
              Cancel
            </Button>
            <Button
              color="success"
              size="sm"
              isLoading={isCompletingSession}
              onClick={() => completingSession?.id && completeSession(completingSession.id)}
            >
              Complete Workout
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={!!deletingSession}
        onClose={() => {
          if (!isDeletingSession) setDeletingSession(null);
        }}
        isDismissable={!isDeletingSession}
        isKeyboardDismissDisabled={isDeletingSession}
        size="sm"
      >
        <ModalContent>
          <ModalHeader>Delete workout session?</ModalHeader>
          <ModalBody>
            <p>
              This will permanently remove{" "}
              <strong>{deletingSession?.name || `Session #${deletingSession?.id}`}</strong>
              {deletingSession?.startedAt ? (
                <> ({new Date(deletingSession.startedAt).toLocaleString()})</>
              ) : null}
              {" "}and all logged sets.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              className="btn btn-soft"
              size="sm"
              onClick={() => setDeletingSession(null)}
              isDisabled={isDeletingSession}
            >
              Cancel
            </Button>
            <Button
              color="danger"
              size="sm"
              isLoading={isDeletingSession}
              onClick={() => deletingSession?.id && deleteSession(deletingSession.id)}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

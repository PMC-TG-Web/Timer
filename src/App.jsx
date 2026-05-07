import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Trash2,
  Play,
  Pause,
  RotateCcw,
  Bell,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  requestNotificationPermission,
  scheduleNotification,
  cancelAllNotifications,
} from "@/services/notifications";

const STORAGE_KEY = "seafood-boil-timer-items";
const TIMER_STATE_KEY = "seafood-boil-timer-state";

const DEFAULT_ITEM_PRESET = [
  { name: "Potatoes", minutes: 20 },
  { name: "Crab legs", minutes: 6 },
  { name: "Corn", minutes: 8 },
  { name: "Shrimp", minutes: 3 },
  { name: "Sausage", minutes: 12 },
  { name: "Lobster tails", minutes: 9 },
  { name: "Mussels", minutes: 5 },
  { name: "Clams", minutes: 4 },
  { name: "Crawfish", minutes: 5 },
];

function createDefaultItems() {
  return DEFAULT_ITEM_PRESET
    .slice()
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
    .map((item) => ({
      id: crypto.randomUUID(),
      name: item.name,
      minutes: item.minutes,
    }));
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultItems();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return createDefaultItems();

    return parsed.map((item) => ({
      id: String(item.id || crypto.randomUUID()),
      name: String(item.name || "New item"),
      minutes: Math.max(0, Number(item.minutes || 0)),
    }));
  } catch {
    return createDefaultItems();
  }
}

function loadTimerState() {
  try {
    const raw = localStorage.getItem(TIMER_STATE_KEY);
    if (!raw) {
      return {
        running: false,
        elapsed: 0,
        pausedElapsed: 0,
        runStartedAt: null,
        alertMessage: "",
        firedDropTimes: {},
      };
    }

    const parsed = JSON.parse(raw);
    const runStartedAt = Number(parsed.runStartedAt);

    return {
      running: Boolean(parsed.running),
      elapsed: Math.max(0, Number(parsed.elapsed || 0)),
      pausedElapsed: Math.max(0, Number(parsed.pausedElapsed || 0)),
      runStartedAt: Number.isFinite(runStartedAt) ? runStartedAt : null,
      alertMessage:
        typeof parsed.alertMessage === "string" ? parsed.alertMessage : "",
      firedDropTimes:
        parsed.firedDropTimes && typeof parsed.firedDropTimes === "object"
          ? parsed.firedDropTimes
          : {},
    };
  } catch {
    return {
      running: false,
      elapsed: 0,
      pausedElapsed: 0,
      runStartedAt: null,
      alertMessage: "",
      firedDropTimes: {},
    };
  }
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function beep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // Browser may block audio until user interaction; visual alerts still work.
  }
}

export default function SeafoodBoilTimer() {
  const [persistedTimerState] = useState(loadTimerState);

  const [items, setItems] = useState(loadItems);
  const [running, setRunning] = useState(persistedTimerState.running);
  const [elapsed, setElapsed] = useState(persistedTimerState.elapsed);
  const [pausedElapsed, setPausedElapsed] = useState(
    persistedTimerState.pausedElapsed,
  );
  const [runStartedAt, setRunStartedAt] = useState(
    persistedTimerState.runStartedAt,
  );
  const [alertMessage, setAlertMessage] = useState(
    persistedTimerState.alertMessage,
  );
  const [firedDropTimes, setFiredDropTimes] = useState(
    persistedTimerState.firedDropTimes,
  );
  const lastElapsedRef = useRef(persistedTimerState.elapsed);

  const longestSeconds = useMemo(() => {
    return Math.max(...items.map((i) => Number(i.minutes || 0) * 60), 0);
  }, [items]);

  const schedule = useMemo(() => {
    return items
      .map((item) => {
        const cookSeconds = Number(item.minutes || 0) * 60;
        const dropAt = Math.max(0, longestSeconds - cookSeconds);
        return {
          ...item,
          cookSeconds,
          dropAt,
          finishAt: longestSeconds,
        };
      })
      .sort((a, b) => a.dropAt - b.dropAt || b.cookSeconds - a.cookSeconds);
  }, [items, longestSeconds]);

  const nextDrop = useMemo(() => {
    return schedule.find((s) => elapsed < s.dropAt + 1 && !firedDropTimes[s.id]);
  }, [schedule, elapsed, firedDropTimes]);

  const remaining = Math.max(0, longestSeconds - elapsed);
  const progress =
    longestSeconds > 0 ? Math.min(100, (elapsed / longestSeconds) * 100) : 0;

  const computeElapsedNow = useCallback(
    (nowMs = Date.now()) => {
      if (!running || !runStartedAt) {
        return Math.min(pausedElapsed, longestSeconds);
      }

      const liveElapsed =
        pausedElapsed + Math.floor((nowMs - runStartedAt) / 1000);
      return Math.min(longestSeconds, Math.max(0, liveElapsed));
    },
    [running, runStartedAt, pausedElapsed, longestSeconds],
  );

  useEffect(() => {
    if (!running) return;

    const updateElapsed = () => {
      setElapsed(computeElapsedNow());
    };

    updateElapsed();
    const timerId = setInterval(updateElapsed, 1000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        updateElapsed();
      }
    };
    const handleFocus = () => updateElapsed();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(timerId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [running, pausedElapsed, longestSeconds, elapsed, computeElapsedNow]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem(
      TIMER_STATE_KEY,
      JSON.stringify({
        running,
        elapsed,
        pausedElapsed,
        runStartedAt,
        alertMessage,
        firedDropTimes,
      }),
    );
  }, [running, elapsed, pausedElapsed, runStartedAt, alertMessage, firedDropTimes]);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!running || longestSeconds <= 0) {
      cancelAllNotifications();
      return;
    }

    const scheduleDropNotifications = async () => {
      for (const item of schedule) {
        if (!firedDropTimes[item.id]) {
          const remainingSeconds = Math.max(0, item.dropAt - elapsed);
          await scheduleNotification(
            `drop-${item.id}`,
            "Drop in: " + item.name,
            `Time to add ${item.name} to the boil`,
            remainingSeconds,
          );
        }
      }

      const finishRemainingSeconds = Math.max(0, longestSeconds - elapsed);
      if (finishRemainingSeconds > 0) {
        await scheduleNotification(
          "boil-done",
          "Boil Complete!",
          "Pull everything out of the water",
          finishRemainingSeconds,
        );
      }
    };

    scheduleDropNotifications();
  }, [running, elapsed, schedule, firedDropTimes, longestSeconds]);

  useEffect(() => {
    if (!running) {
      lastElapsedRef.current = elapsed;
      return;
    }

    const previousElapsed = lastElapsedRef.current;

    const dueItems = schedule.filter((item) => {
      const dueAtStart =
        previousElapsed === 0 && elapsed === 0 && item.dropAt === 0;
      const dueInRange = item.dropAt > previousElapsed && item.dropAt <= elapsed;
      return (dueAtStart || dueInRange) && !firedDropTimes[item.id];
    });

    if (dueItems.length > 0) {
      const names = dueItems.map((i) => i.name).join(", ");
      setAlertMessage(`Drop in: ${names}`);
      beep();
      setFiredDropTimes((prev) => {
        const next = { ...prev };
        dueItems.forEach((i) => (next[i.id] = true));
        return next;
      });
    }

    if (longestSeconds > 0 && elapsed >= longestSeconds) {
      setRunning(false);
      setRunStartedAt(null);
      setPausedElapsed(longestSeconds);
      setAlertMessage("Done! Pull everything out.");
      beep();
    }

    lastElapsedRef.current = elapsed;
  }, [elapsed, schedule, firedDropTimes, running, longestSeconds]);

  function updateItem(id, field, value) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === "minutes" ? Math.max(0, Number(value)) : value,
            }
          : item,
      ),
    );
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "New item", minutes: 5 },
    ]);
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function reset() {
    setRunning(false);
    setRunStartedAt(null);
    setPausedElapsed(0);
    setElapsed(0);
    setAlertMessage("");
    setFiredDropTimes({});
    lastElapsedRef.current = 0;
    cancelAllNotifications();
  }

  function resetDefaults() {
    setItems(createDefaultItems());
    reset();
  }

  function startPause() {
    if (longestSeconds <= 0) return;

    if (running) {
      const currentElapsed = computeElapsedNow();
      setRunning(false);
      setRunStartedAt(null);
      setPausedElapsed(currentElapsed);
      setElapsed(currentElapsed);
      return;
    }

    if (elapsed >= longestSeconds) {
      setElapsed(0);
      setPausedElapsed(0);
      setAlertMessage("");
      setFiredDropTimes({});
      lastElapsedRef.current = 0;
    }

    setRunStartedAt(Date.now());
    setRunning(true);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
            Seafood Boil Multi-Stage Timer
          </h1>
          <p className="max-w-3xl text-base text-slate-600 md:text-lg">
            Add everything with its total cook time. The longest item starts first,
            then the timer tells you exactly when to drop in each shorter-cooking
            item so everything finishes together.
          </p>
        </motion.div>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="space-y-5 p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm uppercase tracking-wide text-slate-500">
                  Total boil time
                </div>
                <div className="text-5xl font-bold tabular-nums md:text-7xl">
                  {formatTime(remaining)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={startPause} className="rounded-2xl px-5 py-6 text-base">
                  {running ? (
                    <Pause className="mr-2 h-5 w-5" />
                  ) : (
                    <Play className="mr-2 h-5 w-5" />
                  )}
                  {running ? "Pause" : "Start"}
                </Button>
                <Button
                  onClick={reset}
                  variant="outline"
                  className="rounded-2xl px-5 py-6 text-base"
                >
                  <RotateCcw className="mr-2 h-5 w-5" /> Reset
                </Button>
              </div>
            </div>

            <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-slate-900 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {alertMessage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4"
              >
                <Bell className="h-6 w-6 shrink-0" />
                <div className="text-lg font-semibold">{alertMessage}</div>
              </motion.div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-5 md:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Food items</h2>
                <div className="flex gap-2">
                  <Button onClick={resetDefaults} variant="outline" className="rounded-2xl">
                    <RotateCcw className="mr-2 h-4 w-4" /> Reset defaults
                  </Button>
                  <Button onClick={addItem} variant="outline" className="rounded-2xl">
                    <Plus className="mr-2 h-4 w-4" /> Add
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_90px_40px] items-center gap-2"
                  >
                    <input
                      value={item.name}
                      onChange={(e) => updateItem(item.id, "name", e.target.value)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                    />
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={item.minutes}
                        onChange={(e) =>
                          updateItem(item.id, "minutes", e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 tabular-nums"
                      />
                      <span className="absolute top-2.5 right-2 text-xs text-slate-500">
                        min
                      </span>
                    </div>
                    <Button
                      onClick={() => removeItem(item.id)}
                      variant="ghost"
                      size="icon"
                      className="rounded-xl"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-5 md:p-6">
              <h2 className="text-2xl font-bold">Drop-in schedule</h2>
              <div className="space-y-3">
                {schedule.map((item) => {
                  const hasDropped = elapsed >= item.dropAt;
                  const isNext = nextDrop?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${
                        hasDropped
                          ? "border-emerald-200 bg-emerald-50"
                          : isNext
                            ? "border-slate-900 bg-white"
                            : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {hasDropped ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <Clock className="h-5 w-5" />
                        )}
                        <div>
                          <div className="font-semibold">{item.name}</div>
                          <div className="text-sm text-slate-500">
                            Cook time: {item.minutes} min
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-slate-500">Drop at</div>
                        <div className="font-bold tabular-nums">
                          {formatTime(item.dropAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-slate-500">
                Example: if potatoes are 20 minutes and crab legs are 6 minutes,
                crab legs drop at 14:00.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="space-y-2 p-5 text-sm text-slate-600 md:p-6">
            <h3 className="text-lg font-bold text-slate-900">Boil notes</h3>
            <p>
              Start the timer when the first/longest-cooking item goes into the
              boiling pot. Times are editable because seafood size, frozen vs
              thawed, and heat recovery after each drop can change real cook time.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

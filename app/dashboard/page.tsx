"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase, type Database } from "@/lib/supabase";

type Habit = Database["public"]["Tables"]["habits"]["Row"];

export default function DashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHabits = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("habits")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setHabits(data ?? []);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/auth");
        return;
      }
      setUserId(data.session.user.id);
      loadHabits(data.session.user.id).finally(() => setLoading(false));
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) router.replace("/auth");
      }
    );
    return () => listener.subscription.unsubscribe();
  }, [router, loadHabits]);

  async function handleAddHabit(e: FormEvent) {
    e.preventDefault();
    if (!userId || !name.trim()) return;

    const { error } = await supabase.from("habits").insert({
      user_id: userId,
      name: name.trim(),
      frequency: "daily",
    });
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    loadHabits(userId);
  }

  async function handleMarkDone(habit: Habit) {
    if (!userId) return;
    setError(null);
    const today = new Date().toISOString().slice(0, 10);

    const { data: existing, error: checkError } = await supabase
      .from("habit_logs")
      .select("id")
      .eq("habit_id", habit.id)
      .eq("date", today)
      .maybeSingle();
    if (checkError) {
      setError(checkError.message);
      return;
    }
    if (existing) return;

    const { error: logError } = await supabase.from("habit_logs").insert({
      habit_id: habit.id,
      date: today,
      completed: true,
    });
    if (logError) {
      setError(logError.message);
      return;
    }

    const newStreak = habit.current_streak + 1;
    const newLongest = Math.max(habit.longest_streak, newStreak);

    const { error: updateError } = await supabase
      .from("habits")
      .update({ current_streak: newStreak, longest_streak: newLongest })
      .eq("id", habit.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    loadHabits(userId);
  }

  async function handleDelete(habitId: string) {
    if (!userId) return;
    setError(null);

    const { error: logsError } = await supabase
      .from("habit_logs")
      .delete()
      .eq("habit_id", habitId);
    if (logsError) {
      setError(logsError.message);
      return;
    }

    const { error } = await supabase.from("habits").delete().eq("id", habitId);
    if (error) {
      setError(error.message);
      return;
    }
    loadHabits(userId);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/auth");
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Habits</h1>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Logout
          </button>
        </div>

        <form onSubmit={handleAddHabit} className="flex gap-2 mb-6">
          <input
            type="text"
            required
            placeholder="e.g. Pushups"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 text-sm font-medium"
          >
            Add
          </button>
        </form>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <ul className="space-y-3">
          {habits.map((habit) => (
            <li
              key={habit.id}
              className="bg-white rounded-lg shadow-sm px-4 py-3 flex items-center justify-between"
            >
              <div>
                <p className="font-medium">{habit.name}</p>
                <p className="text-sm text-gray-500">
                  Streak: {habit.current_streak}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleMarkDone(habit)}
                  className="text-sm bg-green-600 hover:bg-green-700 text-white rounded px-3 py-1.5"
                >
                  Mark done today
                </button>
                <button
                  onClick={() => handleDelete(habit.id)}
                  className="text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded px-3 py-1.5"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {habits.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">
              No habits yet — add one above.
            </p>
          )}
        </ul>
      </div>
    </main>
  );
}

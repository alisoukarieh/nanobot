"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import pb from "@/lib/pocketbase";
import type { Agent } from "@/lib/types";

interface WorkoutEntry {
  exercise: string;
  date: string;
  session: string;
  type: "push" | "pull" | "legs" | "calisthenics" | string;
  set: number;
  weight: number;
  reps: number;
  comment?: string;
  cycle?: number;
}

const typeColors: Record<string, string> = {
  push: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  pull: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  legs: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  calisthenics: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

export default function RecordsPage() {
  const params = useParams();
  const agentId = params.id as string;
  const [agent, setAgent] = useState<Agent | null>(null);
  const [entries, setEntries] = useState<WorkoutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    if (!agentId) return;
    pb.collection("agents").getOne<Agent>(agentId).then(setAgent).catch(() => {});
  }, [agentId]);

  useEffect(() => {
    if (!agent?.workspace_path) return;
    setLoading(true);
    fetch(`/api/workouts?workspace=${encodeURIComponent(agent.workspace_path)}`)
      .then((r) => r.json())
      .then((d) => setEntries(d.entries || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [agent?.workspace_path]);

  const sessions = useMemo(() => {
    const map = new Map<string, WorkoutEntry[]>();
    for (const e of entries) {
      if (filter !== "all" && e.type !== filter) continue;
      if (!map.has(e.session)) map.set(e.session, []);
      map.get(e.session)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries, filter]);

  const stats = useMemo(() => {
    const totalSets = entries.length;
    const uniqueSessions = new Set(entries.map((e) => e.session)).size;
    const uniqueExercises = new Set(entries.map((e) => e.exercise)).size;
    const lastDate = entries.reduce((max, e) => (e.date > max ? e.date : max), "");
    return { totalSets, uniqueSessions, uniqueExercises, lastDate };
  }, [entries]);

  const personalRecords = useMemo(() => {
    const prs: Record<string, { weight: number; reps: number; date: string }> = {};
    for (const e of entries) {
      const current = prs[e.exercise];
      if (!current || e.weight > current.weight || (e.weight === current.weight && e.reps > current.reps)) {
        prs[e.exercise] = { weight: e.weight, reps: e.reps, date: e.date };
      }
    }
    return Object.entries(prs)
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, 12);
  }, [entries]);

  const types = ["all", "push", "pull", "legs", "calisthenics"];

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-primary)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-[var(--text-primary)] tracking-[-0.02em]">
            Progressive Overload
          </h2>
          <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">
            Your gym records and progression history
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[var(--text-secondary)] text-sm">No records yet</p>
            <p className="text-[var(--text-tertiary)] text-xs mt-1">Log a workout with the agent to start tracking</p>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: "Total Sets", value: stats.totalSets },
                { label: "Sessions", value: stats.uniqueSessions },
                { label: "Exercises", value: stats.uniqueExercises },
                { label: "Last Workout", value: stats.lastDate || "—" },
              ].map((s) => (
                <div key={s.label} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-4 animate-in">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)] font-semibold">{s.label}</p>
                  <p className="text-[20px] font-bold text-[var(--text-primary)] mt-1 tracking-[-0.02em]">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Personal records */}
            <div className="mb-8">
              <h3 className="text-[11px] uppercase tracking-[0.1em] font-bold text-[var(--text-tertiary)] mb-3 px-1">Personal Records</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {personalRecords.map(([exercise, pr], i) => (
                  <div key={exercise} style={{ animationDelay: `${i * 20}ms` }}
                    className="animate-in bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3.5 hover:border-[var(--border-strong)] transition-colors">
                    <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">{exercise}</p>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-[18px] font-bold text-[var(--accent)]">{pr.weight}</span>
                      <span className="text-[11px] text-[var(--text-tertiary)] font-medium">kg</span>
                      <span className="text-[11px] text-[var(--text-tertiary)] ml-1">× {pr.reps}</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 font-mono">{pr.date}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
              {types.map((t) => (
                <button key={t} onClick={() => setFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-all whitespace-nowrap ${
                    filter === t
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)]"
                  }`}>
                  {t}
                </button>
              ))}
            </div>

            {/* Sessions timeline */}
            <h3 className="text-[11px] uppercase tracking-[0.1em] font-bold text-[var(--text-tertiary)] mb-3 px-1">Recent Sessions</h3>
            <div className="space-y-3">
              {sessions.slice(0, 20).map(([sessionKey, sets], idx) => {
                const type = sets[0]?.type || "—";
                const byExercise = new Map<string, WorkoutEntry[]>();
                for (const s of sets) {
                  if (!byExercise.has(s.exercise)) byExercise.set(s.exercise, []);
                  byExercise.get(s.exercise)!.push(s);
                }
                return (
                  <div key={sessionKey} style={{ animationDelay: `${idx * 20}ms` }}
                    className="animate-in bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${typeColors[type] || "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"}`}>
                          {type}
                        </span>
                        <span className="text-[12px] font-mono text-[var(--text-primary)]">{sets[0].date}</span>
                        <span className="text-[11px] text-[var(--text-tertiary)]">{sets.length} sets · {byExercise.size} exercises</span>
                      </div>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                      {Array.from(byExercise.entries()).map(([exercise, exSets]) => (
                        <div key={exercise} className="px-4 py-2.5 flex items-center justify-between gap-3">
                          <span className="text-[12.5px] font-medium text-[var(--text-primary)] truncate">{exercise}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {exSets.map((s, i) => (
                              <span key={i} className="text-[11px] font-mono text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded">
                                {s.weight}×{s.reps}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

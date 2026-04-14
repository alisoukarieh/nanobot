import { NextResponse } from "next/server";

const PB_URL = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://localhost:8090";

export async function GET() {
  try {
    const res = await fetch(`${PB_URL}/api/collections/workouts/records?perPage=500`);
    const data = await res.json();
    const entries = (data.items || []).map((r: any) => ({
      exercise: r.exercise,
      date: r.date,
      session: r.session,
      type: r.type,
      set: r.set,
      weight: r.weight,
      reps: r.reps,
      comment: r.comment,
      cycle: r.cycle,
    }));
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}

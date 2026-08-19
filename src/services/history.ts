import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ParsedPermit, RoutePlan } from "../types/permit";

const HISTORY_KEY = "truck_navigation_permit_history_v1";
const MAX_HISTORY_ENTRIES = 20;

export interface HistoryEntry {
  id: string;
  savedAt: string;
  permit: ParsedPermit;
  routePlan?: RoutePlan;
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export async function saveToHistory(
  permit: ParsedPermit,
  routePlan?: RoutePlan
): Promise<HistoryEntry> {
  const entry: HistoryEntry = {
    id: `${Date.now()}`,
    savedAt: new Date().toISOString(),
    permit,
    routePlan,
  };

  const existing = await loadHistory();
  const updated = [entry, ...existing].slice(0, MAX_HISTORY_ENTRIES);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  return entry;
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const existing = await loadHistory();
  const updated = existing.filter((entry) => entry.id !== id);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

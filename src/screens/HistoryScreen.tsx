import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { deleteHistoryEntry, loadHistory, type HistoryEntry } from "../services/history";

type Props = NativeStackScreenProps<RootStackParamList, "History">;

export default function HistoryScreen({ navigation }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadHistory().then(setEntries);
    }, [])
  );

  async function handleDelete(id: string) {
    await deleteHistoryEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No saved permits yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Pressable
            style={styles.cardBody}
            disabled={!item.routePlan}
            onPress={() => item.routePlan && navigation.navigate("RoutePreview", { routePlan: item.routePlan })}
          >
            <Text style={styles.permitNumber}>{item.permit.permitNumber ?? "Unnamed permit"}</Text>
            <Text style={styles.route}>
              {item.permit.originLabel ?? "?"} → {item.permit.destinationLabel ?? "?"}
            </Text>
            <Text style={styles.date}>{new Date(item.savedAt).toLocaleString()}</Text>
            {!item.routePlan && <Text style={styles.noRoute}>No route built</Text>}
          </Pressable>
          <Pressable onPress={() => handleDelete(item.id)} hitSlop={10}>
            <Text style={styles.delete}>Delete</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#9ca3af", fontSize: 15 },
  list: { padding: 16, gap: 10 },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardBody: { flex: 1, gap: 2 },
  permitNumber: { fontWeight: "700", fontSize: 15, color: "#111827" },
  route: { fontSize: 13, color: "#374151" },
  date: { fontSize: 12, color: "#9ca3af" },
  noRoute: { fontSize: 12, color: "#d97706", marginTop: 2 },
  delete: { color: "#dc2626", fontWeight: "600", marginLeft: 12 },
});

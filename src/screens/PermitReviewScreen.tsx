import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import type { ParsedPermit, RouteStep } from "../types/permit";
import { createBlankStep, reclassifyStepText } from "../services/permitParser";
import { getHereApiKey } from "../services/config";
import { geocodeRouteSteps } from "../services/geocode";
import { buildRouteFromWaypoints } from "../services/hereRouting";
import { saveToHistory } from "../services/history";

type Props = NativeStackScreenProps<RootStackParamList, "PermitReview">;

const CONFIDENCE_COLOR: Record<RouteStep["confidence"], string> = {
  high: "#16a34a",
  medium: "#d97706",
  low: "#dc2626",
};

function describeStep(step: RouteStep): string {
  const bits: string[] = [step.action];
  if (step.road) bits.push(step.road);
  if (step.direction) bits.push(step.direction);
  if (step.distanceMiles) bits.push(`${step.distanceMiles} mi`);
  if (step.exitNumber) bits.push(`Exit ${step.exitNumber}`);
  return bits.join(" · ");
}

export default function PermitReviewScreen({ navigation, route }: Props) {
  const [permit, setPermit] = useState<ParsedPermit>(route.params.permit);
  const [building, setBuilding] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");

  function updateStep(id: string, rawText: string) {
    setPermit((prev) => ({
      ...prev,
      steps: prev.steps.map((s) => (s.id === id ? reclassifyStepText(id, rawText) : s)),
    }));
  }

  function removeStep(id: string) {
    setPermit((prev) => ({ ...prev, steps: prev.steps.filter((s) => s.id !== id) }));
  }

  function moveStep(id: string, direction: -1 | 1) {
    setPermit((prev) => {
      const index = prev.steps.findIndex((s) => s.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.steps.length) return prev;
      const steps = [...prev.steps];
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...prev, steps };
    });
  }

  function addStep() {
    setPermit((prev) => ({ ...prev, steps: [...prev.steps, createBlankStep()] }));
  }

  async function handleBuildRoute() {
    const apiKey = await getHereApiKey();
    if (!apiKey) {
      Alert.alert(
        "HERE API key needed",
        "Add a free HERE developer API key in Settings before building a route.",
        [{ text: "Go to Settings", onPress: () => navigation.navigate("Settings") }]
      );
      return;
    }

    if (permit.steps.length < 2) {
      Alert.alert("Not enough steps", "A route needs at least a start and an end point.");
      return;
    }

    setBuilding(true);
    try {
      setProgressLabel("Locating waypoints…");
      const waypoints = await geocodeRouteSteps(permit, apiKey, (p) =>
        setProgressLabel(`Locating waypoints… (${p.completed}/${p.total})`)
      );

      setProgressLabel("Calculating route…");
      const result = await buildRouteFromWaypoints(waypoints, permit.truckProfile, apiKey);

      const routePlan = {
        permit,
        waypoints,
        polyline: result.polyline,
        maneuvers: result.maneuvers,
        distanceMeters: result.distanceMeters,
        durationSeconds: result.durationSeconds,
        hasDeviationWarning: result.warnings.length > 0,
      };

      await saveToHistory(permit, routePlan);

      if (result.warnings.length > 0) {
        Alert.alert(
          "Review before driving",
          result.warnings.map((w) => `• ${w.message}`).join("\n\n"),
          [{ text: "Continue", onPress: () => navigation.replace("RoutePreview", { routePlan }) }]
        );
      } else {
        navigation.replace("RoutePreview", { routePlan });
      }
    } catch (err) {
      Alert.alert("Couldn't build route", (err as Error).message);
    } finally {
      setBuilding(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Permit</Text>
      <View style={styles.headerGrid}>
        <LabeledInput
          label="Permit #"
          value={permit.permitNumber ?? ""}
          onChangeText={(v) => setPermit((p) => ({ ...p, permitNumber: v }))}
        />
        <LabeledInput
          label="State"
          value={permit.state ?? ""}
          onChangeText={(v) => setPermit((p) => ({ ...p, state: v }))}
        />
        <LabeledInput
          label="Origin"
          value={permit.originLabel ?? ""}
          onChangeText={(v) => setPermit((p) => ({ ...p, originLabel: v }))}
        />
        <LabeledInput
          label="Destination"
          value={permit.destinationLabel ?? ""}
          onChangeText={(v) => setPermit((p) => ({ ...p, destinationLabel: v }))}
        />
      </View>

      <Text style={styles.sectionTitle}>Route Steps</Text>
      <Text style={styles.helperText}>
        Edit any line that looks wrong before building the route - colors show how confident the
        parser is (green = confident, orange/red = check it).
      </Text>

      {permit.steps.map((step, index) => (
        <View key={step.id} style={[styles.stepCard, { borderLeftColor: CONFIDENCE_COLOR[step.confidence] }]}>
          <View style={styles.stepHeaderRow}>
            <Text style={styles.stepIndex}>{index + 1}</Text>
            <View style={styles.stepButtons}>
              <Pressable onPress={() => moveStep(step.id, -1)} hitSlop={8}>
                <Text style={styles.stepButtonText}>↑</Text>
              </Pressable>
              <Pressable onPress={() => moveStep(step.id, 1)} hitSlop={8}>
                <Text style={styles.stepButtonText}>↓</Text>
              </Pressable>
              <Pressable onPress={() => removeStep(step.id)} hitSlop={8}>
                <Text style={[styles.stepButtonText, styles.removeText]}>✕</Text>
              </Pressable>
            </View>
          </View>
          <TextInput
            style={styles.stepInput}
            value={step.rawText}
            onChangeText={(v) => updateStep(step.id, v)}
            multiline
          />
          <Text style={styles.stepMeta}>{describeStep(step)}</Text>
        </View>
      ))}

      <Pressable style={styles.addStepButton} onPress={addStep}>
        <Text style={styles.addStepText}>+ Add Step</Text>
      </Pressable>

      <Pressable
        style={[styles.buildButton, building && styles.buildButtonDisabled]}
        disabled={building}
        onPress={handleBuildRoute}
      >
        {building ? (
          <View style={styles.buildingRow}>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.buildButtonText}>{progressLabel || "Building route…"}</Text>
          </View>
        ) : (
          <Text style={styles.buildButtonText}>Build Route</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={styles.labeledInput}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChangeText} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginTop: 8 },
  helperText: { fontSize: 13, color: "#6b7280", marginBottom: 4 },
  headerGrid: { gap: 8 },
  labeledInput: { gap: 4 },
  inputLabel: { fontSize: 12, color: "#6b7280", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111827",
  },
  stepCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  stepHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stepIndex: { fontWeight: "700", color: "#374151" },
  stepButtons: { flexDirection: "row", gap: 16 },
  stepButtonText: { fontSize: 16, color: "#374151" },
  removeText: { color: "#dc2626" },
  stepInput: {
    fontSize: 14,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    padding: 8,
  },
  stepMeta: { fontSize: 12, color: "#6b7280", fontStyle: "italic" },
  addStepButton: { alignItems: "center", paddingVertical: 12 },
  addStepText: { color: "#2563eb", fontWeight: "600" },
  buildButton: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  buildButtonDisabled: { backgroundColor: "#93c5fd" },
  buildButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
  buildingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});

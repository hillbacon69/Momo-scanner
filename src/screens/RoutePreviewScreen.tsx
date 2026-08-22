import React from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import RouteMapView from "../components/RouteMapView";
import { buildGoogleMapsDirectionsLink } from "../services/googleMapsLink";
import { metersToMiles } from "../utils/geo";

type Props = NativeStackScreenProps<RootStackParamList, "RoutePreview">;

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours} hr ${minutes} min`;
}

export default function RoutePreviewScreen({ navigation, route }: Props) {
  const { routePlan } = route.params;

  function handleOpenGoogleMaps() {
    const link = buildGoogleMapsDirectionsLink(routePlan.waypoints);
    if (!link) {
      Alert.alert("Can't open Google Maps", "Not enough located waypoints to build a link.");
      return;
    }
    Alert.alert(
      "Opens in Google Maps",
      "Google Maps will recalculate its own path between these waypoints - it is not truck-aware and may not follow the exact permitted road between two points. Use in-app navigation as the primary route." +
        (link.waypointsDropped > 0
          ? `\n\n${link.waypointsDropped} waypoint(s) were thinned out to fit Google's link limit.`
          : ""),
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Anyway", onPress: () => Linking.openURL(link.url) },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <RouteMapView polyline={routePlan.polyline} waypoints={routePlan.waypoints} />
      </View>

      <ScrollView style={styles.details} contentContainerStyle={styles.detailsContent}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>{metersToMiles(routePlan.distanceMeters).toFixed(1)} mi</Text>
          <Text style={styles.summaryText}>{formatDuration(routePlan.durationSeconds)}</Text>
        </View>

        {routePlan.hasDeviationWarning && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              The routing engine flagged part of this route as uncertain. Review the turn list
              below against your printed permit before driving.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Turn-by-Turn</Text>
        {routePlan.maneuvers.map((m) => (
          <View key={m.index} style={styles.maneuverRow}>
            <Text style={styles.maneuverText}>{m.instruction}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.primaryButton]}
          onPress={() => navigation.navigate("Navigation", { routePlan })}
        >
          <Text style={styles.primaryButtonText}>Start Navigation</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={handleOpenGoogleMaps}>
          <Text style={styles.buttonText}>Open in Google Maps</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  mapContainer: { flex: 5 },
  details: { flex: 4, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  detailsContent: { padding: 16, gap: 8, paddingBottom: 24 },
  summaryRow: { flexDirection: "row", gap: 20 },
  summaryText: { fontSize: 18, fontWeight: "700", color: "#111827" },
  warningBanner: { backgroundColor: "#fef3c7", borderColor: "#f59e0b", borderWidth: 1, borderRadius: 8, padding: 10 },
  warningText: { color: "#92400e", fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginTop: 4 },
  maneuverRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  maneuverText: { fontSize: 14, color: "#374151" },
  actions: { flexDirection: "row", gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  button: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  primaryButton: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  buttonText: { fontWeight: "600", color: "#111827" },
  primaryButtonText: { fontWeight: "700", color: "#ffffff" },
});

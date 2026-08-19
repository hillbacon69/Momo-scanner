import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import type { RoutePlan } from "../types/permit";
import RouteMapView from "../components/RouteMapView";
import { NavigationEngine, type NavigationState } from "../services/navigationEngine";
import { getHereApiKey } from "../services/config";
import { buildRouteFromWaypoints } from "../services/hereRouting";
import { metersToFeet, metersToMiles, type LatLng } from "../utils/geo";

type Props = NativeStackScreenProps<RootStackParamList, "Navigation">;

function formatDistance(meters: number): string {
  if (meters >= 1609 * 0.2) return `${metersToMiles(meters).toFixed(1)} mi`;
  return `${Math.round(metersToFeet(meters) / 50) * 50} ft`;
}

export default function NavigationScreen({ navigation, route }: Props) {
  const [activePlan, setActivePlan] = useState<RoutePlan>(route.params.routePlan);
  const [navState, setNavState] = useState<NavigationState | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [recalculated, setRecalculated] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const engineRef = useRef<NavigationEngine | null>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    engineRef.current = new NavigationEngine({
      polyline: activePlan.polyline,
      maneuvers: activePlan.maneuvers,
      speak: (text) => Speech.speak(text),
      onStateChange: setNavState,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlan]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location needed", "Turn-by-turn navigation needs location access.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
        return;
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 8,
        },
        (position) => {
          if (cancelled) return;
          const point: LatLng = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setUserLocation(point);
          engineRef.current?.handlePositionUpdate(point);
        }
      );
      watcherRef.current = subscription;
    }

    start();

    return () => {
      cancelled = true;
      watcherRef.current?.remove();
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRecalculate() {
    if (!userLocation) return;
    const apiKey = await getHereApiKey();
    if (!apiKey) {
      Alert.alert("HERE API key needed", "Add a HERE API key in Settings to recalculate.");
      return;
    }

    setRecalculating(true);
    try {
      const destination = activePlan.waypoints[activePlan.waypoints.length - 1];
      const originWaypoint = {
        step: { ...destination.step, id: "recalc-origin", rawText: "Current location" },
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        matchQuality: "exact" as const,
      };

      const result = await buildRouteFromWaypoints(
        [originWaypoint, destination],
        activePlan.permit.truckProfile,
        apiKey
      );

      setActivePlan((prev) => ({
        ...prev,
        polyline: result.polyline,
        maneuvers: result.maneuvers,
        distanceMeters: result.distanceMeters,
        durationSeconds: result.durationSeconds,
      }));
      setRecalculated(true);
      engineRef.current?.reset();
    } catch (err) {
      Alert.alert("Couldn't recalculate", (err as Error).message);
    } finally {
      setRecalculating(false);
    }
  }

  function handleEnd() {
    Speech.stop();
    watcherRef.current?.remove();
    navigation.popToTop();
  }

  return (
    <View style={styles.container}>
      <View style={styles.instructionCard}>
        <Text style={styles.instructionText}>
          {navState?.upcomingManeuver?.instruction ?? "Follow the highlighted route"}
        </Text>
        {navState?.upcomingManeuver && (
          <Text style={styles.distanceText}>
            in {formatDistance(navState.distanceToNextManeuverMeters)}
          </Text>
        )}
        {navState && (
          <Text style={styles.remainingText}>
            {formatDistance(navState.distanceRemainingMeters)} remaining
          </Text>
        )}
      </View>

      {navState?.offRoute && (
        <View style={styles.offRouteBanner}>
          <Text style={styles.offRouteText}>Off the permitted route</Text>
          <Pressable
            style={styles.recalculateButton}
            onPress={handleRecalculate}
            disabled={recalculating}
          >
            <Text style={styles.recalculateText}>
              {recalculating ? "Recalculating…" : "Recalculate"}
            </Text>
          </Pressable>
        </View>
      )}

      {recalculated && (
        <View style={styles.recalculatedBanner}>
          <Text style={styles.recalculatedText}>
            Recalculated to destination only - this no longer follows the permit's designated
            route. Verify remaining turns against your printed permit.
          </Text>
        </View>
      )}

      <View style={styles.mapContainer}>
        <RouteMapView
          polyline={activePlan.polyline}
          userLocation={userLocation}
          followUser
          offRoute={navState?.offRoute}
        />
      </View>

      <Pressable style={styles.endButton} onPress={handleEnd}>
        <Text style={styles.endButtonText}>End Navigation</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  instructionCard: { backgroundColor: "#111827", padding: 20, gap: 4 },
  instructionText: { color: "#ffffff", fontSize: 20, fontWeight: "700" },
  distanceText: { color: "#93c5fd", fontSize: 16, fontWeight: "600" },
  remainingText: { color: "#9ca3af", fontSize: 13, marginTop: 4 },
  offRouteBanner: {
    backgroundColor: "#fee2e2",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  offRouteText: { color: "#991b1b", fontWeight: "700" },
  recalculateButton: { backgroundColor: "#b91c1c", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  recalculateText: { color: "#ffffff", fontWeight: "600" },
  recalculatedBanner: { backgroundColor: "#fef3c7", padding: 10 },
  recalculatedText: { color: "#92400e", fontSize: 12 },
  mapContainer: { flex: 1 },
  endButton: { backgroundColor: "#111827", paddingVertical: 16, alignItems: "center" },
  endButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
});

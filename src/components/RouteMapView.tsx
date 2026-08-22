import React, { useMemo, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from "react-native-maps";
import { regionForCoordinates, type LatLng } from "../utils/geo";
import type { GeocodedWaypoint } from "../types/permit";

interface RouteMapViewProps {
  polyline: LatLng[];
  waypoints?: GeocodedWaypoint[];
  userLocation?: LatLng | null;
  followUser?: boolean;
  offRoute?: boolean;
}

export default function RouteMapView({
  polyline,
  waypoints = [],
  userLocation,
  followUser = false,
  offRoute = false,
}: RouteMapViewProps) {
  const mapRef = useRef<MapView>(null);

  const initialRegion = useMemo(
    () => regionForCoordinates(polyline) ?? {
      latitude: 31.9686,
      longitude: -99.9018,
      latitudeDelta: 5,
      longitudeDelta: 5,
    },
    [polyline]
  );

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        region={followUser && userLocation ? {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        } : undefined}
        showsUserLocation
        showsMyLocationButton
        showsCompass
      >
        {polyline.length > 1 && (
          <Polyline
            coordinates={polyline}
            strokeWidth={5}
            strokeColor={offRoute ? "#b91c1c" : "#2563eb"}
          />
        )}
        {waypoints.map((wp, i) => (
          <Marker
            key={wp.step.id}
            coordinate={{ latitude: wp.latitude, longitude: wp.longitude }}
            title={wp.step.road ?? wp.step.landmark ?? `Waypoint ${i + 1}`}
            description={wp.step.rawText}
            pinColor={wp.matchQuality === "unresolved" ? "orange" : undefined}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});

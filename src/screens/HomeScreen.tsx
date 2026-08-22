import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export default function HomeScreen({ navigation }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Truck Navigation</Text>
      <Text style={styles.subtitle}>Oversize load permit route navigation</Text>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          Always verify the route shown here against your printed permit before driving. You
          are responsible for following the exact permitted route.
        </Text>
      </View>

      <Pressable style={[styles.button, styles.primaryButton]} onPress={() => navigation.navigate("Scanner")}>
        <Text style={styles.primaryButtonText}>Scan Permit QR Code</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={() => navigation.navigate("ManualEntry")}>
        <Text style={styles.buttonText}>Paste Route Text</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={() => navigation.navigate("History")}>
        <Text style={styles.buttonText}>Permit History</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={() => navigation.navigate("Settings")}>
        <Text style={styles.buttonText}>Settings</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 72, gap: 12 },
  title: { fontSize: 28, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 15, color: "#6b7280", marginBottom: 16 },
  disclaimer: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  disclaimerText: { color: "#92400e", fontSize: 13, lineHeight: 18 },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  primaryButton: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#111827", textAlign: "center" },
  primaryButtonText: { fontSize: 16, fontWeight: "700", color: "#ffffff", textAlign: "center" },
});

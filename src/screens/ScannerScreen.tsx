import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { PermitFetchError, resolvePermitQrPayload } from "../services/permitFetch";
import { parsePermitText } from "../services/permitParser";

type Props = NativeStackScreenProps<RootStackParamList, "Scanner">;

export default function ScannerScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [processing, setProcessing] = useState(false);
  const [scanned, setScanned] = useState(false);

  if (!permission) {
    return <View style={styles.center} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>Camera access is needed to scan the permit's QR code.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Camera Access</Text>
        </Pressable>
      </View>
    );
  }

  async function handleScan(data: string) {
    if (scanned || processing) return;
    setScanned(true);
    setProcessing(true);
    try {
      const resolved = await resolvePermitQrPayload(data);
      const permit = parsePermitText(resolved.rawText, resolved.sourceType, resolved.sourceUrl);

      if (permit.steps.length === 0) {
        Alert.alert(
          "No route found",
          "This QR code didn't seem to contain a recognizable permit route. You can still review the raw text and add steps manually.",
          [{ text: "Continue", onPress: () => navigation.replace("PermitReview", { permit }) }]
        );
        return;
      }

      navigation.replace("PermitReview", { permit });
    } catch (err) {
      const message =
        err instanceof PermitFetchError
          ? err.message
          : `Couldn't read this permit: ${(err as Error).message}`;
      Alert.alert("Couldn't read permit", message, [
        { text: "Try Again", onPress: () => setScanned(false) },
        { text: "Paste Route Text Instead", onPress: () => navigation.replace("ManualEntry") },
      ]);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : (result) => handleScan(result.data)}
      />
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>Point the camera at the QR code on your permit</Text>
        {processing && (
          <View style={styles.processing}>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.processingText}>Reading permit…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  message: { textAlign: "center", fontSize: 15, color: "#374151" },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  frame: {
    width: 260,
    height: 260,
    borderWidth: 3,
    borderColor: "#ffffff",
    borderRadius: 16,
    backgroundColor: "transparent",
  },
  hint: { color: "#ffffff", marginTop: 20, fontSize: 15 },
  processing: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  processingText: { color: "#ffffff", fontSize: 14 },
  button: { backgroundColor: "#2563eb", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20 },
  buttonText: { color: "#ffffff", fontWeight: "600", fontSize: 15 },
});

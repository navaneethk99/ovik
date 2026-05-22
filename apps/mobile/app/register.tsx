import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  Dimensions,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';

const { width } = Dimensions.get('window');

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  // Use passed server backend URL, fallback to localhost
  const backendUrl = (params.backendUrl as string) || 'http://localhost:8080';

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  // Form Fields State
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [compensation, setCompensation] = useState('');
  const [age, setAge] = useState('');
  const [address, setAddress] = useState('');
  const [panCard, setPanCard] = useState('');
  const [aadhaarCard, setAadhaarCard] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfJoining, setDateOfJoining] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');

  // UI state
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [capturing, setCapturing] = useState(false);

  if (!permission) {
    // Camera permissions are still loading.
    return (
      <View style={[styles.loadingContainer, isDark && { backgroundColor: '#020617' }]}>
        <ActivityIndicator size="large" color={isDark ? '#2dd4bf' : '#0f766e'} />
      </View>
    );
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View style={[styles.permissionContainer, isDark && { backgroundColor: '#020617' }]}>
        <Text style={[styles.permissionTitle, isDark && { color: '#f1f5f9' }]}>Camera Access Required</Text>
        <Text style={styles.permissionDesc}>
          Ovik Mobile needs access to your camera to capture employee enrollment face pictures.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        base64: true,
      });
      if (photo?.base64) {
        setPhotoBase64(photo.base64);
        Alert.alert('Success', 'Face image captured successfully!');
      } else {
        Alert.alert('Error', 'Failed to retrieve image data.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Camera capture failed.');
    } finally {
      setCapturing(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Employee name is required.');
      return;
    }
    if (!photoBase64) {
      Alert.alert('Validation Error', 'Please capture the employee\'s face image before registering.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${backendUrl}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          position: position.trim(),
          compensation: compensation.trim(),
          age: parseInt(age) || 0,
          address: address.trim(),
          pan_card: panCard.trim(),
          aadhaar_card: aadhaarCard.trim(),
          email: email.trim(),
          phone: phone.trim(),
          date_of_joining: dateOfJoining.trim(),
          emergency_contact: emergencyContact.trim(),
          image: photoBase64, // Base64 raw image string
        }),
      });

      if (response.ok) {
        Alert.alert('Success', `Employee ${name} registered successfully!`, [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        const errText = await response.text();
        Alert.alert('Registration Failed', errText || 'Server returned an error.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Network Error', 'Cannot reach backend server.');
    } finally {
      setSubmitting(false);
    }
  };

  const themeStyles = getStyles(isDark);

  return (
    <ScrollView style={themeStyles.container} contentContainerStyle={themeStyles.content}>
      
      {/* Live Camera Feed */}
      <View style={themeStyles.cameraWrapper}>
        <CameraView style={themeStyles.camera} ref={cameraRef} facing="front">
          {/* Visual Positioning Overlay Guide */}
          <View style={themeStyles.overlayContainer}>
            {/* Dashed face oval contour */}
            <View style={themeStyles.faceOval} />
            {/* Guide Text */}
            <Text style={themeStyles.overlayGuideText}>Position face inside the oval</Text>
            {/* Corner Crosshairs */}
            <View style={[themeStyles.hairline, themeStyles.hairlineTopLeft]} />
            <View style={[themeStyles.hairline, themeStyles.hairlineTopRight]} />
            <View style={[themeStyles.hairline, themeStyles.hairlineBottomLeft]} />
            <View style={[themeStyles.hairline, themeStyles.hairlineBottomRight]} />
          </View>
        </CameraView>
        <TouchableOpacity
          style={[themeStyles.captureBtn, capturing && { opacity: 0.7 }]}
          onPress={handleCapture}
          disabled={capturing}
        >
          {capturing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={themeStyles.captureBtnText}>📸 Take Photo</Text>
          )}
        </TouchableOpacity>
        {photoBase64 && (
          <Text style={themeStyles.capturedBadge}>✓ Face image recorded</Text>
        )}
      </View>

      {/* Inputs Form */}
      <View style={themeStyles.formCard}>
        <Text style={themeStyles.formSectionHeader}>Personal Information</Text>
        
        <Text style={themeStyles.label}>Full Name *</Text>
        <TextInput
          style={themeStyles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. John Doe"
          placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
        />

        <View style={themeStyles.row}>
          <View style={{ flex: 1 }}>
            <Text style={themeStyles.label}>Age</Text>
            <TextInput
              style={themeStyles.input}
              value={age}
              onChangeText={setAge}
              placeholder="e.g. 30"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1.5 }}>
            <Text style={themeStyles.label}>Phone</Text>
            <TextInput
              style={themeStyles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 9999999999"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <Text style={themeStyles.label}>Email Address</Text>
        <TextInput
          style={themeStyles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="john.doe@company.com"
          placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={themeStyles.label}>Residential Address</Text>
        <TextInput
          style={[themeStyles.input, { height: 80, paddingVertical: 10 }]}
          value={address}
          onChangeText={setAddress}
          placeholder="Enter complete residential address"
          placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
          multiline
        />

        <Text style={themeStyles.formSectionHeader}>Employment Details</Text>

        <Text style={themeStyles.label}>Position / Designation</Text>
        <TextInput
          style={themeStyles.input}
          value={position}
          onChangeText={setPosition}
          placeholder="e.g. Senior Software Engineer"
          placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
        />

        <View style={themeStyles.row}>
          <View style={{ flex: 1 }}>
            <Text style={themeStyles.label}>Compensation</Text>
            <TextInput
              style={themeStyles.input}
              value={compensation}
              onChangeText={setCompensation}
              placeholder="e.g. $90,000"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={themeStyles.label}>Date of Joining</Text>
            <TextInput
              style={themeStyles.input}
              value={dateOfJoining}
              onChangeText={setDateOfJoining}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
            />
          </View>
        </View>

        <Text style={themeStyles.label}>Emergency Contact Phone</Text>
        <TextInput
          style={themeStyles.input}
          value={emergencyContact}
          onChangeText={setEmergencyContact}
          placeholder="+91 9888888888"
          placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
          keyboardType="phone-pad"
        />

        <Text style={themeStyles.formSectionHeader}>Identity Verification</Text>

        <View style={themeStyles.row}>
          <View style={{ flex: 1 }}>
            <Text style={themeStyles.label}>PAN Card Number</Text>
            <TextInput
              style={themeStyles.input}
              value={panCard}
              onChangeText={setPanCard}
              placeholder="ABCDE1234F"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              autoCapitalize="characters"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={themeStyles.label}>Aadhaar Card Number</Text>
            <TextInput
              style={themeStyles.input}
              value={aadhaarCard}
              onChangeText={setAadhaarCard}
              placeholder="1234 5678 9012"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[themeStyles.submitBtn, submitting && { opacity: 0.7 }]}
          onPress={handleRegister}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={themeStyles.submitBtnText}>Register & Enroll Face</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
  },
  permissionDesc: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  permissionBtn: {
    height: 48,
    backgroundColor: '#0f766e',
    borderRadius: 8,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#020617' : '#f8fafc',
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    cameraWrapper: {
      alignItems: 'center',
      marginBottom: 20,
    },
    camera: {
      width: width - 32,
      height: (width - 32) * 0.75, // 4:3 Ratio
      borderRadius: 16,
      overflow: 'hidden',
    },
    overlayContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.25)',
    },
    faceOval: {
      width: 140,
      height: 190,
      borderRadius: 75,
      borderWidth: 2,
      borderColor: '#2dd4bf',
      borderStyle: 'dashed',
    },
    overlayGuideText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: 'bold',
      marginTop: 10,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
    },
    hairline: {
      position: 'absolute',
      width: 20,
      height: 20,
      borderColor: '#2dd4bf',
    },
    hairlineTopLeft: {
      top: 20,
      left: 20,
      borderTopWidth: 3,
      borderLeftWidth: 3,
    },
    hairlineTopRight: {
      top: 20,
      right: 20,
      borderTopWidth: 3,
      borderRightWidth: 3,
    },
    hairlineBottomLeft: {
      bottom: 20,
      left: 20,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
    },
    hairlineBottomRight: {
      bottom: 20,
      right: 20,
      borderBottomWidth: 3,
      borderRightWidth: 3,
    },
    captureBtn: {
      marginTop: 12,
      height: 44,
      backgroundColor: isDark ? '#1e293b' : '#0f766e',
      borderRadius: 22,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#2dd4bf33' : 'transparent',
    },
    captureBtnText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: 'bold',
    },
    capturedBadge: {
      color: '#10b981',
      fontSize: 13,
      fontWeight: 'bold',
      marginTop: 8,
    },
    formCard: {
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    formSectionHeader: {
      fontSize: 15,
      fontWeight: 'bold',
      color: isDark ? '#2dd4bf' : '#0f766e',
      marginTop: 12,
      marginBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#1e293b' : '#f1f5f9',
      paddingBottom: 4,
    },
    label: {
      fontSize: 12,
      fontWeight: 'bold',
      color: isDark ? '#94a3b8' : '#64748b',
      marginBottom: 6,
      marginTop: 8,
    },
    input: {
      height: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#cbd5e1',
      paddingHorizontal: 12,
      fontSize: 14,
      color: isDark ? '#f1f5f9' : '#0f172a',
      backgroundColor: isDark ? '#020617' : '#f8fafc',
      marginBottom: 8,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    submitBtn: {
      marginTop: 24,
      height: 50,
      backgroundColor: isDark ? '#2dd4bf' : '#0f766e',
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitBtnText: {
      color: isDark ? '#0f172a' : '#ffffff',
      fontSize: 15,
      fontWeight: 'bold',
    },
  });

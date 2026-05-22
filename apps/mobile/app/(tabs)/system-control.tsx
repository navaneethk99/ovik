import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Switch,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';

type ServiceStatus = {
  name: string;
  status: 'running' | 'stopped' | 'error';
  port: string;
  type: string;
};

export default function SystemControlScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  // Fallback default backend URL
  const backendUrl = 'http://localhost:8080';

  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    'INIT: Initializing core controllers...',
    'INFO: REST API listening on port 8080',
    'INFO: Database client connected to postgres://ovik_db',
  ]);

  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'REST Backend', status: 'running', port: '8080', type: 'Go REST Service' },
    { name: 'Face Recognizer', status: 'running', port: 'N/A', type: 'Python Daemon Process' },
    { name: 'TTS Audio Engine', status: 'running', port: 'N/A', type: 'Google TTS Library' },
  ]);

  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((prev) => [`[${time}] ${message}`, ...prev.slice(0, 49)]);
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${backendUrl}/control/status`);
      const data = await res.json();
      setActive(!!data.active);
      
      // Update local recognizer service status card
      setServices((prev) =>
        prev.map((s) =>
          s.name === 'Face Recognizer'
            ? { ...s, status: data.active ? 'running' : 'stopped' }
            : s
        )
      );
    } catch (e) {
      addLog('ERR: Failed to sync controller status.');
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async () => {
    setLoading(true);
    const newStatus = !active;
    addLog(`CMD: Initiating controller status toggle to ${newStatus ? 'ACTIVE' : 'INACTIVE'}`);
    
    try {
      const res = await fetch(`${backendUrl}/control/toggle`, {
        method: 'POST',
      });
      const data = await res.json();
      setActive(!!data.active);
      addLog(`SUCCESS: Controller status updated to ${data.active ? 'ACTIVE' : 'INACTIVE'}`);
      
      setServices((prev) =>
        prev.map((s) =>
          s.name === 'Face Recognizer'
            ? { ...s, status: data.active ? 'running' : 'stopped' }
            : s
        )
      );
    } catch (e) {
      addLog('ERR: Network error toggle request timed out.');
    } finally {
      setLoading(false);
    }
  };

  const styles = getStyles(isDark);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Controller Toggle Card */}
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Face Scan Controller</Text>
            <Text style={styles.cardSubtitle}>
              Toggle active attendance scanning camera and face recognition daemon.
            </Text>
          </View>
          <Switch
            value={active}
            onValueChange={handleToggle}
            disabled={loading}
            trackColor={{ false: '#767577', true: '#2dd4bf' }}
            thumbColor={active ? '#0f766e' : '#f4f3f4'}
          />
        </View>
      </View>

      {/* Services Subsystem Cards */}
      <Text style={styles.sectionHeader}>Subsystems & Services</Text>
      {services.map((service, index) => (
        <View key={index} style={styles.serviceItem}>
          <View>
            <Text style={styles.serviceName}>{service.name}</Text>
            <Text style={styles.serviceType}>{service.type} • Port {service.port}</Text>
          </View>
          <View style={[styles.statusBadge, service.status === 'running' ? styles.badgeRunning : styles.badgeStopped]}>
            <Text style={[styles.statusText, service.status === 'running' ? styles.textRunning : styles.textStopped]}>
              {service.status.toUpperCase()}
            </Text>
          </View>
        </View>
      ))}

      {/* CLI Diagnostic Logs */}
      <Text style={styles.sectionHeader}>Terminal Diagnostics Console</Text>
      <View style={styles.consoleContainer}>
        <View style={styles.consoleHeader}>
          <View style={styles.consoleButtons}>
            <View style={[styles.consoleBtn, { backgroundColor: '#ef4444' }]} />
            <View style={[styles.consoleBtn, { backgroundColor: '#eab308' }]} />
            <View style={[styles.consoleBtn, { backgroundColor: '#22c55e' }]} />
          </View>
          <Text style={styles.consoleHeaderTitle}>bash - diagnostics@ovik-system</Text>
        </View>
        <ScrollView style={styles.consoleBody} contentContainerStyle={styles.consoleLogsScroll}>
          {logs.map((log, i) => (
            <Text key={i} style={styles.consoleLogText}>
              {log}
            </Text>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

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
    card: {
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: isDark ? '#f1f5f9' : '#0f172a',
      marginBottom: 6,
    },
    cardSubtitle: {
      fontSize: 12,
      color: isDark ? '#64748b' : '#94a3b8',
      lineHeight: 16,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    sectionHeader: {
      fontSize: 16,
      fontWeight: 'bold',
      color: isDark ? '#f1f5f9' : '#0f172a',
      marginBottom: 12,
      marginTop: 8,
    },
    serviceItem: {
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      borderRadius: 12,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      borderWidth: 1,
      borderColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    serviceName: {
      fontSize: 14,
      fontWeight: 'bold',
      color: isDark ? '#f1f5f9' : '#0f172a',
    },
    serviceType: {
      fontSize: 12,
      color: isDark ? '#64748b' : '#94a3b8',
      marginTop: 2,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    badgeRunning: {
      backgroundColor: '#22c55e15',
    },
    badgeStopped: {
      backgroundColor: '#ef444415',
    },
    statusText: {
      fontSize: 11,
      fontWeight: 'bold',
    },
    textRunning: {
      color: '#22c55e',
    },
    textStopped: {
      color: '#ef4444',
    },
    consoleContainer: {
      backgroundColor: '#090d16',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#1e293b',
      overflow: 'hidden',
      height: 240,
    },
    consoleHeader: {
      backgroundColor: '#151e33',
      height: 36,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
    },
    consoleButtons: {
      flexDirection: 'row',
      gap: 6,
      position: 'absolute',
      left: 12,
    },
    consoleBtn: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    consoleHeaderTitle: {
      flex: 1,
      textAlign: 'center',
      color: '#94a3b8',
      fontSize: 11,
      fontFamily: 'monospace',
    },
    consoleBody: {
      flex: 1,
      padding: 12,
    },
    consoleLogsScroll: {
      paddingBottom: 20,
    },
    consoleLogText: {
      fontFamily: 'monospace',
      fontSize: 11,
      color: '#34d399',
      lineHeight: 16,
      marginBottom: 4,
    },
  });

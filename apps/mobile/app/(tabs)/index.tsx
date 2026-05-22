import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';

type AttendanceRecord = {
  id: number;
  name: string;
  recognized_at: string;
};

export default function DashboardScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Server state - allows custom IP for physical devices/simulators
  const [backendUrl, setBackendUrl] = useState('http://localhost:8080');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [systemActive, setSystemActive] = useState(false);

  const fetchRecords = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Fetch attendance logs
      const res = await fetch(`${backendUrl}/attendance?limit=50`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);

      // Fetch controller status
      const statusRes = await fetch(`${backendUrl}/control/status`);
      const statusData = await statusRes.json();
      setSystemActive(!!statusData.active);
    } catch (e) {
      console.error('Failed to fetch data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRecords();
    const interval = setInterval(() => fetchRecords(true), 5000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecords(true);
  };

  const filteredRecords = records.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  // Themes
  const styles = getStyles(isDark);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#2dd4bf' : '#0f766e'} />
      }
    >
      {/* Backend Settings */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Backend Server Connection</Text>
        <Text style={styles.cardSubtitle}>
          Use your local machine's IP (e.g. http://192.168.x.x:8080) for testing on simulators or physical devices.
        </Text>
        <TextInput
          style={styles.input}
          value={backendUrl}
          onChangeText={setBackendUrl}
          placeholder="http://localhost:8080"
          placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Action and Status Cards */}
      <View style={styles.row}>
        <View style={[styles.card, styles.statusCard]}>
          <Text style={styles.statLabel}>Status</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, systemActive ? styles.dotActive : styles.dotInactive]} />
            <Text style={styles.statValue}>{systemActive ? 'Active' : 'Offline'}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.card, styles.actionCard]}
          onPress={() => router.push({
            pathname: '/register',
            params: { backendUrl }
          })}
        >
          <Text style={styles.actionText}>👤 Register Face</Text>
          <Text style={styles.actionSubtext}>Enroll new employee</Text>
        </TouchableOpacity>
      </View>

      {/* Search Logs */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Search Attendance Logs</Text>
        <TextInput
          style={styles.input}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by employee name..."
          placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
        />
      </View>

      {/* Logs Table */}
      <Text style={styles.sectionHeader}>Recent Check-Ins ({filteredRecords.length})</Text>

      {loading ? (
        <ActivityIndicator size="large" color={isDark ? '#2dd4bf' : '#0f766e'} style={{ marginTop: 20 }} />
      ) : filteredRecords.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No check-in logs found.</Text>
        </View>
      ) : (
        filteredRecords.map((item) => (
          <View key={item.id} style={styles.logItem}>
            <View style={styles.logLeft}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name[0]?.toUpperCase()}</Text>
              </View>
              <View>
                <Text style={styles.logName}>{item.name}</Text>
                <Text style={styles.logTime}>
                  {new Date(item.recognized_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </Text>
              </View>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Present</Text>
            </View>
          </View>
        ))
      )}
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
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    statusCard: {
      flex: 1,
    },
    actionCard: {
      flex: 1.2,
      backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
      borderColor: isDark ? '#2dd4bf33' : '#0f766e33',
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
      marginBottom: 12,
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
    },
    statLabel: {
      fontSize: 12,
      color: isDark ? '#64748b' : '#94a3b8',
      marginBottom: 4,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    dotActive: {
      backgroundColor: '#10b981',
    },
    dotInactive: {
      backgroundColor: '#ef4444',
    },
    statValue: {
      fontSize: 18,
      fontWeight: 'bold',
      color: isDark ? '#f1f5f9' : '#0f172a',
    },
    actionText: {
      fontSize: 16,
      fontWeight: 'bold',
      color: isDark ? '#2dd4bf' : '#0f766e',
      marginBottom: 4,
    },
    actionSubtext: {
      fontSize: 12,
      color: isDark ? '#94a3b8' : '#64748b',
    },
    sectionHeader: {
      fontSize: 16,
      fontWeight: 'bold',
      color: isDark ? '#f1f5f9' : '#0f172a',
      marginBottom: 12,
      marginTop: 8,
    },
    emptyContainer: {
      padding: 32,
      alignItems: 'center',
    },
    emptyText: {
      color: isDark ? '#64748b' : '#94a3b8',
      fontSize: 14,
    },
    logItem: {
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
    logLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? '#334155' : '#cbd5e1',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 16,
      fontWeight: 'bold',
      color: isDark ? '#f1f5f9' : '#0f172a',
    },
    logName: {
      fontSize: 14,
      fontWeight: 'bold',
      color: isDark ? '#f1f5f9' : '#0f172a',
    },
    logTime: {
      fontSize: 12,
      color: isDark ? '#64748b' : '#94a3b8',
      marginTop: 2,
    },
    badge: {
      backgroundColor: isDark ? '#10b98115' : '#10b98110',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#10b98130',
    },
    badgeText: {
      color: '#10b981',
      fontSize: 12,
      fontWeight: '600',
    },
  });

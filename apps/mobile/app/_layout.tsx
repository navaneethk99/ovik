import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="register" 
          options={{ 
            title: 'Register Employee', 
            presentation: 'modal',
            headerStyle: {
              backgroundColor: isDark ? '#0f172a' : '#ffffff',
            },
            headerTintColor: isDark ? '#2dd4bf' : '#0f766e',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }} 
        />
      </Stack>
    </>
  );
}

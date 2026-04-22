import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthStack from './navigation/AuthStack';
import MainTabs from './navigation/MainTabs';
import { AuthProvider, useAuth } from './context/AuthContext';

function RootNavigator() {
  const { user, login } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const userData = await AsyncStorage.getItem('user');
        if (token && userData) {
          await login(JSON.parse(userData), token);
        }
      } catch (e) {}
      setLoading(false);
    };
    restore();
  }, []);

  if (loading) return null;

  return user ? <MainTabs /> : <AuthStack />;
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
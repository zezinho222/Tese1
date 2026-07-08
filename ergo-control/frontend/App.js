import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthStack from './navigation/AuthStack';
import MainTabs from './navigation/MainTabs';
import { AuthProvider, useAuth } from './context/AuthContext';
import syncService from './syncService';

function RootNavigator() {
  const { user, login, token } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('token');
        const userData = await AsyncStorage.getItem('user');
        if (storedToken && userData) {
          await login(JSON.parse(userData), storedToken);
        }
      } catch (e) {}
      setLoading(false);
    };
    restore();
  }, []);

  // Regista o listener de conectividade uma vez, mantendo sempre o token atual.
  useEffect(() => {
    syncService.initNetworkListener(() => token);
    return () => syncService.stopNetworkListener();
  }, [token]);

  // Tenta sincronizar logo que houver um token disponível (ex: app reaberta já com internet).
  useEffect(() => {
    if (token) syncService.trySyncAll(token);
  }, [token]);

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
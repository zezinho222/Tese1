import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthStack from './navigation/AuthStack';
import MainTabs from './navigation/MainTabs';
import { AuthProvider, useAuth } from './context/AuthContext';
import syncService from './syncService';
import moduleService from './moduleService';
import notificationService from './notificationService';

// RootNavigator é o componente que decide se o utilizador está autenticado ou não, e mostra o ecrã correspondente
function RootNavigator() {
  const { user, login, token } = useAuth();
  const [loading, setLoading] = useState(true);

  // Tenta restaurar sessão quando a app inicia (login automatico se houver token guardado)
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

  // Tenta sincronizar logo que houver um token disponível
  useEffect(() => {
    if (token) syncService.trySyncAll(token);
  }, [token]);

  // Manda uma notificação se o módulo se desligar inesperadamente
  useEffect(() => {
    moduleService.addCloseListener('app', ({ expected } = {}) => {
      if (expected) return;   // fecho pedido pela app, não é uma queda
      notificationService.notifyDevice(
        'Módulo desligou-se',
        'A ligação à rede Wi-Fi do módulo foi perdida.'
      );
    });
    return () => moduleService.removeCloseListener('app');
  }, []);

  // Se o módulo estiver a monitorizar, continua mesmo que a app vá para segundo plano
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if ((state === 'background' || state === 'inactive') && !moduleService.isMonitoring()) {
        moduleService.disconnect();
      }
    });
    return () => sub.remove();
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